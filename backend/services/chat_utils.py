"""
Chat shared utilities: SSE formatting, content serialization, multimodal media helpers.

Shared by routers/chats.py, routers/admin_debug.py, and chat generation modules.
"""
import asyncio
import json
import base64
import mimetypes
import re
from typing import Any
from pathlib import Path

from services.media_utils import MEDIA_DIR, resolve_media_filepath


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
ATTACHMENTS_PATTERN = re.compile(r"<!-- __ATTACHMENTS__(\[.*?\]) -->", re.DOTALL)

# 单次消息最多注入的图片附件数量（避免 base64 撑爆上下文窗口）
MAX_ATTACHMENT_IMAGES = 5
# 单次消息最多注入的视频/音频附件数量（体积更大，限制更严）
MAX_ATTACHMENT_MEDIA = 2
# 单个媒体文件 inline_data 大小上限（20MB，Gemini inline_data 限制）
MAX_MEDIA_SIZE_BYTES = 20 * 1024 * 1024


# 需要剥离的多模态 content part 类型集合
_MULTIMODAL_PART_TYPES = frozenset({"image_url", "inline_data", "input_audio"})


def strip_multimodal_parts(messages: list[dict]) -> list[dict]:
    """Strip all multimodal content parts (image/video/audio) from messages.

    Converts multimodal messages back to text-only format for models that
    do not support vision/audio/video input.
    """
    stripped = []
    for msg in messages:
        content = msg.get("content")
        # 纯文本或非 list 内容：保持原样
        if not isinstance(content, list):
            stripped.append(msg)
            continue
        # 多模态 list：过滤掉所有媒体 parts，只保留 text
        text_parts = [p for p in content if isinstance(p, dict) and p.get("type") not in _MULTIMODAL_PART_TYPES]
        # 合并所有 text 为单一字符串（剥离多模态格式）
        merged_text = "\n".join(p.get("text", "") for p in text_parts if p.get("type") == "text").strip()
        stripped.append({**msg, "content": merged_text or "(media attachment - model does not support multimodal input)"})
    return stripped


# 向后兼容别名
strip_image_parts = strip_multimodal_parts


