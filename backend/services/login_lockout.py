"""登录失败计数与账户锁定。

设计要点：
- 维度：按 `email` 与 `ip` 双维度独立计数，任一触发即拒绝；防止单维度被规避
- 主存储 Redis，key=`kf:login:lock:{scope}:{key}` value=失败次数，TTL 跟随窗口
- Redis 不可用时降级到进程内 TTLCache，开发零依赖
- 阈值与窗口可配置，默认 5 次失败 → 锁 15 分钟
- 登录成功后调用 `reset()` 同时清空 email 与 ip 计数
- 锁内的合法用户走 429 提示「请稍后重试」，与速率限制错误码一致

使用方法：
    locked = await login_lockout.is_locked("email", email)
    if locked or await login_lockout.is_locked("ip", ip):
        raise HTTPException(429, "登录尝试过多，请稍后重试")
    ...
    # 失败时
    await login_lockout.record_failure("email", email)
    await login_lockout.record_failure("ip", ip)
    # 成功时
    await login_lockout.reset("email", email)
    await login_lockout.reset("ip", ip)
"""
from __future__ import annotations

import logging
from typing import Literal

from cachetools import TTLCache

from cache.client import get_redis

logger = logging.getLogger(__name__)

# 阈值：连续失败次数 N 次触发锁定；窗口 = 锁定时长
MAX_FAILURES = 5
LOCK_TTL_SECONDS = 15 * 60  # 15 分钟

_NS = "kf:login:lock:"
# 进程内兜底缓存：TTL 与锁定窗口一致，超过 8192 条 LRU 自动淘汰
_FALLBACK: TTLCache = TTLCache(maxsize=8192, ttl=LOCK_TTL_SECONDS)

Scope = Literal["email", "ip"]


def _key(scope: Scope, ident: str) -> str:
    """构造 Redis key / 进程缓存 key（scope 隔离 email 与 ip）。"""
    return f"{_NS}{scope}:{ident.lower().strip()}"


async def record_failure(scope: Scope, ident: str) -> int:
    """记录一次失败，返回累计失败次数。空 ident 视为 no-op 返回 0。"""
    if not ident:
        return 0

    key = _key(scope, ident)
    client = get_redis()
    if client is not None:
        try:
            # INCR + EXPIRE 二步：仅在首次失败时设置 TTL（保留滚动窗口语义）
            count = int(await client.incr(key))
            count == 1 and await client.expire(key, LOCK_TTL_SECONDS)
            return count
        except Exception as exc:  # noqa: BLE001
            logger.warning("login_lockout Redis incr error key=%s: %s", key, exc)

    # fallback in-process
    current = int(_FALLBACK.get(key, 0)) + 1
    _FALLBACK[key] = current
    return current


async def is_locked(scope: Scope, ident: str) -> bool:
    """判定该维度是否已被锁定（失败次数 ≥ MAX_FAILURES）。"""
    if not ident:
        return False

    key = _key(scope, ident)
    client = get_redis()
    if client is not None:
        try:
            raw = await client.get(key)
            count = int(raw) if raw else 0
            return count >= MAX_FAILURES
        except Exception as exc:  # noqa: BLE001
            logger.warning("login_lockout Redis get error key=%s: %s", key, exc)

    return int(_FALLBACK.get(key, 0)) >= MAX_FAILURES


async def reset(scope: Scope, ident: str) -> None:
    """成功登录后清空计数器。空 ident 视为 no-op。"""
    if not ident:
        return

    key = _key(scope, ident)
    client = get_redis()
    if client is not None:
        try:
            await client.delete(key)
            return
        except Exception as exc:  # noqa: BLE001
            logger.warning("login_lockout Redis del error key=%s: %s", key, exc)

    _FALLBACK.pop(key, None)


async def remaining_ttl(scope: Scope, ident: str) -> int:
    """返回锁定剩余秒数（仅作提示用，Redis 不可用时返回 LOCK_TTL_SECONDS 兜底）。"""
    if not ident:
        return 0

    key = _key(scope, ident)
    client = get_redis()
    if client is not None:
        try:
            ttl = int(await client.ttl(key))
            return max(0, ttl)
        except Exception as exc:  # noqa: BLE001
            logger.warning("login_lockout Redis ttl error key=%s: %s", key, exc)

    return LOCK_TTL_SECONDS if key in _FALLBACK else 0


__all__ = [
    "MAX_FAILURES",
    "LOCK_TTL_SECONDS",
    "record_failure",
    "is_locked",
    "reset",
    "remaining_ttl",
]
