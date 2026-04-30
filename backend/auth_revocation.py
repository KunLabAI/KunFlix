"""JWT revocation blacklist.

策略：
- 主存储 Redis，key=`kf:jwt:revoked:{jti}` value=1，TTL 跟随 token 剩余有效期
- Redis 不可用时降级到进程内 TTLCache（最多 8192 条），保证开发环境可用但不保证多实例一致
- 调用方在 decode_token 后查询 is_revoked(jti)；正常路径仅一次 GET，开销极低
"""
from __future__ import annotations

import logging
from typing import Optional

from cachetools import TTLCache

from cache.client import get_redis

logger = logging.getLogger(__name__)

_NS = "kf:jwt:revoked:"
# 进程内兜底缓存：默认 24h TTL（足以覆盖 access token 30min + refresh 7d 的常见场景；
# refresh 黑名单建议必须配 Redis）
_FALLBACK = TTLCache(maxsize=8192, ttl=86400)


def _key(jti: str) -> str:
    return f"{_NS}{jti}"


async def revoke(jti: Optional[str], ttl_seconds: int) -> None:
    """将 jti 加入黑名单。jti 为空或 ttl<=0 时静默忽略。"""
    if not jti or ttl_seconds <= 0:
        return
    client = get_redis()
    if client is not None:
        try:
            await client.set(_key(jti), b"1", ex=ttl_seconds)
            return
        except Exception as exc:  # noqa: BLE001
            logger.warning("JWT revoke Redis error jti=%s: %s", jti, exc)
    # fallback in-process
    _FALLBACK[jti] = True


async def is_revoked(jti: Optional[str]) -> bool:
    if not jti:
        return False
    client = get_redis()
    if client is not None:
        try:
            return bool(await client.exists(_key(jti)))
        except Exception as exc:  # noqa: BLE001
            logger.warning("JWT is_revoked Redis error jti=%s: %s", jti, exc)
    return jti in _FALLBACK


__all__ = ["revoke", "is_revoked"]
