"""媒体文件保存工具 — 支持用户级目录隔离"""
import asyncio
import shutil
import subprocess
from pathlib import Path
import uuid
import logging
import re

logger = logging.getLogger(__name__)


def is_within_directory(path: Path, base_dir: Path) -> bool:
    """检查 path 归一化后是否位于 base_dir 内。"""
    try:
        path.resolve().relative_to(base_dir.resolve())
        return True
    except ValueError:
        return False

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"

# 缩略图缓存目录（首页/列表场景使用，原图保持不变）
THUMB_DIR_NAME = "_thumbs"
THUMB_DIR = MEDIA_DIR / THUMB_DIR_NAME
THUMB_MAX_SIZE = 480  # 长边像素，覆盖 2x dpr 下卡片 ~240px 显示宽度

# 视频 poster（首帧封面）缓存目录
POSTER_DIR = THUMB_DIR / "poster"
POSTER_MAX_SIZE = 480

# 视频扩展名集合（用于 poster 生成判定）
_VIDEO_EXTS = {"mp4", "webm", "mov", "ogg"}

# 服务层二次校验：仅允许 UUID + 视频扩展名
_SAFE_POSTER_FILENAME = re.compile(r'^[a-f0-9\-]{36}\.(mp4|webm|mov|ogg)$')

# 媒体 API 前缀（用于 URL 改写）
MEDIA_URL_PREFIX = "/api/media/"
THUMB_URL_PREFIX = "/api/media/thumb/"

# MIME -> 扩展名映射
MIME_TO_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
}

# 音频 MIME -> 扩展名映射
AUDIO_MIME_TO_EXT = {
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
}

# 扩展名 -> 文件类型分类（用于目录隔离和解析）
_EXT_TO_FILE_TYPE = {
    "png": "image", "jpg": "image", "jpeg": "image", "webp": "image", "gif": "image",
    "mp4": "video", "webm": "video", "mov": "video",
    "mp3": "audio", "wav": "audio", "ogg": "audio",
}

# ---------------------------------------------------------------------------
# 路径构建 / 解析工具
# ---------------------------------------------------------------------------

# 路径构建策略映射表（避免 if 分支）
_path_builder = {
    True:  lambda uid, ft, fn: (MEDIA_DIR / uid / ft / fn, f"{uid}/{ft}/{fn}"),
    False: lambda uid, ft, fn: (MEDIA_DIR / fn, fn),
}


def build_media_storage_path(user_id: str | None, file_type: str, filename: str) -> tuple[Path, str]:
    """构建媒体文件存储路径，自动创建目录。

    Returns:
        (absolute_path, relative_path):
        - 有 user_id: (MEDIA_DIR/user_id/file_type/filename, "user_id/file_type/filename")
        - 无 user_id: (MEDIA_DIR/filename, filename)
    """
    filepath, relative = _path_builder[bool(user_id)](user_id, file_type, filename)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    return filepath, relative


def get_relative_path(user_id: str | None, file_type: str, filename: str) -> str:
    """纯路径计算（无 I/O），返回相对于 MEDIA_DIR 的存储路径。"""
    return _path_builder[bool(user_id)](user_id, file_type, filename)[1]


def resolve_media_filepath(filename: str) -> Path | None:
    """根据文件名解析实际磁盘路径（兼容平铺和用户隔离两种结构）。

    解析链（列表驱动，无 if 分支）：
    1. MEDIA_DIR / filename — 平铺旧文件 O(1)
    2. MEDIA_DIR / * / {type} / filename — 按扩展名推断类型，定向 glob
    """
    # 候选 1：平铺路径
    flat = MEDIA_DIR / filename
    candidates = [flat]

    # 候选 2：用户目录 glob（按扩展名推断类型）
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    file_type = _EXT_TO_FILE_TYPE.get(ext, "")
    file_type and candidates.extend(MEDIA_DIR.glob(f"*/{file_type}/{filename}"))

    return next((p for p in candidates if p.is_file()), None)


