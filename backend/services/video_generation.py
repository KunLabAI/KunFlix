"""
视频生成服务 — 多供应商统一入口

支持供应商:
  - xAI (Grok Video)
  - MiniMax (Hailuo)
  - Gemini (Veo)

使用方式:
  from services.video_generation import submit_video_task, poll_video_task, VideoContext

架构:
  video_generation.py (工厂 + 兼容层)
  └── video_providers/
      ├── base.py          (抽象基类)
      ├── xai_provider.py  (xAI 适配器)
      ├── minimax_provider.py (MiniMax 适配器)
      └── gemini_provider.py (Gemini 适配器)
"""
from __future__ import annotations

from typing import Dict, Type
import logging

# 从适配器模块导入核心类型
from .video_providers import (
    VideoProviderAdapter,
    VideoContext as NewVideoContext,
    VideoResult as NewVideoResult,
    XAIVideoAdapter,
    MiniMaxVideoAdapter,
    GeminiVeoAdapter,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 向后兼容: 保留旧的类型别名
# ---------------------------------------------------------------------------
VideoContext = NewVideoContext
VideoResult = NewVideoResult


# ---------------------------------------------------------------------------
# 供应商适配器注册表
# ---------------------------------------------------------------------------
_PROVIDER_REGISTRY: Dict[str, Type[VideoProviderAdapter]] = {
    "xai": XAIVideoAdapter,
    "minimax": MiniMaxVideoAdapter,
    "gemini": GeminiVeoAdapter,
}


def get_provider_adapter(provider_type: str) -> VideoProviderAdapter:
    """
    获取供应商适配器实例
    
    Args:
        provider_type: 供应商类型 (xai, minimax)
        
    Returns:
        VideoProviderAdapter: 适配器实例
        
    Raises:
        ValueError: 不支持的供应商类型
    """
    adapter_cls = _PROVIDER_REGISTRY.get(provider_type)
    adapter_cls or (_ for _ in ()).throw(ValueError(f"Unsupported video provider: {provider_type}"))
    return adapter_cls()


def register_provider(provider_type: str, adapter_cls: Type[VideoProviderAdapter]) -> None:
    """注册新的供应商适配器"""
    _PROVIDER_REGISTRY[provider_type] = adapter_cls
    logger.info(f"Registered video provider: {provider_type}")


# ---------------------------------------------------------------------------
# 统一入口函数 (向后兼容)
# ---------------------------------------------------------------------------
MAX_POLL_FAILURES = 10  # 保留常量


async def submit_video_task(ctx: VideoContext) -> VideoResult:
    """
    提交视频生成任务 (统一入口)
    
    根据 ctx.provider_type 自动选择适配器。
    默认使用 xAI 适配器 (向后兼容)。
    """
    provider_type = getattr(ctx, "provider_type", "xai")
    
    adapter = get_provider_adapter(provider_type)
    result = await adapter.submit(ctx)
    
    # 转换结果格式 (新 VideoResult.task_id -> 旧 VideoResult.xai_task_id)
    # 通过属性别名保持兼容
    return result


async def poll_video_task(api_key: str, task_id: str, provider_type: str = "xai") -> VideoResult:
    """
    轮询视频任务状态 (统一入口)
    
    Args:
        api_key: API 密钥
        task_id: 任务 ID
        provider_type: 供应商类型 (默认 xai)
        
    Returns:
        VideoResult: 轮询结果
    """
    adapter = get_provider_adapter(provider_type)
    
    # 使用带 key 的轮询方法
    result = await adapter.poll_with_key(api_key, task_id)
    
    # MiniMax 需要额外获取视频 URL
    (provider_type == "minimax" and result.status == "completed" and result.file_id) and (
        setattr(result, "video_url", await adapter.get_video_url(api_key, result.file_id))
    )
    
    return result


# ---------------------------------------------------------------------------
# 辅助函数: 根据模型名推断供应商类型
# ---------------------------------------------------------------------------
def infer_provider_type(model: str) -> str:
    """
    根据模型名推断供应商类型
    
    Args:
        model: 模型名称
        
    Returns:
        str: 供应商类型 (xai / minimax / gemini)
    """
    model_lower = model.lower()
    
    # Gemini Veo 模型特征
    veo_patterns = ["veo-"]
    any(p in model_lower for p in veo_patterns) and veo_patterns.clear()
    for pattern in veo_patterns:
        (pattern in model_lower) and veo_patterns.append("gemini")
    
    # MiniMax 模型特征
    minimax_patterns = ["hailuo", "minimax", "t2v-01", "i2v-01", "s2v-01"]
    any(p in model_lower for p in minimax_patterns) and minimax_patterns.clear()
    for pattern in minimax_patterns:
        (pattern in model_lower) and minimax_patterns.append("minimax")
    
    # 检查顺序: Veo -> MiniMax -> xAI (默认)
    (any(p in model_lower for p in ["veo-"])) and veo_patterns.append("gemini")
    (any(p in model_lower for p in ["hailuo", "minimax", "t2v-01", "i2v-01", "s2v-01"])) and minimax_patterns.append("minimax")
    
    return "gemini" if any(p in model_lower for p in ["veo-"]) else \
           "minimax" if any(p in model_lower for p in ["hailuo", "minimax", "t2v-01", "i2v-01", "s2v-01"]) else \
           "xai"
