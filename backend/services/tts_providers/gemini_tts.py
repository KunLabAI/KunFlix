"""
gemini_tts — Google Gemini TTS 语音合成适配器。

支持模型:
  - gemini-3.8-flash-tts       (单/多说话人, 高保真)
  - gemini-3.8-flash-lite-tts  (单/多说话人, 低成本)
  - gemini-3.1-flash-tts-preview / gemini-2.5-pro-preview-tts (兼容旧版)

使用 Interactions REST API（POST /v1beta/interactions），一元请求默认返回
完整 WAV（24kHz 单声道 16-bit PCM），base64 解码后可直接写 .wav 文件。
若返回 audio/l16 裸 PCM，则自动补 RIFF/WAVE 头。
"""
from __future__ import annotations

import asyncio
import base64
import logging
import re
import struct
from dataclasses import dataclass
from typing import Any

import httpx

from services.tts_providers.base import TTSContext, TTSResult, TTSProviderAdapter, TTSSpeaker

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 模型能力映射表
# ---------------------------------------------------------------------------
_MODEL_CAPS: dict[str, dict[str, Any]] = {
    "gemini-3.8-flash-tts": {
        "multi_speaker": True,
        "voice_design": True,
        "display_name": "Gemini 3.8 Flash TTS",
    },
    "gemini-3.8-flash-lite-tts": {
        "multi_speaker": True,
        "voice_design": True,
        "display_name": "Gemini 3.8 Flash-Lite TTS",
    },
    "gemini-3.1-flash-tts-preview": {
        "multi_speaker": True,
        "voice_design": False,
        "display_name": "Gemini 3.1 Flash TTS (Preview)",
    },
    "gemini-2.5-pro-preview-tts": {
        "multi_speaker": True,
        "voice_design": False,
        "display_name": "Gemini 2.5 Pro TTS (Preview)",
    },
}

# 预置音色（30 个 studio voices）—— (名称, 语气, 性别)
# 性别为音色固有属性（不可通过 style 修改），来源：Google Gemini TTS 官方音色表
PREBUILT_VOICES: tuple[tuple[str, str, str], ...] = (
    ("Zephyr", "Bright", "female"), ("Puck", "Upbeat", "male"), ("Charon", "Informative", "male"),
    ("Kore", "Firm", "female"), ("Fenrir", "Excitable", "male"), ("Leda", "Youthful", "female"),
    ("Orus", "Firm", "male"), ("Aoede", "Breezy", "female"), ("Callirrhoe", "Easy-going", "female"),
    ("Autonoe", "Bright", "female"), ("Enceladus", "Breathy", "male"), ("Iapetus", "Clear", "male"),
    ("Umbriel", "Easy-going", "male"), ("Algieba", "Smooth", "male"), ("Despina", "Smooth", "female"),
    ("Erinome", "Clear", "female"), ("Algenib", "Gravelly", "male"), ("Rasalgethi", "Informative", "male"),
    ("Laomedeia", "Upbeat", "female"), ("Achernar", "Soft", "female"), ("Alnilam", "Firm", "male"),
    ("Schedar", "Even", "male"), ("Gacrux", "Mature", "female"), ("Pulcherrima", "Forward", "female"),
    ("Achird", "Friendly", "male"), ("Zubenelgenubi", "Casual", "male"), ("Vindemiatrix", "Gentle", "female"),
    ("Sadachbia", "Lively", "male"), ("Sadaltager", "Knowledgeable", "male"), ("Sulafat", "Warm", "female"),
)

# speech_metadata.style 注解要求请求携带具体音色：自动音色（省略 speech_config）
# 与 style 并存时 Gemini 返回 400 invalid_request。故当存在 style 却未解析出音色时，
# 回退到该默认预置音色（官方单说话人示例所用音色），保证注解合法。
DEFAULT_STYLE_VOICE = "Kore"

# API 基础 URL
_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

# 请求超时 — 长文本合成耗时较长
_TIMEOUT = httpx.Timeout(connect=30.0, read=300.0, write=30.0, pool=30.0)

# 暂时性错误重试配置
_MAX_RETRIES = 2
_RETRY_BACKOFF = 3.0
_RETRYABLE_ERRORS = (httpx.RemoteProtocolError, httpx.ReadError, httpx.ConnectError)


