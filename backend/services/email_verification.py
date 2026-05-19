"""Email verification code service.

职责：
- 生成 6 位数字验证码并落入 KV（hash 后存储，避免明码泄漏）
- 维护 60s 发送冷却 + 600s 验证码 TTL
- 验证通过后签发一次性 pass token（10min），业务路由消费后立即删除（防重放）

存储模型（Redis 优先，未配置时自动降级到进程内 TTL store）：
    emailverify:{purpose}:{email}        → JSON: {code_hash, attempts, max_attempts}    TTL=600s
    emailverify_cd:{email}               → "1"                                          TTL=60s
    emailverify_pass:{purpose}:{email}   → token (url-safe 32B)                         TTL=600s

Purpose 枚举：register | change_password | reset_password | admin_test
"""
from __future__ import annotations

import asyncio
import hmac
import json
import logging
import secrets
import time
from dataclasses import dataclass
from hashlib import sha256
from typing import Optional

from cache.client import get_redis
from config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Purpose 白名单（dict 映射替代 if 链）
# ---------------------------------------------------------------------------
PURPOSE_REGISTER = "register"
PURPOSE_CHANGE_PASSWORD = "change_password"
PURPOSE_RESET_PASSWORD = "reset_password"
PURPOSE_ADMIN_TEST = "admin_test"

# 每个 purpose 对应使用的模板 code（与 EmailTemplate.code 对齐）
_PURPOSE_TEMPLATE_CODE: dict[str, str] = {
    PURPOSE_REGISTER: "register_verify",
    PURPOSE_CHANGE_PASSWORD: "change_password",
    PURPOSE_RESET_PASSWORD: "reset_password",
    PURPOSE_ADMIN_TEST: "admin_test",
}


def get_template_code(purpose: str) -> str:
    """Map purpose → email template code; raise on unknown purpose."""
    code = _PURPOSE_TEMPLATE_CODE.get(purpose)
    code or (_ for _ in ()).throw(ValueError(f"Unknown purpose: {purpose!r}"))
    return code


def is_valid_purpose(purpose: str) -> bool:
    return purpose in _PURPOSE_TEMPLATE_CODE


# ---------------------------------------------------------------------------
# 常量（从 settings 读取，默认值与 .env.example 保持一致）
# ---------------------------------------------------------------------------
CODE_TTL_SECONDS = settings.EMAIL_CODE_TTL_SECONDS              # 验证码有效期
COOLDOWN_SECONDS = settings.EMAIL_CODE_RESEND_COOLDOWN          # 同邮箱发送冷却
PASS_TOKEN_TTL_SECONDS = settings.EMAIL_VERIFY_TOKEN_TTL_SECONDS  # 通过后的 token 有效期
DAILY_LIMIT = settings.EMAIL_CODE_DAILY_LIMIT                   # 单 purpose 每日发送上限
MAX_ATTEMPTS = 5              # 单条验证码最多尝试次数
CODE_LENGTH = 6


# ---------------------------------------------------------------------------
# Result 数据类
# ---------------------------------------------------------------------------
@dataclass
class SendCodeResult:
    code: str           # 明文验证码（仅在内存中传给邮件发送器，不落 KV 明文）
    expires_in: int     # 有效期秒数
    cooldown: int       # 冷却秒数


@dataclass
class VerifyResult:
    ok: bool
    token: Optional[str] = None
    reason: Optional[str] = None  # mismatch | expired | exhausted | locked


class EmailVerificationError(RuntimeError):
    """业务可识别的验证码错误（冷却中、purpose 非法等）。"""


# ---------------------------------------------------------------------------
# 哈希：HMAC-SHA256(JWT_SECRET_KEY, code)，避免存明文
# ---------------------------------------------------------------------------
def _hash_code(code: str) -> str:
    secret = (
        settings.EMAIL_CODE_HMAC_KEY
        or settings.JWT_SECRET_KEY
        or "kunflix-emailverify-fallback"
    ).encode("utf-8")
    return hmac.new(secret, code.encode("utf-8"), sha256).hexdigest()


def _const_time_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


# ---------------------------------------------------------------------------
# 双后端 KV（Redis 优先；降级到进程内 TTL dict）
# ---------------------------------------------------------------------------
_NS = "kf:emailverify:"
_mem_store: dict[str, tuple[str, float]] = {}
_mem_lock = asyncio.Lock()


def _mem_purge_expired(now: float) -> None:
    expired = [k for k, (_, exp) in _mem_store.items() if exp <= now]
    [_mem_store.pop(k, None) for k in expired]


async def _mem_get(key: str) -> Optional[str]:
    async with _mem_lock:
        now = time.time()
        _mem_purge_expired(now)
        item = _mem_store.get(key)
        return item[0] if item and item[1] > now else None


async def _mem_set(key: str, value: str, ttl: int) -> None:
    async with _mem_lock:
        _mem_store[key] = (value, time.time() + ttl)


async def _mem_delete(key: str) -> None:
    async with _mem_lock:
        _mem_store.pop(key, None)


async def _kv_get(key: str) -> Optional[str]:
    client = get_redis()
    if client is None:
        return await _mem_get(key)
    try:
        raw = await client.get(_NS + key)
        return raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw
    except Exception as exc:  # noqa: BLE001
        logger.warning("emailverify redis get fallback: %s", exc)
        return await _mem_get(key)


async def _kv_set(key: str, value: str, ttl: int) -> None:
    client = get_redis()
    if client is None:
        await _mem_set(key, value, ttl)
        return
    try:
        await client.set(_NS + key, value, ex=ttl)
    except Exception as exc:  # noqa: BLE001
        logger.warning("emailverify redis set fallback: %s", exc)
        await _mem_set(key, value, ttl)


