"""系统配置服务：带 TTL 内存缓存的 credit_policy 读写。

当前仅管理一个 key=`credit_policy`；未来可扩展其他系统配置。
缓存采用简单的单进程 TTL（60s），多实例部署时最多滞后 60s 生效。
"""
from __future__ import annotations

import logging
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import SystemSetting

logger = logging.getLogger(__name__)


# 默认 credit_policy（DB 未 seed 或 key 缺失时兜底）
# - 新用户初始积分已下线：注册用户直接绑定 Free Tier 套餐，由套餐 credits 决定初始余额
# - 月度重置策略仍通过此处管理
DEFAULT_CREDIT_POLICY: dict[str, Any] = {
    "subscription_reset_enabled": True,
    "subscription_reset_mode": "override",      # override | accumulate | floor
    "free_tier_reset_enabled": False,
    "free_tier_reset_credits": 0,
}

# 允许被 PATCH 的字段白名单 + 类型转换器（避免客户端注入未知 key）
_ALLOWED_POLICY_FIELDS: dict[str, Any] = {
    "subscription_reset_enabled": bool,
    "subscription_reset_mode": lambda v: v if v in {"override", "accumulate", "floor"} else "override",
    "free_tier_reset_enabled": bool,
    "free_tier_reset_credits": lambda v: max(0.0, float(v)),
}

_CACHE_TTL_SECONDS = 60
_cache: dict[str, tuple[float, dict[str, Any]]] = {}  # key -> (expires_at, value)


def _cache_get(key: str) -> dict[str, Any] | None:
    entry = _cache.get(key)
    if not entry:
        return None
    expires_at, value = entry
    if expires_at < time.time():
        _cache.pop(key, None)
        return None
    return value


def _cache_set(key: str, value: dict[str, Any]) -> None:
    _cache[key] = (time.time() + _CACHE_TTL_SECONDS, value)


def invalidate_cache(key: str | None = None) -> None:
    """清空全部或指定 key 的缓存。"""
    key and _cache.pop(key, None)
    (not key) and _cache.clear()


async def get_system_setting(session: AsyncSession, key: str, default: dict | None = None) -> dict[str, Any]:
    """读取系统配置（带缓存）。"""
    cached = _cache_get(key)
    if cached is not None:
        return cached
    row = await session.scalar(select(SystemSetting).where(SystemSetting.key == key))
    value = dict(row.value or {}) if row else dict(default or {})
    _cache_set(key, value)
    return value


async def get_credit_policy(session: AsyncSession) -> dict[str, Any]:
    """读取 credit_policy，缺省字段用默认值兜底。"""
    stored = await get_system_setting(session, "credit_policy", DEFAULT_CREDIT_POLICY)
    # merge: default + stored（stored 覆盖）
    merged = {**DEFAULT_CREDIT_POLICY, **stored}
    return merged


async def update_credit_policy(session: AsyncSession, patch: dict[str, Any]) -> dict[str, Any]:
    """PATCH 合并更新 credit_policy，只接受白名单字段。返回完整策略。"""
    # 过滤 + 类型强转
    sanitized: dict[str, Any] = {}
    for field, converter in _ALLOWED_POLICY_FIELDS.items():
        field in patch and sanitized.update({field: converter(patch[field])})

    row = await session.scalar(select(SystemSetting).where(SystemSetting.key == "credit_policy"))
    current = dict(row.value or {}) if row else {}
    merged = {**DEFAULT_CREDIT_POLICY, **current, **sanitized}

    if row:
        row.value = merged
    else:
        session.add(SystemSetting(
            key="credit_policy",
            value=merged,
            description="积分策略：新用户初始积分、月度重置参数",
        ))
    await session.commit()
    invalidate_cache("credit_policy")
    logger.info("credit_policy updated: %s", sanitized)
    return merged


__all__ = [
    "DEFAULT_CREDIT_POLICY",
    "get_credit_policy",
    "update_credit_policy",
    "invalidate_cache",
]
