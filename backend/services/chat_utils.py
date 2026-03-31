"""
Chat shared utilities: SSE formatting, content serialization, image helpers.

Shared by routers/chats.py, routers/admin_debug.py, and chat generation modules.
"""
import json
import base64
import mimetypes
import re
from typing import Any
from pathlib import Path

from services.media_utils import MEDIA_DIR


def sse(event: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def serialize_content(content: Any) -> str:
    """Serialize message content: list -> JSON string, string as-is."""
    return json.dumps(content, ensure_ascii=False) if isinstance(content, list) else str(content)


def deserialize_content(content: str) -> Any:
    """Deserialize message content: try JSON parse, fallback to raw string."""
    try:
        parsed = json.loads(content)
        return parsed if isinstance(parsed, (list, dict)) else content
    except (json.JSONDecodeError, TypeError):
        return content


IMAGE_MD_PATTERN = re.compile(r"!\[image\]\((/api/media/[^)]+)\)")


_URL_EXTRACTORS = [
    (lambda u: "/api/media/" in u, lambda u: u.split("/api/media/")[-1].split("?")[0]),
    (lambda u: "/media/" in u,     lambda u: u.split("/media/")[-1].split("?")[0]),
    (lambda u: u.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")), lambda u: u.split("/")[-1]),
]


def extract_media_filename(url: str) -> str | None:
    """Extract media filename from various URL formats.

    Supports:
      - /api/media/xxx.png
      - http://localhost:8000/api/media/xxx.png
      - xxx.png (bare filename)
    """
    return next((ext(url) for chk, ext in _URL_EXTRACTORS if chk(url)), None)


def get_last_image_path(history) -> str | None:
    """Find the local file path of the last assistant image in message history."""
    for msg in reversed(history):
        if getattr(msg, "role", None) != "assistant":
            continue
        content = getattr(msg, "content", "") or ""
        if not isinstance(content, str):
            continue
        m = IMAGE_MD_PATTERN.search(content)
        if m:
            url = m.group(1)  # /api/media/xxxx.png
            filename = url.rsplit("/", 1)[-1]
            return str(MEDIA_DIR / filename)
    return None


def image_file_to_data_url(path: str) -> str | None:
    """Read a local image file and convert to data URL for multimodal input."""
    file_path = Path(path)
    if not file_path.exists():
        return None

    mime, _ = mimetypes.guess_type(str(file_path))
    mime = mime or "image/png"
    data = file_path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def inject_image_to_message(msg: dict, data_url: str):
    """Inject image data_url into user message content (multimodal)."""
    user_content = msg.get("content")
    _builders = {
        str:  lambda c: [{"type": "image_url", "image_url": {"url": data_url}}, {"type": "text", "text": c}],
        list: lambda c: [{"type": "image_url", "image_url": {"url": data_url}}] + list(c),
    }
    builder = _builders.get(type(user_content), lambda c: [{"type": "image_url", "image_url": {"url": data_url}}])
    msg["content"] = builder(user_content)
