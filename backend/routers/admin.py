from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, delete
from typing import List, Dict, Any, Optional

from database import get_db
from models import User, LLMProvider, Asset, Admin, CreditTransaction, SubscriptionPlan, ChatSession, Theater
from auth import require_admin, hash_password
from schemas import (
    CreditAdjustRequest,
    CreditTransactionResponse,
    SubscriptionAssignRequest,
    AdminCreate,
    AdminUpdate,
    AdminResponse,
)

router = APIRouter(
    prefix="/api/admin",
    tags=["admin_general"],
    responses={404: {"description": "Not found"}},
)


# ---------------------------------------------------------------------------
# Dashboard stats
# ---------------------------------------------------------------------------
@router.get("/stats", response_model=Dict[str, int])
async def get_stats(
    _current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard statistics."""
    user_count = await db.scalar(select(func.count(User.id)))
    theater_count = await db.scalar(select(func.count(Theater.id)))
    asset_count = await db.scalar(select(func.count(Asset.id)))
    provider_count = await db.scalar(select(func.count(LLMProvider.id)))
    admin_count = await db.scalar(select(func.count(Admin.id)))

    return {
        "users": user_count or 0,
        "theaters": theater_count or 0,
        "assets": asset_count or 0,
        "providers": provider_count or 0,
        "admins": admin_count or 0,
    }


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------
@router.get("/users", response_model=List[Dict[str, Any]])
async def get_users(
    skip: int = 0,
    limit: int = 50,
    _current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List users with basic info (admin only)."""
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)
    )
    users = result.scalars().all()

    return [
        {
            "id": u.id,
            "email": u.email,
            "nickname": u.nickname,
            "is_active": u.is_active,
            "is_balance_frozen": u.is_balance_frozen,
            "total_input_tokens": u.total_input_tokens or 0,
            "total_output_tokens": u.total_output_tokens or 0,
            "credits": u.credits or 0.0,
            "storage_used_bytes": u.storage_used_bytes or 0,
            "storage_quota_bytes": u.storage_quota_bytes or 2147483648,
            "subscription_plan_id": u.subscription_plan_id,
            "subscription_status": u.subscription_status,
            "subscription_start_at": u.subscription_start_at,
            "subscription_end_at": u.subscription_end_at,
            "register_ip": u.register_ip,
            "last_login_ip": u.last_login_ip,
            "last_login_at": u.last_login_at,
            "last_device_type": u.last_device_type,
            "last_os": u.last_os,
            "last_browser": u.last_browser,
            "created_at": u.created_at,
        }
        for u in users
    ]


