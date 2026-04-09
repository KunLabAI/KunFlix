"""
music_providers — 音乐生成供应商注册与导出。
"""
from services.music_providers.base import MusicContext, MusicResult, MusicProviderAdapter
from services.music_providers.gemini_lyria import GeminiLyriaAdapter

# 支持的音乐供应商类型集合
MUSIC_PROVIDER_TYPES: frozenset[str] = frozenset({"gemini"})

# provider_type -> 提取映射表
_PROVIDER_TYPE_MAP: dict[str, str] = {
    "gemini": "gemini",
}


def extract_music_provider_type(provider_type: str) -> str | None:
    """从 LLMProvider.provider_type 提取音乐供应商类型。"""
    return _PROVIDER_TYPE_MAP.get(provider_type.lower().strip())


__all__ = [
    "MusicContext",
    "MusicResult",
    "MusicProviderAdapter",
    "GeminiLyriaAdapter",
    "MUSIC_PROVIDER_TYPES",
    "extract_music_provider_type",
]
