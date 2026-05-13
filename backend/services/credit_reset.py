"""月度积分重置服务（Lazy 触发）。

核心思想：用户访问可感知路径（login/me/chat/image/video）时惰性检查
`next_credit_reset_at`，到期则执行覆盖重置并推进到下月 1 日 UTC 00:00。

重置策略由 `credit_policy.subscription_reset_mode` 决定：
- override   (默认): credits = plan.credits，作废未用余额
- accumulate          : credits += plan.credits，保留未用余额
- floor               : credits = max(credits, plan.credits)，兜底

非订阅用户通过 `free_tier_reset_enabled` 开关控制是否也参与（默认关）。

幂等键：f"monthly_reset:{user_id}:{YYYY-MM}" —— 同月内多次调用只重置一次。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import User, SubscriptionPlan, CreditTransaction
from services.system_settings import get_credit_policy
from services.billing import record_credit_grant

logger = logging.getLogger(__name__)


def compute_next_reset_at(now: datetime | None = None) -> datetime:
    """返回下月 1 日 UTC 00:00。"""
    now = now or datetime.now(timezone.utc)
    year = now.year + (1 if now.month == 12 else 0)
    month = 1 if now.month == 12 else now.month + 1
    return datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)


# 重置模式 → 新余额计算器（映射表驱动，避免 if-else）
_RESET_MODE_CALCULATORS: dict[str, Any] = {
    "override":   lambda current, quota: float(quota),
    "accumulate": lambda current, quota: float(current) + float(quota),
    "floor":      lambda current, quota: max(float(current), float(quota)),
}


async def _resolve_quota(user: User, policy: dict, db: AsyncSession) -> tuple[float, str]:
    """计算用户本次应重置的配额与来源标签。

    返回 (quota, source_tag)；quota < 0 表示不应重置。
    """
    is_active_sub = (user.subscription_status == "active") and bool(user.subscription_plan_id)

    # 订阅用户
    if is_active_sub:
        if not policy.get("subscription_reset_enabled", True):
            return -1.0, "subscription_disabled"
        plan = await db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.id == user.subscription_plan_id))
        if not plan:
            return -1.0, "plan_missing"
        return float(plan.credits or 0), f"subscription:{plan.name}"

    # 非订阅用户
    if policy.get("free_tier_reset_enabled", False):
        return float(policy.get("free_tier_reset_credits") or 0), "free_tier"

    return -1.0, "free_tier_disabled"


async def maybe_reset_monthly_credits(user_id: str, db: AsyncSession) -> bool:
    """Lazy 月度重置入口。返回是否执行了重置。

    幂等：`monthly_reset:{user_id}:{YYYY-MM}` 已存在则跳过。
    """
    # 1. 读取用户 + 判断是否到期
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user or not user.next_credit_reset_at:
        return False

    now = datetime.now(timezone.utc)
    # 兼容 naive datetime（SQLite 可能以 naive 形式返回）
    next_at = user.next_credit_reset_at
    next_at.tzinfo is None and (next_at := next_at.replace(tzinfo=timezone.utc))
    if next_at > now:
        return False

    # 2. 解析策略 + 配额
    policy = await get_credit_policy(db)
    quota, source_tag = await _resolve_quota(user, policy, db)
    if quota < 0:
        # 策略禁用 → 仅推进 next_reset_at，不发积分
        user.next_credit_reset_at = compute_next_reset_at(now)
        await db.commit()
        logger.info("Skip monthly reset for user=%s source=%s (policy disabled)", user_id, source_tag)
        return False

    # 3. 计算新余额（按模式）
    mode = policy.get("subscription_reset_mode", "override")
    calc = _RESET_MODE_CALCULATORS.get(mode, _RESET_MODE_CALCULATORS["override"])
    balance_before = float(user.credits or 0)
    balance_after = calc(balance_before, quota)
    delta = balance_after - balance_before

    # 4. 写入（幂等键防重）
    period_key = now.strftime("%Y-%m")
    idem_key = f"monthly_reset:{user_id}:{period_key}"

    user.credits = Decimal(str(balance_after))
    user.next_credit_reset_at = compute_next_reset_at(now)

    # 即使 delta=0 也写一条审计（quota=0 override 到 0 的情况）
    await record_credit_grant(
        user_id=user_id,
        amount=delta,
        session=db,
        balance_after=balance_after,
        description=f"月度积分重置（{mode}/{source_tag}）",
        idempotency_key=idem_key,
        metadata={
            "kind": "monthly_reset",
            "mode": mode,
            "source": source_tag,
            "quota": quota,
            "period": period_key,
        },
        transaction_type="monthly_reset",
    )

    await db.commit()
    logger.info(
        "Monthly reset user=%s mode=%s source=%s before=%.4f after=%.4f delta=%.4f",
        user_id, mode, source_tag, balance_before, balance_after, delta,
    )
    return True


async def batch_trigger_due_resets(db: AsyncSession, limit: int = 500) -> dict[str, int]:
    """管理员手动批量触发：扫描到期用户并依次重置。

    - 仅处理 next_credit_reset_at <= now 的用户
    - 单次最多处理 limit 条（避免 O(全表) 长事务）
    - 返回 {total_due, reset_count, skipped}
    """
    now = datetime.now(timezone.utc)
    stmt = (
        select(User.id)
        .where(User.next_credit_reset_at.isnot(None))
        .where(User.next_credit_reset_at <= now)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    reset_count = 0
    skipped = 0
    for uid in rows:
        did = await maybe_reset_monthly_credits(uid, db)
        did and (reset_count := reset_count + 1)
        (not did) and (skipped := skipped + 1)

    return {"total_due": len(rows), "reset_count": reset_count, "skipped": skipped}


__all__ = [
    "compute_next_reset_at",
    "maybe_reset_monthly_credits",
    "batch_trigger_due_resets",
]