_URL_EXTRACTORS = [
    (lambda u: "/api/media/" in u, lambda u: u.split("/api/media/")[-1].split("?")[0]),
    (lambda u: "/media/" in u,     lambda u: u.split("/media/")[-1].split("?")[0]),
    (lambda u: u.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mp3", ".wav", ".webm", ".ogg", ".aac")), lambda u: u.split("/")[-1]),
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
            resolved = resolve_media_filepath(filename)
            return str(resolved) if resolved else None
    return None


def _image_file_to_data_url_sync(path: str) -> str | None:
    """Read a local image file and convert to data URL (synchronous, for thread offload)."""
    file_path = Path(path)
    if not file_path.exists():
        return None

    mime, _ = mimetypes.guess_type(str(file_path))
    mime = mime or "image/png"
    data = file_path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


async def image_file_to_data_url(path: str) -> str | None:
    """Read a local image file and convert to data URL for multimodal input."""
    return await asyncio.to_thread(_image_file_to_data_url_sync, path)


def inject_image_to_message(msg: dict, data_url: str):
    """Inject image data_url into user message content (multimodal)."""
    user_content = msg.get("content")
    _builders = {
        str:  lambda c: [{"type": "image_url", "image_url": {"url": data_url}}, {"type": "text", "text": c}],
        list: lambda c: [{"type": "image_url", "image_url": {"url": data_url}}] + list(c),
    }
    builder = _builders.get(type(user_content), lambda c: [{"type": "image_url", "image_url": {"url": data_url}}])
    msg["content"] = builder(user_content)


def _media_file_to_inline_data_sync(path: str) -> dict | None:
    """Read a local media file and build inline_data part (synchronous, for thread offload).

    Returns {"type": "inline_data", "inline_data": {"mime_type": ..., "data": base64_str}}
    or None if file missing/too large.
    """
    file_path = Path(path)
    if not file_path.exists():
        return None
    # 大小检查
    file_size = file_path.stat().st_size
    if file_size > MAX_MEDIA_SIZE_BYTES:
        return None
    mime, _ = mimetypes.guess_type(str(file_path))
    mime = mime or "application/octet-stream"
    data = file_path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    return {"type": "inline_data", "inline_data": {"mime_type": mime, "data": b64}}


async def media_file_to_inline_data(path: str) -> dict | None:
    """Read a local media file and build inline_data part for multimodal input (async)."""
    return await asyncio.to_thread(_media_file_to_inline_data_sync, path)


async def inject_attachment_media(msg: dict) -> list[str]:
    """Parse __ATTACHMENTS__ metadata from message text, inject image/video/audio attachments.

    - image nodes → image_url (data URL) format (unchanged)
    - video/audio nodes → inline_data format (new)

    Returns list of injected filenames for logging.
    """
    content = msg.get("content", "")
    raw_text = content if isinstance(content, str) else next(
        (p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text" and "<!-- __ATTACHMENTS__" in p.get("text", "")),
        "",
    )
    match = ATTACHMENTS_PATTERN.search(raw_text)
    if not match:
        return []

    try:
        attachments = json.loads(match.group(1))
    except (json.JSONDecodeError, TypeError):
        return []

    # ── 图片附件注入（保持原有 image_url 格式） ──
    image_urls = [
        (a.get("thumbnailUrl", ""), a.get("label", ""))
        for a in attachments
        if isinstance(a, dict) and a.get("nodeType") == "image" and a.get("thumbnailUrl")
    ][:MAX_ATTACHMENT_IMAGES]

    image_filenames = [extract_media_filename(url) for url, _ in image_urls]
    image_resolved = [(fn, resolve_media_filepath(fn)) for fn in image_filenames if fn]
    image_tasks = [(fn, p) for fn, p in image_resolved if p]
    image_data_urls = await asyncio.gather(*[
        image_file_to_data_url(str(p)) for _, p in image_tasks
    ]) if image_tasks else []

    media_parts: list[dict] = []
    injected: list[str] = []

    for (fn, _), data_url in zip(image_tasks, image_data_urls):
        if not data_url:
            continue
        media_parts.append({"type": "image_url", "image_url": {"url": data_url}})
        media_parts.append({"type": "text", "text": f"[Image source path: /api/media/{fn} \u2014 use this path when passing to tools, do NOT pass base64 data]"})
        injected.append(fn)

    # ── 视频/音频附件注入（新增 inline_data 格式） ──
    av_attachments = [
        (a.get("thumbnailUrl", ""), a.get("label", ""), a.get("nodeType", ""))
        for a in attachments
        if isinstance(a, dict) and a.get("nodeType") in ("video", "audio") and a.get("thumbnailUrl")
    ][:MAX_ATTACHMENT_MEDIA]

    av_filenames = [extract_media_filename(url) for url, _, _ in av_attachments]
    av_resolved = [(fn, resolve_media_filepath(fn), ntype) for fn, (_, _, ntype) in zip(av_filenames, av_attachments) if fn and resolve_media_filepath(fn)]
    av_inline_results = await asyncio.gather(*[
        media_file_to_inline_data(str(p)) for _, p, _ in av_resolved
    ]) if av_resolved else []

    for (fn, _, ntype), inline_part in zip(av_resolved, av_inline_results):
        if not inline_part:
            continue
        media_parts.append(inline_part)
        media_parts.append({"type": "text", "text": f"[{ntype.capitalize()} source path: /api/media/{fn} \u2014 use this path when passing to tools]"})
        injected.append(fn)

    if not media_parts:
        return []

    # Prepend media parts to message content
    existing = msg.get("content")
    text_parts = [{"type": "text", "text": existing}] if isinstance(existing, str) else (list(existing) if isinstance(existing, list) else [])
    msg["content"] = media_parts + text_parts
    return injected


# 向后兼容别名
inject_attachment_images = inject_attachment_media
