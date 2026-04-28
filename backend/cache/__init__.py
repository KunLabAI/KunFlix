"""Cache backend factory.

通过 settings.CACHE_BACKEND 选择实现。当前支持：
- "memory": MemoryCacheBackend（默认，进程内）
- "redis":  占位，尚未实现；设置后启动即抛错，防止误配置

使用映射表调度，避免 if-else 分支。
"""
from __future__ import annotations

from typing import Callable

from config import settings

from cache.base import CacheBackend
from cache.memory import MemoryCacheBackend


def _build_memory(max_size: int, default_ttl: int) -> CacheBackend:
    return MemoryCacheBackend(max_size=max_size, default_ttl=default_ttl)


def _build_redis(max_size: int, default_ttl: int) -> CacheBackend:
    raise NotImplementedError(
        "Redis cache backend is not yet implemented. "
        "Install and configure Redis, then provide a RedisCacheBackend."
    )


_BACKEND_REGISTRY: dict[str, Callable[[int, int], CacheBackend]] = {
    "memory": _build_memory,
    "redis": _build_redis,
}


def get_cache_backend(max_size: int, default_ttl: int) -> CacheBackend:
    """Resolve and instantiate the configured cache backend.

    Raises:
        ValueError: 当 CACHE_BACKEND 不在注册表中
        NotImplementedError: 当选择了尚未实现的后端
    """
    builder = _BACKEND_REGISTRY.get(settings.CACHE_BACKEND)
    builder or (_ for _ in ()).throw(
        ValueError(f"Unknown CACHE_BACKEND: {settings.CACHE_BACKEND!r}")
    )
    return builder(max_size, default_ttl)


__all__ = ["CacheBackend", "MemoryCacheBackend", "get_cache_backend"]