@router.get("/users/{user_id}", response_model=Dict[str, Any])
async def get_user_detail(
    user_id: str,
    _current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get user detail by ID."""
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "id": user.id,
        "email": user.email,
        "nickname": user.nickname,
        "is_active": user.is_active,
        "is_balance_frozen": user.is_balance_frozen,
        "total_input_tokens": user.total_input_tokens or 0,
        "total_output_tokens": user.total_output_tokens or 0,
        "credits": user.credits or 0.0,
        "storage_used_bytes": user.storage_used_bytes or 0,
        "storage_quota_bytes": user.storage_quota_bytes or 2147483648,
        "subscription_plan_id": user.subscription_plan_id,
        "subscription_status": user.subscription_status,
        "subscription_start_at": user.subscription_start_at,
        "subscription_end_at": user.subscription_end_at,
        "register_ip": user.register_ip,
        "last_login_ip": user.last_login_ip,
        "last_login_at": user.last_login_at,
        "last_device_type": user.last_device_type,
        "last_os": user.last_os,
        "last_browser": user.last_browser,
        "created_at": user.created_at,
    }


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    _current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user and their related data (admin only)."""
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 级联删除关联数据
    await db.execute(delete(CreditTransaction).where(CreditTransaction.user_id == user_id))
    await db.execute(delete(ChatSession).where(ChatSession.user_id == user_id))
    await db.execute(delete(Theater).where(Theater.user_id == user_id))

    await db.delete(user)
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Credits management
# ---------------------------------------------------------------------------
@router.post("/users/{user_id}/credits/adjust")
async def adjust_user_credits(
    user_id: str,
    body: CreditAdjustRequest,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """管理员手动调整用户积分（充值/扣除）"""
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    balance_before = user.credits or 0.0
    balance_after = max(0, balance_before + body.amount)  # 不允许负数余额

    # 更新用户积分
    user.credits = balance_after

    # 记录交易类型
    transaction_type = "recharge" if body.amount > 0 else "admin_adjust"

    # 创建交易记录
    transaction = CreditTransaction(
        user_id=user_id,
        transaction_type=transaction_type,
        amount=body.amount,
        balance_before=balance_before,
        balance_after=balance_after,
        description=body.description,
        metadata_json={
            "admin_id": current_admin.id,
            "admin_email": current_admin.email,
            "operation": "manual",
        },
    )
    db.add(transaction)
    await db.commit()
    await db.refresh(user)

    return {
        "ok": True,
        "balance_before": balance_before,
        "balance_after": balance_after,
        "amount": body.amount,
    }


@router.get("/users/{user_id}/credits/history", response_model=List[CreditTransactionResponse])
async def get_user_credits_history(
    user_id: str,
    skip: int = 0,
    limit: int = 50,
    _current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取用户积分变动历史"""
    # 验证用户存在
    user_result = await db.execute(select(User).filter(User.id == user_id))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(CreditTransaction)
        .filter(CreditTransaction.user_id == user_id)
        .order_by(CreditTransaction.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    transactions = result.scalars().all()

    return [CreditTransactionResponse.model_validate(t) for t in transactions]


# ---------------------------------------------------------------------------
# Subscription management
# ---------------------------------------------------------------------------
@router.put("/users/{user_id}/subscription")
async def assign_user_subscription(
    user_id: str,
    body: SubscriptionAssignRequest,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """管理员手动设置用户订阅"""
    # 查询用户
    user_result = await db.execute(select(User).filter(User.id == user_id))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 查询订阅套餐
    plan_result = await db.execute(select(SubscriptionPlan).filter(SubscriptionPlan.id == body.plan_id))
    plan = plan_result.scalars().first()
    if not plan:
        raise HTTPException(status_code=404, detail="Subscription plan not found")

    # 更新用户订阅信息
    user.subscription_plan_id = body.plan_id
    user.subscription_status = "active"
    user.subscription_start_at = body.start_at
    user.subscription_end_at = body.end_at

    # 自动发放积分
    credits_granted = 0.0
    if body.auto_grant_credits:
        balance_before = user.credits or 0.0
        credits_granted = plan.credits
        user.credits = balance_before + credits_granted

        # 记录积分交易
        transaction = CreditTransaction(
            user_id=user_id,
            transaction_type="recharge",
            amount=credits_granted,
            balance_before=balance_before,
            balance_after=user.credits,
            description=f"订阅套餐发放: {plan.name}",
            metadata_json={
                "admin_id": current_admin.id,
                "plan_id": plan.id,
                "plan_name": plan.name,
                "operation": "subscription_grant",
            },
        )
        db.add(transaction)

    await db.commit()
    await db.refresh(user)

    return {
        "ok": True,
        "plan_id": plan.id,
        "plan_name": plan.name,
        "credits_granted": credits_granted,
        "subscription_status": user.subscription_status,
    }


@router.delete("/users/{user_id}/subscription")
async def cancel_user_subscription(
    user_id: str,
    _current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """取消用户订阅"""
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.subscription_plan_id = None
    user.subscription_status = "inactive"
    user.subscription_start_at = None
    user.subscription_end_at = None

    await db.commit()

    return {"ok": True}


# ---------------------------------------------------------------------------
# Admin management
# ---------------------------------------------------------------------------
@router.get("/admins", response_model=List[AdminResponse])
async def list_admins(
    skip: int = 0,
    limit: int = 50,
    _current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """列出所有管理员"""
    result = await db.execute(
        select(Admin).order_by(Admin.created_at.desc()).offset(skip).limit(limit)
    )
    admins = result.scalars().all()
    return [AdminResponse.model_validate(a) for a in admins]


@router.post("/admins", response_model=AdminResponse)
async def create_admin(
    body: AdminCreate,
    _current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """创建新管理员"""
    # 检查邮箱是否已存在
    existing = await db.execute(select(Admin).filter(Admin.email == body.email))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="邮箱已被使用")

    admin = Admin(
        email=body.email,
        nickname=body.nickname,
        password_hash=hash_password(body.password),
        permission_level=body.permission_level,
    )
    db.add(admin)
    await db.commit()
    await db.refresh(admin)

    return AdminResponse.model_validate(admin)


@router.get("/admins/{admin_id}", response_model=AdminResponse)
async def get_admin_detail(
    admin_id: str,
    _current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取管理员详情"""
    result = await db.execute(select(Admin).filter(Admin.id == admin_id))
    admin = result.scalars().first()
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")

    return AdminResponse.model_validate(admin)


@router.put("/admins/{admin_id}", response_model=AdminResponse)
async def update_admin(
    admin_id: str,
    body: AdminUpdate,
    _current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """更新管理员信息"""
    result = await db.execute(select(Admin).filter(Admin.id == admin_id))
    admin = result.scalars().first()
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")

    # 更新字段（使用映射表驱动）
    update_fields = {
        "nickname": body.nickname,
        "permission_level": body.permission_level,
        "is_active": body.is_active,
    }
    
    for field, value in update_fields.items():
        if value is not None:
            setattr(admin, field, value)

    # 密码单独处理
    if body.password:
        admin.password_hash = hash_password(body.password)

    await db.commit()
    await db.refresh(admin)

    return AdminResponse.model_validate(admin)


@router.delete("/admins/{admin_id}")
async def delete_admin(
    admin_id: str,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """删除管理员"""
    # 不允许删除自己
    if admin_id == current_admin.id:
        raise HTTPException(status_code=400, detail="不能删除自己的账户")

    result = await db.execute(select(Admin).filter(Admin.id == admin_id))
    admin = result.scalars().first()
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")

    await db.delete(admin)
    await db.commit()

    return {"ok": True}


# ---------------------------------------------------------------------------
# Admin credits management
# ---------------------------------------------------------------------------
@router.post("/admins/{admin_id}/credits/adjust")
async def adjust_admin_credits(
    admin_id: str,
    body: CreditAdjustRequest,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """调整管理员积分（可给自己或其他管理员充值/扣除）"""
    result = await db.execute(select(Admin).filter(Admin.id == admin_id))
    admin = result.scalars().first()

    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")

    balance_before = admin.credits or 0.0
    balance_after = max(0, balance_before + body.amount)

    admin.credits = balance_after

    transaction_type = "recharge" if body.amount > 0 else "admin_adjust"

    transaction = CreditTransaction(
        admin_id=admin_id,
        transaction_type=transaction_type,
        amount=body.amount,
        balance_before=balance_before,
        balance_after=balance_after,
        description=body.description,
        metadata_json={
            "operator_id": current_admin.id,
            "operator_email": current_admin.email,
            "operation": "manual",
        },
    )
    db.add(transaction)
    await db.commit()
    await db.refresh(admin)

    return {
        "ok": True,
        "balance_before": balance_before,
        "balance_after": balance_after,
        "amount": body.amount,
    }


# ---------------------------------------------------------------------------
# Theater management
# ---------------------------------------------------------------------------
@router.get("/theaters", response_model=List[Dict[str, Any]])
async def get_theaters(
    skip: int = 0,
    limit: int = 50,
    user_id: Optional[str] = None,
    _current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List theaters (admin only)."""
    query = select(Theater).order_by(Theater.created_at.desc())

    filter_map = {
        True: lambda q: q.filter(Theater.user_id == user_id),
        False: lambda q: q,
    }
    query = filter_map[user_id is not None](query)

    result = await db.execute(query.offset(skip).limit(limit))
    theaters = result.scalars().all()

    return [
        {
            "id": t.id,
            "user_id": t.user_id,
            "title": t.title,
            "status": t.status,
            "node_count": t.node_count,
            "created_at": t.created_at,
        }
        for t in theaters
    ]
