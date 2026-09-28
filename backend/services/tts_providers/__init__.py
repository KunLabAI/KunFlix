"""
tts_providers — TTS 语音合成供应商注册与导出。
"""
from services.tts_providers.base import TTSContext, TTSResult, TTSSpeaker, TTSProviderAdapter
from services.tts_providers.gemini_tts import (
    GeminiTTSAdapter,
    PREBUILT_VOICES,
    replicate_voice,
    ReplicationResult,
    list_voice_library,
)

# 支持的 TTS 供应商类型集合
TTS_PROVIDER_TYPES: frozenset[str] = frozenset({"gemini"})

# provider_type -> 提取映射表
_PROVIDER_TYPE_MAP: dict[str, str] = {
    "gemini": "gemini",
}


def extract_tts_provider_type(provider_type: str) -> str | None:
    """从 LLMProvider.provider_type 提取 TTS 供应商类型。"""
    return _PROVIDER_TYPE_MAP.get((provider_type or "").lower().strip())


__all__ = [
    "TTSContext",
    "TTSResult",
    "TTSSpeaker",
    "TTSProviderAdapter",
    "GeminiTTSAdapter",
    "PREBUILT_VOICES",
    "replicate_voice",
    "ReplicationResult",
    "list_voice_library",
    "TTS_PROVIDER_TYPES",
    "extract_tts_provider_type",
]
