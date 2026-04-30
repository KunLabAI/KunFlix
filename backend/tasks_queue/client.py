"""arq pool client (lazy)."""
from __future__ import annotations

import logging
from typing import Any, Optional

from config import settings

logger = logging.getLogger(__name__)

_pool = None
_init_done = False


def _redis_settings():
    """构造 arq RedisSettings；从 QUEUE_REDIS_URL 或回退到 REDIS_URL。"""
    from arq.connections import RedisSettings
    url = settings.QUEUE_REDIS_URL or settings.REDIS_URL
    return RedisSettings.from_dsn(url)


async def get_pool():
    """惰性创建 arq pool。QUEUE_BACKEND != 'arq' 时返回 None。"""
    global _pool, _init_done
    if _init_done:
        return _pool
    _init_done = True
    if settings.QUEUE_BACKEND != "arq":
        return None
    try:
        from arq import create_pool
        _pool = await create_pool(_redis_settings())
        logger.info("arq pool created")
    except Exception as exc:  # noqa: BLE001
        logger.warning("arq pool init failed: %s", exc)
        _pool = None
    return _pool


async def enqueue(func_name: str, *args: Any, **kwargs: Any):
    """投递任务；未启用 / 失败 → 返回 None，调用方可继续走旧路径。"""
    pool = await get_pool()
    if pool is None:
        return None
    try:
        return await pool.enqueue_job(func_name, *args, **kwargs)
    except Exception as exc:  # noqa: BLE001
        logger.warning("arq enqueue %s failed: %s", func_name, exc)
        return None


async def close_pool() -> None:
    global _pool, _init_done
    if _pool is None:
        return
    try:
        await _pool.aclose()
    except Exception:  # noqa: BLE001
        pass
    finally:
        _pool = None
        _init_done = False


__all__ = ["get_pool", "enqueue", "close_pool"]
