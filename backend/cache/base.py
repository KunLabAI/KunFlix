"""Cache backend protocol.

定义可插拔缓存后端的最小接口。当前仅有 MemoryCacheBackend 实现；
Redis 后端将在基础设施就绪后以新 Backend 类注入，上层消费者无需改动。
"""
from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class CacheBackend(Protocol):
    """Minimal async cache interface.

    所有方法均为异步，便于 Redis 实现时保持签名一致。
    """

    async def get(self, key: str) -> Any | None: ...

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None: ...

    async def delete(self, key: str) -> None: ...

    async def clear(self) -> None: ...
