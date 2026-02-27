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