# ---------------------------------------------------------------------------
# Adapter
# ---------------------------------------------------------------------------
class GeminiTTSAdapter(TTSProviderAdapter):
    """Gemini TTS 语音合成适配器。"""

    SUPPORTED_MODELS = list(_MODEL_CAPS.keys())

    async def generate(self, ctx: TTSContext) -> TTSResult:
        """调用 Gemini Interactions API 合成语音。"""
        payload = _build_payload(ctx)
        headers = {
            "x-goog-api-key": ctx.api_key,
            "Content-Type": "application/json",
        }

        # ---- 发起请求（带重试：网络层瞬态错误）----
        last_error: str = ""
        for attempt in range(_MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                    resp = await client.post(f"{_API_BASE}/interactions", json=payload, headers=headers)
                result = _parse_response(resp, ctx.sample_rate)
                # 空音频响应视为瞬态问题，重试
                is_empty_retryable = (
                    result.status == "failed"
                    and result.error == "No audio data in response"
                )
                if is_empty_retryable and attempt < _MAX_RETRIES:
                    logger.warning(
                        "GeminiTTS empty response (attempt %d/%d), retrying in %.1fs...",
                        attempt + 1, _MAX_RETRIES + 1, _RETRY_BACKOFF * (2 ** attempt),
                    )
                    await asyncio.sleep(_RETRY_BACKOFF * (2 ** attempt))
                    continue
                if is_empty_retryable:
                    logger.error("GeminiTTS all %d attempts returned empty response", _MAX_RETRIES + 1)
                    return TTSResult(
                        status="failed",
                        error="Speech generation temporarily unavailable, please try again",
                    )
                return result
            except httpx.TimeoutException:
                return TTSResult(status="failed", error="Speech generation request timed out (300s)")
            except _RETRYABLE_ERRORS as exc:
                last_error = f"HTTP error: {exc}"
                logger.warning("GeminiTTS request attempt %d/%d failed (retryable): %s", attempt + 1, _MAX_RETRIES + 1, exc)
                (attempt < _MAX_RETRIES) and await asyncio.sleep(_RETRY_BACKOFF * (2 ** attempt))
            except httpx.HTTPError as exc:
                return TTSResult(status="failed", error=f"HTTP error: {exc}")

        # 所有重试用尽（网络层失败）
        return TTSResult(status="failed", error=last_error or "Speech generation temporarily unavailable, please try again")


# ---------------------------------------------------------------------------
# 请求体组装
# ---------------------------------------------------------------------------

def _text_item(text: str, style: str = "", speaker: str = "") -> dict:
    """构建单个带 speech_metadata 注解的文本项。"""
    metadata: dict[str, Any] = {"type": "speech_metadata"}
    style and metadata.update(style=style)
    speaker and metadata.update(speaker=speaker)
    item: dict[str, Any] = {"type": "text", "text": text}
    (len(metadata) > 1) and item.update(annotations=[metadata])
    return item


def _resolve_voice(explicit: str, ctx_voice: str, style: str) -> str:
    """音色解析优先级：角色显式音色 > 全局音色 > （有 style 时的默认回退）。

    style 注解必须搭配具体音色（否则 Gemini 400）；若最终仍为空（无 style 的
    自动音色）则返回 ""，由上层省略 speech_config 交由模型自选音色。
    """
    return explicit or ctx_voice or (DEFAULT_STYLE_VOICE if style else "")


def _build_speech_config(ctx: TTSContext) -> Any:
    """构建 generation_config.speech_config（多说话人 → conversational 模式）。

    voice 为空（自动）且无 style 时返回 None → 请求中省略 speech_config，由模型自选音色；
    若携带 style 但音色为自动，则回退到 DEFAULT_STYLE_VOICE（style 注解必须搭配具体音色）。
    """
    multi = len(ctx.speakers) > 1
    single_voice = _resolve_voice(ctx.speakers[0].voice if ctx.speakers else "", ctx.voice, ctx.style)
    return (
        {
            "mode": "conversational",
            "speakers": [
                ({"speaker": s.speaker, "voice": v} if (v := _resolve_voice(s.voice, ctx.voice, s.style)) else {"speaker": s.speaker})
                for s in ctx.speakers[:2]
            ],
        }
        if multi
        else ([{"voice": single_voice}] if single_voice else None)
    )


def _build_content_items(ctx: TTSContext) -> list[dict]:
    """多说话人 → 每个角色一条文本项；单说话人 → 单条文本项。"""
    multi = len(ctx.speakers) > 1
    return (
        [_text_item(s.text, s.style, s.speaker) for s in ctx.speakers[:2] if s.text.strip()]
        if multi
        else [_text_item(ctx.text, ctx.style)]
    )


def _build_payload(ctx: TTSContext) -> dict:
    """组装 Interactions API 请求体。"""
    response_format: dict[str, Any] = {"type": "audio"}
    # 非默认编码/采样率时显式声明
    is_custom_format = ctx.output_mime != "audio/wav" or ctx.sample_rate != 24000
    is_custom_format and response_format.update(mime_type=ctx.output_mime, sample_rate=ctx.sample_rate)

    speech_config = _build_speech_config(ctx)
    generation_config: dict[str, Any] = {}
    # voice 为自动时省略 speech_config，由模型自行选择音色
    speech_config is not None and generation_config.update(speech_config=speech_config)

    return {
        "model": ctx.model,
        "input": [{
            "type": "user_input",
            "content": _build_content_items(ctx),
        }],
        "response_format": response_format,
        "generation_config": generation_config,
    }


# ---------------------------------------------------------------------------
# 响应解析
# ---------------------------------------------------------------------------

def _wrap_wav(pcm: bytes, sample_rate: int) -> bytes:
    """为裸 16-bit 单声道 PCM 补 RIFF/WAVE 头。"""
    channels, bits = 1, 16
    byte_rate = sample_rate * channels * bits // 8
    block_align = channels * bits // 8
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + len(pcm), b"WAVE",
        b"fmt ", 16, 1, channels,
        sample_rate, byte_rate, block_align, bits,
        b"data", len(pcm),
    )
    return header + pcm


