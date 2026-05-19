from datetime import datetime, timezone, timedelta
import logging
from decimal import Decimal

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
from auth_revocation import revoke as revoke_jti, is_revoked
from auth_rotation import try_set_rotated, get_rotated
from services import audit
from services import email_verification as ev
from services.email_providers.base import (
    EmailProviderError,
    EmailProviderNotConfigured,
)
from services.email_providers.dispatcher import send_email
from ratelimit import limiter, ip_limiter
from config import settings
from database import get_db
from models import User, CreditTransaction, SubscriptionPlan
from schemas import (
    UserRegister,
    UserLogin,
    TokenRefresh,
    TokenResponse,
    AccessTokenResponse,
    UserResponse,
    UserPreferencesUpdate,
    CreditTransactionResponse,
    EmailCodeSendRequest,
    EmailCodeSendResponse,
    EmailCodeVerifyRequest,
    EmailCodeVerifyResponse,
    PasswordChangeRequest,
    PasswordResetRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/auth",
    tags=["auth"],
)


async def _build_user_response(user: User, db: AsyncSession) -> UserResponse:
    """构造 UserResponse 并 join 套餐名/类型，供 /register、/login、/me、/preferences 等笔端统一使用。

    设计目标：前端只依赖 User 返回结构即可展示真实套餐名（避免硬编码“Pro/Free”）。
    - user.subscription_plan_id 为空（非注册或未激活）：返回的 name/tier_type 为 None，前端降级展示“未订阅”
    - 套餐被删除或移除关联：同上，join 结果为 None，降级逻辑可用
    """
    resp = UserResponse.model_validate(user)
    plan_id = getattr(user, "subscription_plan_id", None)
    if plan_id:
        plan = await db.scalar(
            select(SubscriptionPlan).where(SubscriptionPlan.id == plan_id)
        )
        if plan:
            resp.subscription_plan_name = plan.name
            resp.subscription_tier_type = plan.tier_type
    return resp


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@ip_limiter.limit("5/minute")
async def register(
    body: UserRegister,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user account."""
    # Email verification gate（settings.EMAIL_VERIFICATION_REQUIRED 控制是否强校验）
    require_verify = bool(getattr(settings, "EMAIL_VERIFICATION_REQUIRED", False))
    if require_verify:
        ok = bool(body.verify_token) and await ev.consume_pass_token(
            body.email, ev.PURPOSE_REGISTER, body.verify_token
        )
        ok or (_ for _ in ()).throw(
            HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email verification required or token expired",
            )
        )

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

    # Free Tier 自动开通：按 tier_type='free_tier' 匹配注册套餐
    # - 初始积分完全由 Free Tier 套餐的 credits 字段决定（不再走 credit_policy.new_user_initial_credits）
    from services.credit_reset import compute_next_reset_at
    from services.billing import record_credit_grant
    # - 价格/分类一致性由 schemas.SubscriptionPlanBase 校验保证
    # - 排序：sort_order ASC + id ASC tie-breaker，多个同类套餐时稳定命中同一个
    # - 开始时间 = 注册时刻；结束时间 = +30 天（业务约定）
    # - next_credit_reset_at = 下月 1 日 UTC 00:00，由已有的 maybe_reset_monthly_credits 懒触发月度重置
    # - Free plan 不存在时降级为 inactive，不阻塞注册
    now = datetime.now(timezone.utc)
    free_plan = await db.scalar(
        select(SubscriptionPlan)
        .where(SubscriptionPlan.is_active.is_(True))
        .where(SubscriptionPlan.tier_type == "free_tier")
        .order_by(SubscriptionPlan.sort_order, SubscriptionPlan.id)
        .limit(1)
    )
    initial_credits = 0.0
    if free_plan:
        user.subscription_plan_id = free_plan.id
        user.subscription_status = "active"
        user.subscription_start_at = now
        user.subscription_end_at = now + timedelta(days=30)
        user.next_credit_reset_at = compute_next_reset_at(now)
        # 用 Free Tier 套餐的 credits 作为注册初始余额
        initial_credits = float(free_plan.credits or 0)
        initial_credits > 0 and setattr(user, "credits", Decimal(str(initial_credits)))

    db.add(user)
    await db.flush()  # 先拿到 user.id

    # 写入审计轨迹（余额已直接赋值，record_credit_grant 不重复加）
    initial_credits > 0 and await record_credit_grant(
        user_id=user.id,
        amount=initial_credits,
        session=db,
        balance_after=initial_credits,
        description=f"新用户注册赠送（Free Tier：{free_plan.name if free_plan else ''}）",
        idempotency_key=f"register_bonus:{user.id}",
        metadata={"kind": "register_bonus", "plan_id": free_plan.id if free_plan else None},
        transaction_type="recharge",
    )

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

    # Lazy 月度积分重置：登录路径触发（用户可感知）
    from services.credit_reset import maybe_reset_monthly_credits
    try:
        await maybe_reset_monthly_credits(user.id, db)
    except Exception as _e:
        logger.warning("monthly reset failed at login user=%s err=%s", user.id, _e)

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
        user=await _build_user_response(user, db),
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

    一次性轮换 + 5 秒幂等窗口：
    - 首次成功：生成新 access/refresh，写入 rotation 缓存，将旧 jti 加入黑名单
    - 窗口内并发重放（多页签并发刷新）：返回同一套新 token，避免跨页签互相踢下线
    - 窗口外重放：旧 jti 已进黑名单，直接 401
    """
    payload = decode_token(body.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    jti = payload.get("jti")

    # 幂等快路径：5 秒窗口内已轮换过则直接返回
    cached = await get_rotated(jti)
    if cached:
        return AccessTokenResponse(**cached)

    # 黑名单校验：窗口外重放直接拒绝
    if await is_revoked(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    user = await db.scalar(select(User).filter(User.id == user_id)) if user_id else None

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or disabled",
        )

    # 刷新时也更新活跃时间，确保已登录用户被统计为活跃
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    access_token = create_access_token(user.id, user.role)
    new_refresh_token = create_refresh_token(user.id)
    response_payload = {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }

    # NX 写入幂等缓存：赢家继续 revoke；输家读回赢家结果
    won = await try_set_rotated(jti, response_payload)
    if not won:
        cached = await get_rotated(jti)
        if cached:
            return AccessTokenResponse(**cached)

    # 旧 refresh token 入黑名单（一次性轮换）
    await revoke_jti(jti, _remaining_ttl(payload))

    return AccessTokenResponse(**response_payload)


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
async def me(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the authenticated user's profile."""
    # Lazy 月度重置：/me 是高频用户可感知端点，到期才会真正执行
    from services.credit_reset import maybe_reset_monthly_credits
    try:
        did_reset = await maybe_reset_monthly_credits(current_user.id, db)
        did_reset and await db.refresh(current_user)
    except Exception as _e:
        logger.warning("monthly reset failed at /me user=%s err=%s", current_user.id, _e)
    return await _build_user_response(current_user, db)


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
    return await _build_user_response(user, db)


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
    # 用 func.date() 而非 cast(..., Date)：
    #  - SQLite 下 CAST(... AS DATE) 会被当作 NUMERIC 返回整数，触发 fromisoformat 报错
    #  - func.date() 在 SQLite/PostgreSQL 两端均可用，且不强制类型转换
    date_col = sa_func.date(CreditTransaction.created_at)
    # 用 Python 侧计算 cutoff，避开 SQLite/PostgreSQL 的 INTERVAL 语法差异
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(
            date_col.label("date"),
            sa_func.sum(sa_func.abs(CreditTransaction.amount)).label("total"),
        )
        .filter(
            CreditTransaction.user_id == current_user.id,
            CreditTransaction.amount < 0,  # 仅统计消耗
            CreditTransaction.created_at >= cutoff,
        )
        .group_by(date_col)
        .order_by(date_col)
    )
    rows = result.all()
    return [{"date": str(r.date), "total": round(float(r.total or 0), 2)} for r in rows]


# ===========================================================================
# Email verification endpoints
#
# 安全考量：
# - send/verify 均按 IP 限流，并在服务层以 60s 冷却为同邮箱二重保护
# - register 场景：邮箱冲突仍然允许发送（不暴露 enumeration），调用方在表单提交时
#   反馈 409；但为了避免被利用发邮件，这里仅限流不拦截
# - reset_password 场景：邮箱不存在也返回 200（避免账号反查），但内部不发邮件
# ===========================================================================
_PURPOSE_TO_EV: dict[str, str] = {
    "register": ev.PURPOSE_REGISTER,
    "change_password": ev.PURPOSE_CHANGE_PASSWORD,
    "reset_password": ev.PURPOSE_RESET_PASSWORD,
}


async def _dispatch_code_email(
    db: AsyncSession,
    *,
    to: str,
    purpose: str,
    code: str,
    locale: str,
) -> None:
    """调用邮件服务发送验证码；上游异常转换为 HTTP 状态。"""
    template_code = ev.get_template_code(purpose)
    variables = {
        "code": code,
        "expires_minutes": ev.CODE_TTL_SECONDS // 60,
        "email": to,
    }
    try:
        await send_email(
            db,
            to=to,
            code=template_code,
            locale=locale,
            variables=variables,
        )
    except EmailProviderNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email service not configured",
        ) from exc
    except EmailProviderError as exc:
        logger.warning("send code failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send verification email",
        ) from exc


@router.post("/email-code/send", response_model=EmailCodeSendResponse)
@ip_limiter.limit("5/minute")
async def send_email_code(
    body: EmailCodeSendRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """发送邮件验证码。Purpose 决定所用模板与后续可消费的业务场景。"""
    purpose = _PURPOSE_TO_EV.get(body.purpose) or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="Invalid purpose")
    )

    # reset_password 场景：静默处理不存在的邮箱，避免 enumeration
    if purpose == ev.PURPOSE_RESET_PASSWORD:
        existing = await db.scalar(select(User).filter(User.email == body.email))
        if not existing:
            return EmailCodeSendResponse(
                sent=True,
                expires_in=ev.CODE_TTL_SECONDS,
                cooldown=ev.COOLDOWN_SECONDS,
            )

    try:
        result = await ev.issue_code(body.email, purpose)
    except ev.EmailVerificationError as exc:
        # 冷却中等业务错误
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
        ) from exc

    locale = (request.headers.get("accept-language") or "zh-CN").split(",")[0].strip()
    locale = locale if locale in ("zh-CN", "en-US") else "zh-CN"
    await _dispatch_code_email(
        db, to=body.email, purpose=purpose, code=result.code, locale=locale
    )
    return EmailCodeSendResponse(
        sent=True,
        expires_in=result.expires_in,
        cooldown=result.cooldown,
    )


