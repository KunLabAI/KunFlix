from datetime import datetime, timezone
import logging

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func as sa_func
from user_agents import parse as parse_ua

from auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_active_user,
    oauth2_scheme,
)
from auth_revocation import revoke as revoke_jti
from services import audit
from ratelimit import limiter, ip_limiter
from config import settings
from database import get_db
from models import User, CreditTransaction
from schemas import (
    UserRegister,
    UserLogin,
    TokenRefresh,
    TokenResponse,
    AccessTokenResponse,
    UserResponse,
    UserPreferencesUpdate,
    CreditTransactionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/auth",
    tags=["auth"],
)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@ip_limiter.limit("5/minute")
async def register(
    body: UserRegister,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user account."""
    # Check email uniqueness
    existing = await db.scalar(select(User).filter(User.email == body.email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=body.email,
        nickname=body.nickname,
        password_hash=hash_password(body.password),
        register_ip=request.client.host if request.client else None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
@ip_limiter.limit("10/minute")
async def login(
    body: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with email + password and receive JWT tokens."""
    user = await db.scalar(select(User).filter(User.email == body.email))

    bad_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not user:
        raise bad_credentials
    if not verify_password(body.password, user.password_hash):
        raise bad_credentials
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    # Update login metadata
    user.last_login_at = datetime.now(timezone.utc)
    user.last_login_ip = request.client.host if request.client else None

    # Parse device info from User-Agent
    ua_string = request.headers.get("user-agent", "")
    ua = parse_ua(ua_string)
    # 设备类型映射表
    _device_type_map = {True: "mobile", False: "tablet"}
    device_type = _device_type_map.get(ua.is_mobile, "tablet") if (ua.is_mobile or ua.is_tablet) else "desktop"
    user.last_device_type = device_type
    user.last_os = f"{ua.os.family} {ua.os.version_string}".strip()
    user.last_browser = f"{ua.browser.family} {ua.browser.version_string}".strip()
    user.last_user_agent = ua_string[:500]

    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id)

    audit.record(
        action="auth.login", actor=user,
        resource_type="user", resource_id=user.id,
        detail={"device_type": device_type},
        request=request,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user),
    )


def _remaining_ttl(payload: dict) -> int:
    """根据 payload['exp'] 计算剩余有效秒数（向下取整，最小 0）。"""
    exp = int(payload.get("exp") or 0)
    now = int(datetime.now(timezone.utc).timestamp())
    return max(0, exp - now)


@router.post("/refresh", response_model=AccessTokenResponse)
@limiter.limit("30/minute")
async def refresh(
    body: TokenRefresh,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Exchange a refresh token for a new access token.

    旧 refresh token 一次性轮换：成功换发后将旧 jti 加入黑名单，防止重放。
    """
    # 使用 decode_token_checked：若旧 refresh 已被撤销（例如某次轮换后重放）直接 401
    from auth import decode_token_checked  # 局部导入避免循环
    payload = await decode_token_checked(body.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload.get("sub")
    user = await db.scalar(select(User).filter(User.id == user_id)) if user_id else None

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or disabled",
        )

    # 刷新 token 时也更新活跃时间，确保已登录用户被统计为活跃
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    # 旧 refresh token 入黑名单（一次性轮换）
    await revoke_jti(payload.get("jti"), _remaining_ttl(payload))

    # 同步颁发新的 refresh_token，避免前端持有被拉黑的旧 token 导致二次刷新失败
    access_token = create_access_token(user.id, user.role)
    new_refresh_token = create_refresh_token(user.id)
    return AccessTokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    body: TokenRefresh,
    access_token: str = Depends(oauth2_scheme),
):
    """主动登出：将当前 access token 与传入的 refresh token 同时加入黑名单。

    设计要点：
    - 解码失败/类型错误等异常一律静默成功，避免登出端点泄漏 token 状态
    - TTL 跟随 token 自身剩余有效期，过期自动失效
    """
    _safe_revoke = lambda token: _try_revoke(token)
    await _safe_revoke(access_token)
    await _safe_revoke(body.refresh_token)
    audit.record(action="auth.logout")
    return None


async def _try_revoke(token: str) -> None:
    """尽力解码并撤销，任何异常都吞掉。"""
    try:
        payload = decode_token(token)
    except HTTPException:
        return
    await revoke_jti(payload.get("jti"), _remaining_ttl(payload))


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_active_user)):
    """Return the authenticated user's profile."""
    return current_user


@router.patch("/preferences", response_model=UserResponse)
async def update_preferences(
    body: UserPreferencesUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """更新用户偏好设置（主题、语言）"""
    VALID_THEMES = {"light", "dark", "system"}
    VALID_LANGS = {"zh-CN", "en-US"}

    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalars().first()

    updates = body.model_dump(exclude_none=True)
    # 校验值是否合法（用映射表驱动）
    field_validators = {
        "preferred_theme": VALID_THEMES,
        "preferred_language": VALID_LANGS,
    }
    for field, allowed in field_validators.items():
        val = updates.get(field)
        val and val not in allowed and (_ for _ in ()).throw(
            HTTPException(status_code=422, detail=f"Invalid {field}: {val}")
        )

    for field, val in updates.items():
        setattr(user, field, val)

    await db.commit()
    await db.refresh(user)
    return user


@router.get("/credits/history", response_model=List[CreditTransactionResponse])
async def credits_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """获取当前用户的积分变动历史"""
    result = await db.execute(
        select(CreditTransaction)
        .filter(CreditTransaction.user_id == current_user.id)
        .order_by(CreditTransaction.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return [CreditTransactionResponse.model_validate(t) for t in result.scalars().all()]


@router.get("/credits/daily-usage")
async def credits_daily_usage(
    days: int = Query(30, ge=1, le=90),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """获取当前用户最近N天的每日积分消耗聚合"""
    result = await db.execute(
        select(
            sa_func.date(CreditTransaction.created_at).label("date"),
            sa_func.sum(sa_func.abs(CreditTransaction.amount)).label("total"),
        )
        .filter(
            CreditTransaction.user_id == current_user.id,
            CreditTransaction.amount < 0,  # 仅统计消耗
            CreditTransaction.created_at >= sa_func.date("now", f"-{days} days"),
        )
        .group_by(sa_func.date(CreditTransaction.created_at))
        .order_by(sa_func.date(CreditTransaction.created_at))
    )
    rows = result.all()
    return [{"date": str(r.date), "total": round(float(r.total or 0), 2)} for r in rows]
