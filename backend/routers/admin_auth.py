"""管理员认证路由 - 独立于用户认证"""
import logging
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
from auth_revocation import revoke as revoke_jti, is_revoked
from auth_rotation import try_set_rotated, get_rotated
from config import settings

logger = logging.getLogger(__name__)

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
    client_ip = request.client.host if request.client else None
    
    logger.info(f"Admin login attempt: email={body.email}, ip={client_ip}")
    
    result = await db.execute(select(Admin).filter(Admin.email == body.email))
    admin = result.scalars().first()

    # 验证管理员存在
    if not admin:
        logger.warning(f"Admin login failed: admin not found, email={body.email}, ip={client_ip}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
        )
    
    # 验证密码
    if not verify_password(body.password, admin.password_hash):
        logger.warning(f"Admin login failed: invalid password, email={body.email}, ip={client_ip}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码错误",
        )

    if not admin.is_active:
        logger.warning(f"Admin login failed: account disabled, email={body.email}, ip={client_ip}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被禁用",
        )
    
    logger.info(f"Admin login successful: email={body.email}, admin_id={admin.id}")

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


def _remaining_ttl(payload: dict) -> int:
    """根据 payload['exp'] 计算剩余有效秒数（向下取整，最小 0）。"""
    exp = int(payload.get("exp") or 0)
    now = int(datetime.now(timezone.utc).timestamp())
    return max(0, exp - now)


@router.post("/refresh", response_model=AccessTokenResponse)
async def admin_refresh_token(
    body: TokenRefresh,
    db: AsyncSession = Depends(get_db),
):
    """刷新管理员 Access Token

    与用户端对齐：一次性轮换 + 5 秒幂等窗口 + 旧 jti 黑名单。
    """
    payload = decode_token(body.refresh_token)

    is_refresh = payload.get("type") == "refresh"
    is_admin_type = payload.get("subject_type") == "admin"
    admin_id = payload.get("sub")

    if not (is_refresh and is_admin_type and admin_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    jti = payload.get("jti")

    # 幂等快路径：5 秒窗口内已轮换过则直接返回
    cached = await get_rotated(jti)
    if cached:
        return AccessTokenResponse(**cached)

    # 黑名单校验：窗口外重放拒绝
    if await is_revoked(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(Admin).filter(Admin.id == admin_id))
    admin = result.scalars().first()

    if not admin or not admin.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin not found or disabled",
        )

    new_access_token = create_access_token(admin.id, "admin", subject_type="admin")
    new_refresh_token = create_refresh_token(admin.id, subject_type="admin")
    response_payload = {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }

    won = await try_set_rotated(jti, response_payload)
    if not won:
        cached = await get_rotated(jti)
        if cached:
            return AccessTokenResponse(**cached)

    await revoke_jti(jti, _remaining_ttl(payload))

    return AccessTokenResponse(**response_payload)


@router.get("/me", response_model=AdminResponse)
async def get_current_admin_info(
    current_admin: Admin = Depends(get_current_active_admin),
):
    """获取当前登录管理员信息"""
    return AdminResponse.model_validate(current_admin)