def _iter_audio_blocks(data: dict) -> list[dict]:
    """收集响应中所有音频块（兼容 steps 结构与 candidates 结构）。"""
    blocks: list[dict] = []
    for step in data.get("steps", []) or []:
        is_model_output = step.get("type") == "model_output"
        is_model_output and blocks.extend(
            c for c in (step.get("content") or []) if c.get("type") == "audio" and c.get("data")
        )
    for candidate in data.get("candidates", []) or []:
        for part in (candidate.get("content", {}) or {}).get("parts", []) or []:
            inline = part.get("inlineData") or part.get("inline_data") or {}
            inline.get("data") and blocks.append({"data": inline["data"], "mime_type": inline.get("mimeType") or inline.get("mime_type")})
    return blocks


def _format_api_error(resp: httpx.Response) -> str:
    """从 Gemini 错误响应提取可读信息（兼容 error 包裹/顶层两种结构，并附带 code 与 details）。"""
    try:
        body = resp.json()
    except Exception:
        return resp.text[:500]
    node = body.get("error", body) if isinstance(body, dict) else {}
    node = node if isinstance(node, dict) else {}
    msg = node.get("message") or (body.get("message") if isinstance(body, dict) else "") or resp.text[:500]
    code = node.get("code") or node.get("status") or (body.get("code") if isinstance(body, dict) else "") or ""
    details = node.get("details") or (body.get("details") if isinstance(body, dict) else "") or ""
    return f"{msg} [code={code}] details={str(details)[:300]}" if (code or details) else str(msg)


