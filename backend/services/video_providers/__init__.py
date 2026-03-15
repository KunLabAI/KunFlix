"""
视频生成供应商适配器模块

支持多供应商统一管理:
- xAI (Grok Video)
- MiniMax (Hailuo)
"""
from .base import VideoProviderAdapter, VideoContext, VideoResult
from .xai_provider import XAIVideoAdapter
from .minimax_provider import MiniMaxVideoAdapter

__all__ = [
    "VideoProviderAdapter",
    "VideoContext",
    "VideoResult",
    "XAIVideoAdapter",
    "MiniMaxVideoAdapter",
]
