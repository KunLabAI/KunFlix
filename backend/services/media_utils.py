"""媒体文件保存工具"""
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


def save_inline_image(mime_type: str, data: bytes) -> str:
    """保存 inline_data 图片，返回 /api/media/{uuid}.{ext} 路径"""
    MEDIA_DIR.mkdir(exist_ok=True)
    ext = MIME_TO_EXT.get(mime_type, "png")
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = MEDIA_DIR / filename
    filepath.write_bytes(data)
    logger.info(f"Saved image: {filename} ({len(data)} bytes, {mime_type})")
    return f"/api/media/{filename}"


async def save_video_from_url(video_url: str, headers: dict | None = None) -> str:
    """从远端 URL 下载视频并保存到本地，返回 /api/media/{uuid}.mp4 路径
    
    Args:
        video_url: 视频下载 URL
        headers: 可选的请求头 (如 Gemini 需要 x-goog-api-key)
    """
    import httpx

    MEDIA_DIR.mkdir(exist_ok=True)
    filename = f"{uuid.uuid4()}.mp4"
    filepath = MEDIA_DIR / filename

    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(video_url, headers=headers)
        resp.raise_for_status()
        filepath.write_bytes(resp.content)

    logger.info(f"Saved video: {filename} ({len(resp.content)} bytes) from {video_url}")
    return f"/api/media/{filename}"


# Content-Type → MIME 推断映射
_CONTENT_TYPE_TO_MIME = {
    "image/png": "image/png",
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/webp": "image/webp",
    "image/gif": "image/gif",
}


async def save_image_from_url(image_url: str) -> str:
    """从远端 URL 下载图片并保存到本地，返回 /api/media/{uuid}.{ext} 路径"""
    import httpx

    MEDIA_DIR.mkdir(exist_ok=True)

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(image_url)
        resp.raise_for_status()
        data = resp.content

    # 通过 Content-Type 推断 MIME，回退到 image/png
    content_type = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
    mime = _CONTENT_TYPE_TO_MIME.get(content_type, "image/png")

    return save_inline_image(mime, data)