def _parse_response(resp: httpx.Response, sample_rate: int) -> TTSResult:
    """解析 Gemini Interactions 响应，提取最后一个音频块。"""
    status_ok = 200 <= resp.status_code < 300
    error_body = "" if status_ok else _format_api_error(resp)

    if not status_ok:
        logger.error("GeminiTTS API error %d: %s", resp.status_code, error_body)
        return TTSResult(status="failed", error=f"Gemini TTS API error ({resp.status_code}): {error_body}")

    data = resp.json()
    blocks = _iter_audio_blocks(data)

    if not blocks:
        logger.warning("GeminiTTS empty response — top-level keys: %s", list(data.keys()))
        return TTSResult(status="failed", error="No audio data in response")

    # 取最后一个音频块（对齐 SDK output_audio 语义）
    last = blocks[-1]
    audio_data = base64.b64decode(last["data"])
    mime = (last.get("mime_type") or "audio/wav").lower()

    # 裸 PCM（无 RIFF 头）→ 补 WAV 容器，保证浏览器可直接播放
    needs_wrap = not audio_data.startswith(b"RIFF")
    needs_wrap and (audio_data := _wrap_wav(audio_data, sample_rate))
    final_mime = "audio/wav" if needs_wrap else mime

    logger.info("GeminiTTS generation success: %d bytes audio (%s)", len(audio_data), final_mime)
    return TTSResult(status="completed", audio_data=audio_data, mime_type=final_mime)


# ---------------------------------------------------------------------------
# 音色复刻（Voice Replication）—— POST /v1beta/voices (type=replicated)
# ---------------------------------------------------------------------------

# voice_ / voicekey_ ID 提取正则（防御式：不依赖固定响应字段路径）
_VOICE_ID_RE = re.compile(r"\b(voice(?:key)?_[A-Za-z0-9_\-]+)")


@dataclass
class ReplicationResult:
    """音色复刻结果。"""

    status: str = "completed"        # completed / failed
    voice_id: str = ""               # Google 返回的 voice_... / voicekey_... ID
    error: str = ""


def _extract_voice_id(node: Any) -> str:
    """递归搜索响应 JSON，提取第一个 voice_ / voicekey_ ID。

    官方响应结构可能随版本变化，此处不绑定固定字段路径，
    而是扫描所有字符串值（及 id/name/voice 类键），命中 ID 模式即返回。
    """
    if isinstance(node, str):
        m = _VOICE_ID_RE.search(node)
        return m.group(1) if m else ""
    if isinstance(node, dict):
        # 优先常见字段，其次全量扫描
        for key in ("id", "name", "voice_id", "voice"):
            found = _extract_voice_id(node.get(key)) if key in node else ""
            if found:
                return found
        for value in node.values():
            found = _extract_voice_id(value)
            if found:
                return found
    if isinstance(node, list):
        for item in node:
            found = _extract_voice_id(item)
            if found:
                return found
    return ""


async def replicate_voice(
    *,
    api_key: str,
    model: str,
    display_name: str,
    source_audio_b64: str,
    consent_audio_b64: str,
    source_mime: str = "audio/wav",
    consent_mime: str = "audio/wav",
    store: bool = True,
) -> ReplicationResult:
    """调用 Gemini Voices API 复刻音色。

    store=True → 持久 voice_ ID（1 年 TTL，可复用）；
    store=False → 无状态 voicekey_ ID（7 天 TTL）。
    """
    payload = {
        "store": store,
        "voice": {
            "model": model,
            "type": "replicated",
            "display_name": display_name,
            "replicated": {
                "source_audio": {"mime_type": source_mime, "data": source_audio_b64},
                "consent_audio": {"mime_type": consent_mime, "data": consent_audio_b64},
            },
        },
    }
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(f"{_API_BASE}/voices", json=payload, headers=headers)
    except httpx.TimeoutException:
        return ReplicationResult(status="failed", error="Voice replication request timed out")
    except httpx.HTTPError as exc:
        return ReplicationResult(status="failed", error=f"HTTP error: {exc}")

    status_ok = 200 <= resp.status_code < 300
    try:
        data = resp.json()
    except Exception:
        data = {"raw": resp.text[:500]}

    if not status_ok:
        err_msg = data.get("error", {}).get("message", resp.text[:500]) if isinstance(data, dict) else resp.text[:500]
        logger.error("GeminiTTS voice replication error %d: %s", resp.status_code, err_msg)
        return ReplicationResult(status="failed", error=f"Voice replication error ({resp.status_code}): {err_msg}")

    voice_id = _extract_voice_id(data)
    if not voice_id:
        logger.warning("GeminiTTS voice replication returned no voice id — keys: %s", list(data.keys()) if isinstance(data, dict) else type(data))
        return ReplicationResult(status="failed", error="No voice ID in replication response")

    logger.info("GeminiTTS voice replication success: %s (%s)", voice_id, display_name)
    return ReplicationResult(status="completed", voice_id=voice_id)


