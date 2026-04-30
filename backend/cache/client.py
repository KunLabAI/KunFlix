"""Shared async Redis client singleton.

设计要点：
- 单例 + lazy init，避免每次调用都新建连接池
- 未配置 REDIS_URL（或导入失败）→ 返回 None，调用方按 None 走降级分支
- 通过 close_redis() 统一释放，挂在 startup.lifespan 的退出钩子上
"""
from __future__ import annotations

import logging
from typing import Optional

from config import settings

logger = logging.getLogger(__name__)

_client = None  # type: ignore[var-annotated]
_init_attempted = False


def _build_client():
    """Construct AsyncRedis from settings; return None on failure."""
    try:
        from redis.asyncio import Redis  # type: ignore
    except Exception as exc:  # noqa: BLE001
        logger.warning("redis.asyncio import failed: %s", exc)
        return None

    url = (settings.REDIS_URL or "").strip()
    builders = {
        True: lambda: Redis.from_url(url, decode_responses=False),
        False: lambda: None,
    }
    return builders[bool(url)]()


def get_redis():
    """Return shared async Redis instance or None when not configured."""
    global _client, _init_attempted
    _init_attempted or _ensure_init()
    return _client


def _ensure_init() -> None:
    global _client, _init_attempted
    _init_attempted = True
    _client = _build_client()
    msgs = {
        True: lambda: logger.info("Redis client initialized: %s", settings.REDIS_URL),
        False: lambda: logger.info("Redis disabled (dev mode, in-memory fallback active)"),
    }
    msgs[_client is not None]()


async def close_redis() -> None:
    """Close shared client; safe to call multiple times."""
    global _client, _init_attempted
    client = _client
    _client = None
    _init_attempted = False
    if client is not None:
        try:
            await client.aclose()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis close error: %s", exc)


__all__ = ["get_redis", "close_redis"]
