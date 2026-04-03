"""
视频生成供应商适配器模块

支持多供应商统一管理:
- xAI (Grok Video)
- MiniMax (Hailuo)
- Gemini (Veo)
- Ark (Seedance)
"""
from .base import VideoProviderAdapter, VideoContext, VideoResult
from .xai_provider import XAIVideoAdapter
from .minimax_provider import MiniMaxVideoAdapter
from .gemini_provider import GeminiVeoAdapter
from .ark_provider import ArkSeedanceAdapter

# ---------------------------------------------------------------------------
# 已注册的视频供应商类型 (代码级注册表，与 _PROVIDER_REGISTRY 对应)
# ---------------------------------------------------------------------------
VIDEO_PROVIDER_TYPES = frozenset({"xai", "minimax", "gemini", "ark"})


def extract_video_provider_type(provider_type: str) -> str | None:
    """
    从 LLMProvider.provider_type 提取视频供应商类型
    
    支持的格式:
      - 直接匹配: "xai", "minimax", "gemini", "ark"
      - 前缀匹配: "xai_video", "gemini_chat" -> 提取 "xai", "gemini"
    
    Args:
        provider_type: LLMProvider.provider_type 字段值
        
    Returns:
        str | None: 提取的视频供应商类型，若不匹配则返回 None
    """
    lower = (provider_type or "").lower()
    # 遍历已注册供应商，返回第一个匹配的类型
    matches = [
        vp for vp in VIDEO_PROVIDER_TYPES
        if lower == vp or lower.startswith(f"{vp}_")
    ]
    return matches[0] if matches else None


__all__ = [
    "VideoProviderAdapter",
    "VideoContext",
    "VideoResult",
    "XAIVideoAdapter",
    "MiniMaxVideoAdapter",
    "GeminiVeoAdapter",
    "ArkSeedanceAdapter",
    "VIDEO_PROVIDER_TYPES",
    "extract_video_provider_type",
]
