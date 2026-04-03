"""
视频生成服务 — 多供应商统一入口

支持供应商:
  - xAI (Grok Video)
  - MiniMax (Hailuo)
  - Gemini (Veo)
  - Ark (Seedance)

使用方式:
  from services.video_generation import submit_video_task, poll_video_task, VideoContext

架构:
  video_generation.py (工厂 + 兼容层)
  └── video_providers/
      ├── base.py              (抽象基类)
      ├── model_capabilities.py (模型能力配置)
      ├── xai_provider.py      (xAI 适配器)
      ├── minimax_provider.py  (MiniMax 适配器)
      ├── gemini_provider.py   (Gemini 适配器)
      └── ark_provider.py      (Ark Seedance 适配器)
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
    ArkSeedanceAdapter,
    extract_video_provider_type,
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
    "ark": ArkSeedanceAdapter,
}


def get_provider_adapter(provider_type: str) -> VideoProviderAdapter:
    """
    获取供应商适配器实例
    
    Args:
        provider_type: 供应商类型 (xai, minimax, gemini)
        
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
# 统一入口函数
# ---------------------------------------------------------------------------
MAX_POLL_FAILURES = 10


async def submit_video_task(ctx: VideoContext) -> VideoResult:
    """
    提交视频生成任务 (统一入口)
    
    根据 ctx.provider_type 自动选择适配器。
    默认使用 xAI 适配器 (向后兼容)。
    """
    provider_type = getattr(ctx, "provider_type", "xai")
    
    adapter = get_provider_adapter(provider_type)
    return await adapter.submit(ctx)


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

# 模型前缀 -> 供应商类型 (备用推断机制，优先使用 LLMProvider.provider_type)
_MODEL_PREFIX_PROVIDER_MAP = [
    (["veo-"], "gemini"),
    (["hailuo", "minimax", "t2v-01", "i2v-01", "s2v-01"], "minimax"),
    (["seedance", "doubao-seedance"], "ark"),
]


def _infer_from_model_prefix(model: str) -> str:
    """
    根据模型名前缀推断供应商类型 (备用方案)
    
    Args:
        model: 模型名称
        
    Returns:
        str: 供应商类型，默认 xai
    """
    model_lower = model.lower()
    
    # 遍历前缀映射表, 返回第一个匹配的供应商类型
    matches = [
        provider
        for prefixes, provider in _MODEL_PREFIX_PROVIDER_MAP
        for prefix in prefixes
        if prefix in model_lower
    ]
    
    return matches[0] if matches else "xai"


def infer_provider_type(model: str, provider_type_hint: str = "") -> str:
    """
    推断供应商类型
    
    优先使用 provider_type_hint（从 LLMProvider.provider_type 提取）。
    备用：根据模型名前缀推断。
    
    Args:
        model: 模型名称
        provider_type_hint: 供应商类型提示 (來自 LLMProvider.provider_type)
        
    Returns:
        str: 供应商类型 (xai / minimax / gemini / ark)
    """
    # 优先使用提示
    hint_result = extract_video_provider_type(provider_type_hint) if provider_type_hint else None
    return hint_result or _infer_from_model_prefix(model)