async def _kv_delete(key: str) -> None:
    client = get_redis()
    await _mem_delete(key)
    if client is None:
        return
    try:
        await client.delete(_NS + key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("emailverify redis delete error: %s", exc)


# ---------------------------------------------------------------------------
# Key builders
# ---------------------------------------------------------------------------
def _norm_email(email: str) -> str:
    return (email or "").strip().lower()


def _k_code(purpose: str, email: str) -> str:
    return f"code:{purpose}:{_norm_email(email)}"


def _k_cooldown(email: str) -> str:
    return f"cd:{_norm_email(email)}"


def _k_pass(purpose: str, email: str) -> str:
    return f"pass:{purpose}:{_norm_email(email)}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def generate_code() -> str:
    """6 位纯数字，避免 0/O/I/l 混淆问题；secrets 保证密码学随机性。"""
    n = secrets.randbelow(10 ** CODE_LENGTH)
    return str(n).zfill(CODE_LENGTH)


async def is_in_cooldown(email: str) -> bool:
    return await _kv_get(_k_cooldown(email)) is not None


async def issue_code(email: str, purpose: str) -> SendCodeResult:
    """生成验证码并写入 KV；不负责邮件发送（由调用方 dispatch）。

    Raises:
        EmailVerificationError: purpose 非法 / 冷却中
    """
    is_valid_purpose(purpose) or (_ for _ in ()).throw(
        EmailVerificationError(f"invalid purpose: {purpose}")
    )
    norm = _norm_email(email)
    norm or (_ for _ in ()).throw(EmailVerificationError("email is required"))

    in_cd = await is_in_cooldown(norm)
    in_cd and (_ for _ in ()).throw(
        EmailVerificationError("cooldown: please wait before requesting another code")
    )

    code = generate_code()
    payload = json.dumps(
        {
            "code_hash": _hash_code(code),
            "attempts": 0,
            "max_attempts": MAX_ATTEMPTS,
            "issued_at": int(time.time()),
        },
        ensure_ascii=False,
    )
    await _kv_set(_k_code(purpose, norm), payload, CODE_TTL_SECONDS)
    await _kv_set(_k_cooldown(norm), "1", COOLDOWN_SECONDS)
    return SendCodeResult(
        code=code,
        expires_in=CODE_TTL_SECONDS,
        cooldown=COOLDOWN_SECONDS,
    )


async def verify_code(email: str, purpose: str, code: str) -> VerifyResult:
    """校验验证码；通过则签发一次性 pass token。

    返回 VerifyResult：
    - ok=True  → token 可用于后续业务接口（注册/改密/重置）
    - ok=False → reason 指示具体原因
    """
    is_valid_purpose(purpose) or (_ for _ in ()).throw(
        EmailVerificationError(f"invalid purpose: {purpose}")
    )
    norm = _norm_email(email)
    key = _k_code(purpose, norm)
    raw = await _kv_get(key)
    if raw is None:
        return VerifyResult(ok=False, reason="expired")

    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        await _kv_delete(key)
        return VerifyResult(ok=False, reason="expired")

    attempts = int(data.get("attempts", 0))
    max_attempts = int(data.get("max_attempts", MAX_ATTEMPTS))
    if attempts >= max_attempts:
        await _kv_delete(key)
        return VerifyResult(ok=False, reason="exhausted")

    expected = str(data.get("code_hash", ""))
    matched = _const_time_eq(expected, _hash_code(code or ""))
    if not matched:
        data["attempts"] = attempts + 1
        await _kv_set(key, json.dumps(data, ensure_ascii=False), CODE_TTL_SECONDS)
        # 用尽后立即清理
        (data["attempts"] >= max_attempts) and await _kv_delete(key)
        return VerifyResult(
            ok=False,
            reason="exhausted" if data["attempts"] >= max_attempts else "mismatch",
        )

    # 验证成功：消费验证码 + 签发 pass token
    await _kv_delete(key)
    token = secrets.token_urlsafe(32)
    await _kv_set(_k_pass(purpose, norm), token, PASS_TOKEN_TTL_SECONDS)
    return VerifyResult(ok=True, token=token)


async def consume_pass_token(email: str, purpose: str, token: str) -> bool:
    """业务接口侧消费 pass token；一次性，校验后立即删除。"""
    is_valid_purpose(purpose) or (_ for _ in ()).throw(
        EmailVerificationError(f"invalid purpose: {purpose}")
    )
    norm = _norm_email(email)
    key = _k_pass(purpose, norm)
    stored = await _kv_get(key)
    if stored is None or not token:
        return False
    matched = _const_time_eq(stored, token)
    matched and await _kv_delete(key)
    return matched


async def clear_for(email: str, purpose: Optional[str] = None) -> None:
    """测试/管理用：清理某邮箱的验证码状态。"""
    norm = _norm_email(email)
    await _kv_delete(_k_cooldown(norm))
    purposes = [purpose] if purpose else list(_PURPOSE_TEMPLATE_CODE.keys())
    for p in purposes:
        await _kv_delete(_k_code(p, norm))
        await _kv_delete(_k_pass(p, norm))


__all__ = [
    "PURPOSE_REGISTER",
    "PURPOSE_CHANGE_PASSWORD",
    "PURPOSE_RESET_PASSWORD",
    "PURPOSE_ADMIN_TEST",
    "CODE_TTL_SECONDS",
    "COOLDOWN_SECONDS",
    "PASS_TOKEN_TTL_SECONDS",
    "MAX_ATTEMPTS",
    "SendCodeResult",
    "VerifyResult",
    "EmailVerificationError",
    "get_template_code",
    "is_valid_purpose",
    "generate_code",
    "is_in_cooldown",
    "issue_code",
    "verify_code",
    "consume_pass_token",
    "clear_for",
]
