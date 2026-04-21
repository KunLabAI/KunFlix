"""媒体文件保存工具 — 支持用户级目录隔离"""
import asyncio
from pathlib import Path
import uuid
import logging

logger = logging.getLogger(__name__)

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"

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
