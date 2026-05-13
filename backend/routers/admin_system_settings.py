"""管理员系统设置路由 — credit_policy 读写 + 月度重置手动触发。

所有端点需要管理员权限（require_admin）。
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_admin
from database import get_db
from models import Admin, User
from services import audit
from services.credit_reset import batch_trigger_due_resets, maybe_reset_monthly_credits
from services.system_settings import (
    DEFAULT_CREDIT_POLICY,
    get_credit_policy,
    update_credit_policy,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/admin/system-settings",
    tags=["admin-system-settings"],
    responses={404: {"description": "Not found"}},
)


# ---------------------------------------------------------------------------
# Credit policy
# ---------------------------------------------------------------------------
class CreditPolicyPatch(BaseModel):
    """credit_policy PATCH 请求体，所有字段均可选。

    注：new_user_initial_credits 已下线 —— 新用户注册直接绑定 Free Tier 套餐，
    初始余额由套餐 credits 决定。
    """
    subscription_reset_enabled: bool | None = None
    subscription_reset_mode: str | None = None  # override | accumulate | floor
    free_tier_reset_enabled: bool | None = None
    free_tier_reset_credits: float | None = None


@router.get("/credit-policy")
async def get_credit_policy_endpoint(
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """读取当前 credit_policy（merged with defaults）。"""
    policy = await get_credit_policy(db)
    return {
        "policy": policy,
        "defaults": DEFAULT_CREDIT_POLICY,
        "reset_modes": ["override", "accumulate", "floor"],
    }


@router.patch("/credit-policy")
async def update_credit_policy_endpoint(
    request: Request,
    body: CreditPolicyPatch,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """PATCH 更新 credit_policy（白名单字段 + 类型强转）。"""
    patch = body.model_dump(exclude_none=True)
    not patch and (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="No valid fields provided")
    )

    merged = await update_credit_policy(db, patch)

    audit.record(
        action="system.credit_policy_update",
        actor=current_admin,
        resource_type="system_setting",
        resource_id="credit_policy",
        detail={"patch": patch, "merged": merged},
        request=request,
    )
    return {"ok": True, "policy": merged}


# ---------------------------------------------------------------------------
# Monthly reset — 统计 + 手动触发
# ---------------------------------------------------------------------------
@router.get("/credit-reset/stats")
async def credit_reset_stats(
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """返回月度重置相关统计：到期用户数、已配置重置的订阅用户数等。"""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    due_count = await db.scalar(
        select(func.count(User.id))
        .where(User.next_credit_reset_at.isnot(None))
        .where(User.next_credit_reset_at <= now)
    )
    scheduled_count = await db.scalar(
        select(func.count(User.id))
        .where(User.next_credit_reset_at.isnot(None))
    )
    active_sub_count = await db.scalar(
        select(func.count(User.id))
        .where(User.subscription_status == "active")
    )
    return {
        "due_count": int(due_count or 0),
        "scheduled_count": int(scheduled_count or 0),
        "active_subscription_count": int(active_sub_count or 0),
        "server_time_utc": now.isoformat(),
    }


@router.post("/credit-reset/trigger")
async def credit_reset_trigger_batch(
    request: Request,
    limit: int = Query(500, ge=1, le=2000),
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """管理员手动批量触发到期用户的月度重置（单次最多 limit 条）。"""
    result = await batch_trigger_due_resets(db, limit=limit)

    audit.record(
        action="system.credit_reset_batch_trigger",
        actor=current_admin,
        resource_type="system_setting",
        resource_id="credit_policy",
        detail=result,
        request=request,
    )
    return {"ok": True, **result}


@router.post("/credit-reset/trigger/{user_id}")
async def credit_reset_trigger_user(
    user_id: str,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """针对单个用户手动触发月度重置（到期才会真正执行）。"""
    user = await db.scalar(select(User).where(User.id == user_id))
    not user and (_ for _ in ()).throw(HTTPException(status_code=404, detail="User not found"))

    did_reset = await maybe_reset_monthly_credits(user_id, db)

    audit.record(
        action="system.credit_reset_trigger_user",
        actor=current_admin,
        resource_type="user",
        resource_id=user_id,
        detail={"did_reset": did_reset},
        request=request,
    )
    return {"ok": True, "user_id": user_id, "did_reset": did_reset}
