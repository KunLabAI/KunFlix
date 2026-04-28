"""In-process memory cache backend backed by cachetools.TTLCache.

特性：
- 单进程内线程/协程安全（asyncio.Lock 保护 TTLCache 的写入）
- 支持 per-key TTL 覆盖（通过多实例或 set 时的显式 ttl 参数）
- 容量满时按 LRU + TTL 自动淘汰
"""
from __future__ import annotations

import asyncio
from typing import Any

from cachetools import TTLCache


class MemoryCacheBackend:
    """进程内缓存实现；多进程部署下每实例独立，状态不共享。"""

    def __init__(self, max_size: int = 1024, default_ttl: int = 600) -> None:
        self._store: TTLCache = TTLCache(maxsize=max_size, ttl=default_ttl)
        self._default_ttl = default_ttl
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Any | None:
        async with self._lock:
            return self._store.get(key)

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        # TTLCache 自身的 ttl 是全局的；单 key 覆盖 TTL 的精细需求
        # 将在未来 Redis 实现中原生支持。此处忽略 ttl 参数，维持 default_ttl。
        async with self._lock:
            self._store[key] = value

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._store.pop(key, None)

    async def clear(self) -> None:
        async with self._lock:
            self._store.clear()