# Content-Type -> MIME 推断映射
_CONTENT_TYPE_TO_MIME = {
    "image/png": "image/png",
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/webp": "image/webp",
    "image/gif": "image/gif",
}


# ---------------------------------------------------------------------------
# 文件保存函数（均支持可选 user_id 隔离）
# ---------------------------------------------------------------------------

async def save_inline_image(mime_type: str, data: bytes, user_id: str | None = None) -> str:
    """保存 inline_data 图片，返回 /api/media/{uuid}.{ext} 路径"""
    ext = MIME_TO_EXT.get(mime_type, "png")
    filename = f"{uuid.uuid4()}.{ext}"
    filepath, _rel = build_media_storage_path(user_id, "image", filename)
    await asyncio.to_thread(filepath.write_bytes, data)
    logger.info(f"Saved image: {filename} ({len(data)} bytes, {mime_type})")
    return f"/api/media/{filename}"


async def save_inline_image_with_path(mime_type: str, data: bytes, user_id: str | None = None) -> tuple[str, str]:
    """保存图片并返回 (url, relative_path)，供需要 file_path 的调用者使用。"""
    ext = MIME_TO_EXT.get(mime_type, "png")
    filename = f"{uuid.uuid4()}.{ext}"
    filepath, relative = build_media_storage_path(user_id, "image", filename)
    await asyncio.to_thread(filepath.write_bytes, data)
    logger.info(f"Saved image: {filename} ({len(data)} bytes, {mime_type})")
    return f"/api/media/{filename}", relative


async def save_video_from_url(video_url: str, headers: dict | None = None, user_id: str | None = None) -> str:
    """从远端 URL 下载视频并保存到本地，返回 /api/media/{uuid}.mp4 路径

    Args:
        video_url: 视频下载 URL
        headers: 可选的请求头 (如 Gemini 需要 x-goog-api-key)
        user_id: 可选的用户 ID（用于目录隔离）
    """
    import httpx

    filename = f"{uuid.uuid4()}.mp4"
    filepath, _rel = build_media_storage_path(user_id, "video", filename)

    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(video_url, headers=headers)
        resp.raise_for_status()
        await asyncio.to_thread(filepath.write_bytes, resp.content)

    logger.info(f"Saved video: {filename} ({len(resp.content)} bytes) from {video_url}")

    # 后台异步预热 poster（fire-and-forget，不阻塞调用方返回）
    # 不取于 ffmpeg 是否可用 — 不可用时 schedule_video_poster_generation 会静默回退
    asyncio.create_task(schedule_video_poster_generation(filename))

    return f"/api/media/{filename}"


async def save_image_from_url(image_url: str, user_id: str | None = None) -> str:
    """从远端 URL 下载图片并保存到本地，返回 /api/media/{uuid}.{ext} 路径"""
    import httpx

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(image_url)
        resp.raise_for_status()
        data = resp.content

    # 通过 Content-Type 推断 MIME，回退到 image/png
    content_type = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
    mime = _CONTENT_TYPE_TO_MIME.get(content_type, "image/png")

    return await save_inline_image(mime, data, user_id=user_id)


async def save_audio_data(audio_bytes: bytes, mime_type: str, user_id: str | None = None) -> str:
    """保存音频数据，返回 /api/media/{uuid}.{ext} 路径"""
    ext = AUDIO_MIME_TO_EXT.get(mime_type, "mp3")
    filename = f"{uuid.uuid4()}.{ext}"
    filepath, _rel = build_media_storage_path(user_id, "audio", filename)
    await asyncio.to_thread(filepath.write_bytes, audio_bytes)
    logger.info("Saved audio: %s (%d bytes, %s)", filename, len(audio_bytes), mime_type)
    return f"/api/media/{filename}"


# ---------------------------------------------------------------------------
# 缩略图：按需生成 + 落盘缓存（仅本地后端使用，S3 后端走原图重定向）
# ---------------------------------------------------------------------------

