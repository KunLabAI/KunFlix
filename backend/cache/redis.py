"""Redis-based async cache backend.

实现要点：
- 复用 cache.client.get_redis 的共享连接
- value 默认走 JSON；不可序列化时 fallback pickle，并加 1 字节前缀标识
- key 统一加 `kf:cache:` 命名空间，避免与 pubsub / rate-limit 冲突
- 接口与 MemoryCacheBackend 一致，调用方零感知切换
"""
from __future__ import annotations

import json
import logging
import pickle
from typing import Any

from cache.client import get_redis

logger = logging.getLogger(__name__)

_NS = "kf:cache:"
_TAG_JSON = b"J"
_TAG_PICKLE = b"P"


# 编码器映射表：(tag, encoder)
def _encode_json(v: Any) -> bytes:
    return _TAG_JSON + json.dumps(v, ensure_ascii=False, default=str).encode("utf-8")


def _encode_pickle(v: Any) -> bytes:
    return _TAG_PICKLE + pickle.dumps(v)


def _encode(v: Any) -> bytes:
    """优先 JSON，失败回退 pickle。"""
    try:
        return _encode_json(v)
    except (TypeError, ValueError):
        return _encode_pickle(v)


_DECODERS = {
    _TAG_JSON[0]: lambda b: json.loads(b.decode("utf-8")),
    _TAG_PICKLE[0]: pickle.loads,
}


def _decode(blob: bytes) -> Any:
    decoder = _DECODERS.get(blob[:1] and blob[0])
    return decoder(blob[1:]) if decoder else None


class RedisCacheBackend:
    """基于 Redis 的 CacheBackend 实现；未连接时所有操作 no-op。"""

    def __init__(self, max_size: int = 0, default_ttl: int = 600) -> None:
        # max_size 在 Redis 端无意义；default_ttl 仅作 fallback
        self._default_ttl = default_ttl

    @staticmethod
    def _k(key: str) -> str:
        return f"{_NS}{key}"

    async def get(self, key: str) -> Any | None:
        client = get_redis()
        if client is None:
            return None
        try:
            blob = await client.get(self._k(key))
            return _decode(blob) if blob else None
        except Exception as exc:  # noqa: BLE001
            logger.warning("RedisCache get error key=%s: %s", key, exc)
            return None

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        client = get_redis()
        if client is None:
            return
        try:
            await client.set(self._k(key), _encode(value), ex=ttl or self._default_ttl)
        except Exception as exc:  # noqa: BLE001
            logger.warning("RedisCache set error key=%s: %s", key, exc)

    async def delete(self, key: str) -> None:
        client = get_redis()
        if client is None:
            return
        try:
            await client.delete(self._k(key))
        except Exception as exc:  # noqa: BLE001
            logger.warning("RedisCache delete error key=%s: %s", key, exc)

    async def clear(self) -> None:
        """清空命名空间下所有 key（SCAN + DEL，避免 KEYS 阻塞）。"""
        client = get_redis()
        if client is None:
            return
        try:
            cursor = 0
            pattern = f"{_NS}*"
            while True:
                cursor, keys = await client.scan(cursor=cursor, match=pattern, count=500)
                keys and await client.delete(*keys)
                if cursor == 0:
                    break
        except Exception as exc:  # noqa: BLE001
            logger.warning("RedisCache clear error: %s", exc)


__all__ = ["RedisCacheBackend"]
