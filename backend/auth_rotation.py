"""Refresh token rotation idempotency cache.

目的：防止多页签并发刷新导致"一次性轮换 + 黑名单"击穿。流程：
1. 刷新接口先 GET `kf:jwt:rotated:{old_jti}`，命中则直接返回同一套新 token
2. 未命中则生成新 token，并尝试 `SET ... NX EX 5` 原子写入
3. NX 失败说明 5 秒窗口内已有人写入，再 GET 一次拿对方结果

Redis 不可用时全部降级为 no-op（try_set_rotated 返回 True 让调用方走原逻辑），
开发环境零依赖仍可正常工作。
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from cache.client import get_redis

logger = logging.getLogger(__name__)

_NS = "kf:jwt:rotated:"
_TTL_SECONDS = 5


def _key(jti: str) -> str:
    return f"{_NS}{jti}"


async def try_set_rotated(jti: Optional[str], payload: dict) -> bool:
    """原子写入轮换结果。返回 True 表示本次调用是轮换赢家，可以继续 revoke 旧 jti。

    - jti 为空：视为赢家（无法去重，维持原逻辑）
    - Redis 不可用：视为赢家（降级）
    - NX 失败：返回 False，调用方应读 get_rotated(jti) 拿赢家结果
    """
    if not jti:
        return True
    client = get_redis()
    if client is None:
        return True
    try:
        value = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        res = await client.set(_key(jti), value, ex=_TTL_SECONDS, nx=True)
        return bool(res)
    except Exception as exc:  # noqa: BLE001
        logger.warning("JWT rotation cache set error jti=%s: %s", jti, exc)
        return True


async def get_rotated(jti: Optional[str]) -> Optional[dict]:
    """读取幂等窗口内的轮换结果。未命中或 Redis 不可用时返回 None。"""
    if not jti:
        return None
    client = get_redis()
    if client is None:
        return None
    try:
        raw = await client.get(_key(jti))
        if not raw:
            return None
        return json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("JWT rotation cache get error jti=%s: %s", jti, exc)
        return None


__all__ = ["try_set_rotated", "get_rotated"]
