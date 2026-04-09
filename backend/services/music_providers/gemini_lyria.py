"""
gemini_lyria — Google Gemini Lyria 3 音乐生成适配器。

支持模型:
  - lyria-3-clip-preview  (30 秒短片, 仅 MP3)
  - lyria-3-pro-preview   (完整歌曲, MP3/WAV)

使用 generateContent REST API，同步返回音频 + 歌词。
"""
from __future__ import annotations

import base64
import logging
from typing import Any

import asyncio

import httpx

from services.music_providers.base import MusicContext, MusicResult, MusicProviderAdapter

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 模型能力映射表
# ---------------------------------------------------------------------------
_MODEL_CAPS: dict[str, dict[str, Any]] = {
    "lyria-3-clip-preview": {
        "formats": ("mp3",),
        "max_duration_hint": "30s",
    },
    "lyria-3-pro-preview": {
        "formats": ("mp3", "wav"),
        "max_duration_hint": "~2min",
    },
}

# output_format -> responseMimeType 映射
_FORMAT_MIME: dict[str, str] = {
    "wav": "audio/wav",
}

# API 基础 URL
_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

# 请求超时 — 音乐生成耗时较长，read 阶段需要更长等待
_TIMEOUT = httpx.Timeout(connect=30.0, read=300.0, write=30.0, pool=30.0)

# 暂时性错误重试配置
_MAX_RETRIES = 2
_RETRY_BACKOFF = 3.0
_RETRYABLE_ERRORS = (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError)


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------
class GeminiLyriaAdapter(MusicProviderAdapter):
    """Gemini Lyria 3 音乐生成适配器。"""

    SUPPORTED_MODELS = list(_MODEL_CAPS.keys())

    async def generate(self, ctx: MusicContext) -> MusicResult:
        """调用 Gemini generateContent API 生成音乐。"""
        # ---- 构建 contents.parts ----
        parts: list[dict] = [{"text": ctx.prompt}]

        # 参考图片（最多 10 张）
        for img in ctx.reference_images[:10]:
            url = img.get("url", "")
            mime = img.get("mime_type", "image/jpeg")
            # 仅处理 data URI 格式（本地文件已由调用方转换）
            b64_data = _extract_base64(url)
            parts.append({
                "inlineData": {
                    "mimeType": mime,
                    "data": b64_data,
                }
            }) if b64_data else None

        # ---- 构建 generationConfig ----
        gen_config: dict[str, Any] = {
            "responseModalities": ["AUDIO", "TEXT"],
        }

        # WAV 格式仅 Pro 模型支持
        caps = _MODEL_CAPS.get(ctx.model, {})
        effective_format = ctx.output_format
        allowed_formats = caps.get("formats", ("mp3",))
        effective_format = effective_format if effective_format in allowed_formats else "mp3"

        response_mime = _FORMAT_MIME.get(effective_format)
        response_mime and gen_config.update(responseMimeType=response_mime)

        # ---- 构建请求体 ----
        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": gen_config,
        }

        url = f"{_API_BASE}/models/{ctx.model}:generateContent"
        headers = {
            "x-goog-api-key": ctx.api_key,
            "Content-Type": "application/json",
        }

        # ---- 发起请求（带重试）----
        last_error: str = ""
        for attempt in range(_MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                    resp = await client.post(url, json=payload, headers=headers)
                return _parse_response(resp, effective_format)
            except httpx.TimeoutException:
                return MusicResult(status="failed", error="Music generation request timed out (300s)")
            except _RETRYABLE_ERRORS as exc:
                last_error = f"HTTP error: {exc}"
                logger.warning("Lyria3 request attempt %d/%d failed (retryable): %s", attempt + 1, _MAX_RETRIES + 1, exc)
                (attempt < _MAX_RETRIES) and await asyncio.sleep(_RETRY_BACKOFF * (2 ** attempt))
            except httpx.HTTPError as exc:
                return MusicResult(status="failed", error=f"HTTP error: {exc}")

        return MusicResult(status="failed", error=last_error or "All retry attempts exhausted")


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------

def _extract_base64(data_uri: str) -> str:
    """从 data URI 中提取 base64 数据，非 data URI 返回空字符串。"""
    prefix = "data:"
    marker = ";base64,"
    is_data_uri = data_uri.startswith(prefix) and marker in data_uri
    return data_uri.split(marker, 1)[1] if is_data_uri else ""


def _parse_response(resp: httpx.Response, effective_format: str) -> MusicResult:
    """解析 Gemini generateContent 响应。"""
    # HTTP 错误
    status_ok = 200 <= resp.status_code < 300
    error_body = ""
    try:
        error_body = resp.json().get("error", {}).get("message", resp.text[:500]) if not status_ok else ""
    except Exception:
        error_body = resp.text[:500] if not status_ok else ""

    if not status_ok:
        logger.error("Lyria3 API error %d: %s", resp.status_code, error_body)
        return MusicResult(status="failed", error=f"Lyria3 API error ({resp.status_code}): {error_body}")

    data = resp.json()

    # ---- 调试日志：打印响应结构（临时使用 WARNING 级别确保可见）----
    logger.warning("Lyria3 response top-level keys: %s", list(data.keys()))
    prompt_feedback = data.get("promptFeedback", {})
    prompt_feedback and logger.warning("Lyria3 promptFeedback: %s", prompt_feedback)

    candidates = data.get("candidates", [])
    logger.warning("Lyria3 candidates count: %d", len(candidates))

    finish_reason = candidates[0].get("finishReason", "UNKNOWN") if candidates else "NO_CANDIDATES"
    logger.warning("Lyria3 finishReason: %s", finish_reason)

    parts = (candidates[0].get("content", {}).get("parts", [])) if candidates else []
    logger.warning("Lyria3 parts count: %d", len(parts))
    for i, part in enumerate(parts):
        part_keys = list(part.keys())
        has_inline = "inlineData" in part
        inline_mime = part.get("inlineData", {}).get("mimeType", "") if has_inline else ""
        inline_data_len = len(part.get("inlineData", {}).get("data", "")) if has_inline else 0
        logger.warning(
            "Lyria3 part[%d]: keys=%s, has_inline=%s, inline_mime=%s, inline_data_chars=%d",
            i, part_keys, has_inline, inline_mime, inline_data_len,
        )

    # ---- 收集歌词 + 音频 ----
    lyrics_parts: list[str] = []
    audio_data = b""
    audio_mime = f"audio/{effective_format}"
    for part in parts:
        text = part.get("text")
        text and lyrics_parts.append(text)
        inline = part.get("inlineData")
        if not audio_data and inline and inline.get("data"):
            audio_data = base64.b64decode(inline["data"])
            audio_mime = inline.get("mimeType", audio_mime)

    lyrics = "\n".join(lyrics_parts)

    # 空响应检查
    if not audio_data:
        block_reason = data.get("promptFeedback", {}).get("blockReason", "")
        safety_ratings = candidates[0].get("safetyRatings", []) if candidates else []
        logger.warning(
            "Lyria3 empty response — finishReason=%s, blockReason=%s, safetyRatings=%s, parts=%d",
            finish_reason, block_reason or "(none)", safety_ratings, len(parts),
        )
        error_msg = f"Safety filter blocked: {block_reason}" if block_reason else "No audio data in response"
        return MusicResult(status="failed", error=error_msg)

    logger.info("Lyria3 generation success: %d bytes audio, %d chars lyrics", len(audio_data), len(lyrics))
    return MusicResult(
        status="completed",
        audio_data=audio_data,
        lyrics=lyrics,
        mime_type=audio_mime,
    )
