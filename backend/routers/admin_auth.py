"""管理员认证路由 - 独立于用户认证。

安全加固：
- IP 限速（slowapi）：login 5/min、refresh 30/min，生产用 RATE_LIMIT_ENABLED=true 生效
- 账户锁定（login_lockout）：同一 email 或 IP 连续 5 次失败 → 锁 15 分钟
- 审计落库（audit.record）：所有登录尝试（成功/失败/锁定）均记入 audit_logs 表
"""
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
from ratelimit import ip_limiter
from services import audit
from services import login_lockout

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/admin/auth",
    tags=["admin_auth"],
    responses={404: {"description": "Not found"}},
)


# 统一的认证失败提示（防账户枚举：邮箱不存在与密码错误使用同一文案）
_AUTH_FAIL_DETAIL = "邮箱或密码错误"


async def _record_login_attempt(
    *,
    request: Request,
    email: str,
    admin: Admin | None,
    status_str: str,
    reason: str,
) -> None:
    """统一写入登录尝试到 audit_logs（fire-and-forget，不阻塞请求）。"""
    audit.record(
        action="admin.login",
        actor=admin,
        resource_type="admin",
        resource_id=(admin.id if admin else None),
        status=status_str,
        detail={"email": email, "reason": reason},
        request=request,
    )


@router.post("/login", response_model=AdminTokenResponse)
@ip_limiter.limit("5/minute")
async def admin_login(
    body: AdminLogin,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """管理员登录。

    安全门：
    1. IP 限速 5/min
    2. 锁定检查：email/ip 任一被锁则拒绝
    3. 账号验证失败 → 两个维度均 record_failure
    4. 成功 → 两个维度均 reset + 审计落库
    """
    client_ip = request.client.host if request.client else None
    email = body.email

    # 1. 锁定闸（任一维度锁定都拒绝，避免泄露是哪个维度）
    email_locked = await login_lockout.is_locked("email", email)
    ip_locked = await login_lockout.is_locked("ip", client_ip or "")
    if email_locked or ip_locked:
        ttl = max(
            await login_lockout.remaining_ttl("email", email),
            await login_lockout.remaining_ttl("ip", client_ip or ""),
        )
        await _record_login_attempt(
            request=request, email=email, admin=None,
            status_str="fail", reason="locked",
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"登录尝试过多，请 {max(60, ttl) // 60} 分钟后重试",
            headers={"Retry-After": str(max(60, ttl))},
        )

    result = await db.execute(select(Admin).filter(Admin.email == email))
    admin = result.scalars().first()

    # 2. 邮箱不存在
    if not admin:
        await login_lockout.record_failure("email", email)
        await login_lockout.record_failure("ip", client_ip or "")
        await _record_login_attempt(
            request=request, email=email, admin=None,
            status_str="fail", reason="user_not_found",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_AUTH_FAIL_DETAIL,
        )

    # 3. 密码错误
    if not verify_password(body.password, admin.password_hash):
        await login_lockout.record_failure("email", email)
        await login_lockout.record_failure("ip", client_ip or "")
        await _record_login_attempt(
            request=request, email=email, admin=admin,
            status_str="fail", reason="wrong_password",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_AUTH_FAIL_DETAIL,
        )

    # 4. 账号被禁用（不计入锁定计数：凭证正确但状态问题，应走人工恢复）
    if not admin.is_active:
        await _record_login_attempt(
            request=request, email=email, admin=admin,
            status_str="fail", reason="account_disabled",
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账户已被禁用",
        )

    # 5. 成功：重置失败计数器 + 更新登录信息 + 审计落库
    await login_lockout.reset("email", email)
    await login_lockout.reset("ip", client_ip or "")

    admin.last_login_at = datetime.now(timezone.utc)
    admin.last_login_ip = client_ip
    await db.commit()
    await db.refresh(admin)

    await _record_login_attempt(
        request=request, email=email, admin=admin,
        status_str="success", reason="ok",
    )

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
@ip_limiter.limit("30/minute")
async def admin_refresh_token(
    body: TokenRefresh,
    request: Request,
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