# ---------------------------------------------------------------------------
# 扩展音色库（Extended Voice Library）—— GET /v1beta/voices
# ---------------------------------------------------------------------------

def _as_list(value: Any) -> list[str]:
    """将 None / str / list 统一为非空字符串列表。逗号分隔的字符串自动拆分。"""
    if value is None:
        return []
    raw = value if isinstance(value, (list, tuple)) else str(value).split(",")
    return [str(x).strip() for x in raw if str(x).strip()]


def _pick(d: dict, *keys: str) -> str:
    """从 dict 中按候选键名（兼容 snake/camel）取第一个非空值。"""
    for k in keys:
        v = d.get(k)
        if v not in (None, ""):
            return v if isinstance(v, str) else str(v)
    return ""


def _normalize_library_voice(v: dict) -> dict:
    """将 Google ListVoices 响应项规范化为前端统一结构（防御式字段名）。"""
    return {
        "id": _pick(v, "id", "name", "voice_id", "voiceId"),
        "display_name": _pick(v, "display_name", "displayName") or _pick(v, "id", "name"),
        "gender": _pick(v, "gender").lower(),
        "language_code": _pick(v, "language_code", "languageCode"),
        "accent": _pick(v, "accent"),
        "pitch": _pick(v, "pitch").lower(),
        "persona": _pick(v, "persona"),
        "description": _pick(v, "description"),
        "type": _pick(v, "type", "source"),
    }


async def list_voice_library(
    *,
    api_key: str,
    gender: Any = None,
    language_code: Any = None,
    pitch: Any = None,
    accent: Any = None,
    context: Any = None,
    persona: Any = None,
    voice_type: Any = None,
    search: str = "",
    page_size: int = 50,
    page_token: str = "",
) -> dict:
    """查询扩展音色库。

    返回：{voices: [规范化音色...], next_page_token: str} 或 {error: str}。
    可重复参数（gender/language_code/pitch/...）支持传字符串、逗号分隔或多元素列表。
    """
    # 构建可重复查询参数（httpx 接受 (key, value) 元组列表以支持重复键）
    params: list[tuple[str, str]] = []
    _REPEATABLE = (
        ("gender", gender), ("language_code", language_code), ("pitch", pitch),
        ("accent", accent), ("context", context), ("persona", persona), ("type", voice_type),
    )
    for key, val in _REPEATABLE:
        params.extend((key, item) for item in _as_list(val))
    (search or "").strip() and params.append(("search", search.strip()))
    params.append(("page_size", str(max(1, min(int(page_size or 50), 200)))))
    (page_token or "").strip() and params.append(("page_token", page_token.strip()))

    headers = {"x-goog-api-key": api_key}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(f"{_API_BASE}/voices", params=params, headers=headers)
    except httpx.TimeoutException:
        return {"error": "Voice library request timed out"}
    except httpx.HTTPError as exc:
        return {"error": f"HTTP error: {exc}"}

    try:
        data = resp.json()
    except Exception:
        data = {"raw": resp.text[:500]}

    if not (200 <= resp.status_code < 300):
        err = data.get("error", {}).get("message", resp.text[:500]) if isinstance(data, dict) else resp.text[:500]
        logger.error("GeminiTTS voice library error %d: %s", resp.status_code, err)
        return {"error": f"Voice library error ({resp.status_code}): {err}"}

    raw_voices = (data.get("voices") or data.get("Voices") or []) if isinstance(data, dict) else []
    next_token = _pick(data, "next_page_token", "nextPageToken") if isinstance(data, dict) else ""
    voices = [_normalize_library_voice(v) for v in raw_voices if isinstance(v, dict)]
    # 过滤掉无 id 的异常项
    voices = [v for v in voices if v["id"]]
    logger.info("GeminiTTS voice library: %d voices (next=%s)", len(voices), bool(next_token))
    return {"voices": voices, "next_page_token": next_token}