# Pillow 保存参数：扩展名 -> (format, save_kwargs)
_PIL_SAVE_PARAMS = {
    "jpg":  ("JPEG", {"quality": 82, "optimize": True, "progressive": True}),
    "jpeg": ("JPEG", {"quality": 82, "optimize": True, "progressive": True}),
    "png":  ("PNG",  {"optimize": True}),
    "webp": ("WEBP", {"quality": 82, "method": 6}),
    "gif":  ("GIF",  {}),
}

# JPEG 不支持透明通道，需要先转换的 mode 集合
_JPEG_NON_RGB_MODES = {"RGBA", "LA", "P"}

# 是否需要在保存前转 RGB（表驱动避免 if-else）
_NEEDS_RGB_CONVERT = {
    ("jpg",  True): True,  ("jpg",  False): False,
    ("jpeg", True): True,  ("jpeg", False): False,
}


def to_thumb_url(url: str) -> str:
    """将媒体 URL 改写为缩略图 URL；非本地媒体或已是 thumb 时原样返回。

    /api/media/abc.png      → /api/media/thumb/abc.png
    /api/media/thumb/x.png  → 原样
    https://cdn.x/y.png     → 原样
    """
    is_media = url.startswith(MEDIA_URL_PREFIX)
    is_thumb = url.startswith(THUMB_URL_PREFIX)
    rewriters = {
        (True,  False): lambda u: THUMB_URL_PREFIX + u[len(MEDIA_URL_PREFIX):],
        (True,  True):  lambda u: u,
        (False, False): lambda u: u,
    }
    return rewriters[(is_media, is_thumb)](url)


def _generate_image_thumbnail(src: Path, dst: Path, max_size: int) -> None:
    """同步生成等比缩略图：长边 ≤ max_size。写入临时文件再原子替换，避免并发读到半成品。"""
    from PIL import Image, ImageOps

    ext = dst.suffix.lstrip(".").lower()
    fmt, save_kwargs = _PIL_SAVE_PARAMS.get(ext, _PIL_SAVE_PARAMS["jpg"])
    tmp = dst.with_suffix(dst.suffix + f".{uuid.uuid4().hex}.tmp")

    with Image.open(src) as img:
        # 按 EXIF orientation 修正方向（手机拍摄常见）
        img = ImageOps.exif_transpose(img)
        # JPEG 不支持透明，需要时先合到白底
        needs_rgb = _NEEDS_RGB_CONVERT.get((ext, img.mode in _JPEG_NON_RGB_MODES), False)
        needs_rgb and (img := img.convert("RGB"))
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        img.save(tmp, format=fmt, **save_kwargs)

    tmp.replace(dst)


async def ensure_thumbnail(filename: str, max_size: int = THUMB_MAX_SIZE) -> Path | None:
    """确保 filename 的缩略图已存在，返回缩略图磁盘路径；原文件缺失返回 None。

    缓存命中：直接返回；未命中：在线程池里调用 Pillow 生成。
    """
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    thumb_path = THUMB_DIR / filename

    # 已落盘 → 命中，直接返回
    if thumb_path.is_file():
        return thumb_path

    src = resolve_media_filepath(filename)
    if src is None:
        return None

    try:
        await asyncio.to_thread(_generate_image_thumbnail, src, thumb_path, max_size)
    except Exception as exc:
        logger.warning("Thumbnail generation failed for %s: %s", filename, exc)
        return None

    return thumb_path


# ---------------------------------------------------------------------------
# 视频 poster（首帧封面）：ffmpeg 抽帧 + 落盘缓存
# ---------------------------------------------------------------------------

def _resolve_ffmpeg_binary() -> str | None:
    """获取 ffmpeg 可执行文件路径。

    优先使用 imageio-ffmpeg 提供的静态二进制（pip 安装自带，跨平台），
    回退到系统 PATH 上的 ffmpeg。两者都不存在返回 None。
    """
    try:
        from imageio_ffmpeg import get_ffmpeg_exe
        return get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg")


