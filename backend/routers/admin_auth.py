"""管理员认证路由 - 独立于用户认证"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import Admin
from schemas import (
    AdminLogin,
    AdminResponse,
    AdminTokenResponse,
    TokenRefresh,
    AccessTokenResponse,
)
from auth import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_active_admin,
)
from config import settings

router = APIRouter(
    prefix="/api/admin/auth",
    tags=["admin_auth"],
    responses={404: {"description": "Not found"}},
)


@router.post("/login", response_model=AdminTokenResponse)
async def admin_login(
    body: AdminLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """管理员登录"""
    result = await db.execute(select(Admin).filter(Admin.email == body.email))
    admin = result.scalars().first()

    # 验证管理员存在且密码正确
    is_valid = admin and verify_password(body.password, admin.password_hash)
    
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
        )

    if not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被禁用",
        )

    # 更新登录信息
    admin.last_login_at = datetime.now(timezone.utc)
    admin.last_login_ip = request.client.host if request.client else None
    await db.commit()
    await db.refresh(admin)

    # 生成 Token（subject_type 为 "admin"）
    access_token = create_access_token(admin.id, "admin", subject_type="admin")
    refresh_token = create_refresh_token(admin.id, subject_type="admin")

    return AdminTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        admin=AdminResponse.model_validate(admin),
    )


@router.post("/refresh", response_model=AccessTokenResponse)
async def admin_refresh_token(
    body: TokenRefresh,
    db: AsyncSession = Depends(get_db),
):
    """刷新管理员 Access Token"""
    payload = decode_token(body.refresh_token)

    # 验证是 refresh token 且是管理员类型
    is_refresh = payload.get("type") == "refresh"
    is_admin_type = payload.get("subject_type") == "admin"
    admin_id = payload.get("sub")

    if not (is_refresh and is_admin_type and admin_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    # 验证管理员存在
    result = await db.execute(select(Admin).filter(Admin.id == admin_id))
    admin = result.scalars().first()

    if not admin or not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin not found or disabled",
        )

    new_access_token = create_access_token(admin.id, "admin", subject_type="admin")

    return AccessTokenResponse(
        access_token=new_access_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=AdminResponse)
async def get_current_admin_info(
    current_admin: Admin = Depends(get_current_active_admin),
):
    """获取当前登录管理员信息"""
    return AdminResponse.model_validate(current_admin)
