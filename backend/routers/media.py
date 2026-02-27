"""媒体文件服务路由"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import re

router = APIRouter(prefix="/api/media", tags=["media"])

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"

# 安全文件名：UUID + 已知图片扩展名
_SAFE_FILENAME = re.compile(r'^[a-f0-9\-]{36}\.(png|jpg|jpeg|webp|gif)$')

# 扩展名 -> MIME
_EXT_MIME = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
}


@router.get("/{filename}")
async def serve_media(filename: str):
    """安全地提供媒体文件"""
    matched = _SAFE_FILENAME.match(filename)
    if not matched:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = MEDIA_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")

    ext = filename.rsplit(".", 1)[-1]
    return FileResponse(
        filepath,
        media_type=_EXT_MIME.get(ext, "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=31536000"},
    )