def _generate_video_poster(src: Path, dst: Path, max_size: int) -> bool:
    """同步抽取视频首帧作为 poster JPG。写临时文件再原子替换，避免并发读到半成品。

    成功返回 True；ffmpeg 不可用 / 抽帧失败返回 False。
    """
    ffmpeg = _resolve_ffmpeg_binary()
    if not ffmpeg:
        logger.debug("ffmpeg binary not available, skip poster generation: %s", src.name)
        return False

    tmp = dst.with_suffix(dst.suffix + f".{uuid.uuid4().hex}.tmp")
    # -ss 1 跳到 1 秒位置抽帧（避开常见黑帧开场）；视频不足 1 秒 ffmpeg 会回退到首帧。
    # scale='min(W,iw)':-2 保证长边 ≤ W 且高度为偶数。
    cmd = [
        ffmpeg,
        "-y",
        "-ss", "1",
        "-i", str(src),
        "-frames:v", "1",
        "-vf", f"scale='min({max_size},iw)':-2",
        "-q:v", "6",
        "-loglevel", "error",
        str(tmp),
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        success = result.returncode == 0 and tmp.is_file() and tmp.stat().st_size > 0
        if not success:
            tmp.exists() and tmp.unlink(missing_ok=True)
            logger.warning(
                "ffmpeg poster generation failed for %s: rc=%s stderr=%s",
                src.name, result.returncode, (result.stderr or b"").decode(errors="ignore")[:300],
            )
            return False
        tmp.replace(dst)
        return True
    except subprocess.TimeoutExpired:
        tmp.exists() and tmp.unlink(missing_ok=True)
        logger.warning("ffmpeg poster generation timeout: %s", src.name)
        return False
    except Exception as exc:
        tmp.exists() and tmp.unlink(missing_ok=True)
        logger.warning("ffmpeg poster generation error for %s: %s", src.name, exc)
        return False


async def ensure_video_poster(video_filename: str, max_size: int = POSTER_MAX_SIZE) -> Path | None:
    """确保视频 poster 已生成，返回 poster 磁盘路径。

    - 缓存路径：MEDIA_DIR / _thumbs / poster / {video_filename}.jpg
    - 原文件缺失 / ffmpeg 不可用 / 非视频扩展名 → 返回 None
    """
    if not _SAFE_POSTER_FILENAME.match(video_filename):
        logger.warning("Rejected unsafe poster filename: %s", video_filename)
        return None

    if "." not in video_filename:
        return None
    stem, ext = video_filename.rsplit(".", 1)
    ext = ext.lower()
    if ext not in _VIDEO_EXTS:
        return None
    try:
        safe_stem = str(uuid.UUID(stem))
    except ValueError:
        logger.warning("Rejected unsafe poster stem: %s", video_filename)
        return None

    safe_video_filename = f"{safe_stem}.{ext}"

    POSTER_DIR.mkdir(parents=True, exist_ok=True)
    poster_path = (POSTER_DIR / f"{safe_video_filename}.jpg").resolve()
    if not is_within_directory(poster_path, POSTER_DIR):
        logger.warning("Rejected unsafe poster path for filename: %s", video_filename)
        return None

    # 已落盘 → 命中
    if poster_path.is_file():
        return poster_path

    src = resolve_media_filepath(video_filename)
    if src is None:
        return None

    ok = await asyncio.to_thread(_generate_video_poster, src, poster_path, max_size)
    return poster_path if ok else None


async def schedule_video_poster_generation(video_filename: str) -> None:
    """fire-and-forget 预热：在后台异步生成视频 poster，失败不抛异常。

    调用位置：
      - 用户上传视频成功后
      - AI 生成视频保存完成后
    提前生成使前端首次访问 /api/media/poster/* 即命中缓存。
    """
    try:
        await ensure_video_poster(video_filename)
    except Exception as exc:
        logger.warning("Background video poster generation failed for %s: %s", video_filename, exc)