@router.post("/email-code/verify", response_model=EmailCodeVerifyResponse)
@ip_limiter.limit("10/minute")
async def verify_email_code(
    body: EmailCodeVerifyRequest,
    request: Request,
):
    """校验邮件验证码；通过则返回一次性 token。"""
    purpose = _PURPOSE_TO_EV.get(body.purpose) or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="Invalid purpose")
    )
    res = await ev.verify_code(body.email, purpose, body.code)
    return EmailCodeVerifyResponse(
        ok=res.ok,
        token=res.token,
        expires_in=ev.PASS_TOKEN_TTL_SECONDS if res.ok else None,
        reason=res.reason,
    )


@router.post("/password/change", status_code=status.HTTP_204_NO_CONTENT)
@ip_limiter.limit("5/minute")
async def change_password(
    body: PasswordChangeRequest,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    access_token: str = Depends(oauth2_scheme),
):
    """已登录用户修改密码；需提供 verify_token (purpose=change_password)。

    成功后：
    - 更新 password_hash
    - 将当前 access token 加入黑名单，强制重新登录
    """
    ok = await ev.consume_pass_token(
        current_user.email, ev.PURPOSE_CHANGE_PASSWORD, body.verify_token
    )
    ok or (_ for _ in ()).throw(
        HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email verification required or token expired",
        )
    )
    verify_password(body.old_password, current_user.password_hash) or (_ for _ in ()).throw(
        HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect old password",
        )
    )

    current_user.password_hash = hash_password(body.new_password)
    await db.commit()

    # 失效当前 access token（refresh 需前端主动 logout）
    await _try_revoke(access_token)

    audit.record(
        action="auth.password_change",
        actor=current_user,
        resource_type="user",
        resource_id=current_user.id,
        request=request,
    )
    return None


@router.post("/password/reset", status_code=status.HTTP_204_NO_CONTENT)
@ip_limiter.limit("5/minute")
async def reset_password(
    body: PasswordResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """忘密场景重置密码（匿名）。

    严格要求 verify_token 有效，用于表明用户能读取该邮箱。
    邮箱不存在时仍报 400（token 验证依然失败），避免不一致跳转逻辑。
    """
    ok = await ev.consume_pass_token(
        body.email, ev.PURPOSE_RESET_PASSWORD, body.verify_token
    )
    ok or (_ for _ in ()).throw(
        HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email verification required or token expired",
        )
    )
    user = await db.scalar(select(User).filter(User.email == body.email))
    user or (_ for _ in ()).throw(
        HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    )

    user.password_hash = hash_password(body.new_password)
    await db.commit()

    audit.record(
        action="auth.password_reset",
        actor=user,
        resource_type="user",
        resource_id=user.id,
        request=request,
    )
    return None
