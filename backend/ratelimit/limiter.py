"""slowapi-based limiter factories.

设计要点：
- key_func 优先取 JWT 解析出的 user_id（单用户级配额），无身份回退到客户端 IP
- storage_uri 通过 settings 注入：Redis 可用时分布式，否则 in-memory
- 未启用 RATE_LIMIT_ENABLED 时仍构造 limiter，但全部装饰器为 no-op（slowapi 不支持运行时禁用，
  这里通过映射表式的 default_limits=[] 与 enabled=False 占位），避免破坏导入。
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import Request, Response
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from config import settings

logger = logging.getLogger(__name__)


def _resolve_storage_uri() -> str:
    """根据 RATE_LIMIT_ENABLED + REDIS_URL 选择 storage backend。

    映射表驱动避免多重 if：
    - 启用 + 有 REDIS_URL → 走 redis://
    - 否则 memory://
    """
    options = {
        True: settings.REDIS_URL or "memory://",
        False: "memory://",
    }
    return options[bool(settings.RATE_LIMIT_ENABLED)]


def _key_user_or_ip(request: Request) -> str:
    """提取限流 key：优先 user_id，否则客户端 IP。

    规避同步上下文中无法 await decode_token；
    这里只识别 token 是否存在并复用 sub 字段（不做撤销检查，纯做配额维度）。
    """
    auth = request.headers.get("authorization") or ""
    token = auth.replace("Bearer ", "", 1).strip() if auth.lower().startswith("bearer ") else ""
    sub = _quick_subject(token)
    return f"user:{sub}" if sub else f"ip:{get_remote_address(request)}"


def _quick_subject(token: str) -> Optional[str]:
    """轻量解析 JWT sub。失败/空 token → None。完全不抛异常。"""
    if not token:
        return None
    try:
        from jose import jwt  # 局部导入避免无 token 路径上的开销
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub")
    except Exception:  # noqa: BLE001
        return None


# ---------------------------------------------------------------------------
# Limiters
# ---------------------------------------------------------------------------
_storage = _resolve_storage_uri()
logger.info("RateLimit storage=%s enabled=%s", _storage, settings.RATE_LIMIT_ENABLED)

limiter = Limiter(
    key_func=_key_user_or_ip,
    default_limits=[settings.RATE_LIMIT_DEFAULT] if settings.RATE_LIMIT_ENABLED else [],
    storage_uri=_storage,
    enabled=bool(settings.RATE_LIMIT_ENABLED),
)

ip_limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    storage_uri=_storage,
    enabled=bool(settings.RATE_LIMIT_ENABLED),
)


# ---------------------------------------------------------------------------
# 端点限流策略映射表（业务侧用 ENDPOINT_LIMITS["xxx"] 获取配额字符串）
#
# 映射表驱动：策略调整只改此表，不用改装饰器；便于后续从配置读取覆盖。
# 每个 key 形如 "module_action"，值为 slowapi 兼容的速率表达式。
# ---------------------------------------------------------------------------
ENDPOINT_LIMITS: dict[str, str] = {
    # 会话级高频写入
    "chat_send": getattr(settings, "RATE_LIMIT_CHAT_SEND", "60/minute"),
    # 视频任务创建
    "video_create": getattr(settings, "RATE_LIMIT_VIDEO_CREATE", "20/minute"),
    # 图像同步生成
    "image_generate": getattr(settings, "RATE_LIMIT_IMAGE_GENERATE", "20/minute"),
    # 音乐任务创建
    "music_create": getattr(settings, "RATE_LIMIT_MUSIC_CREATE", "20/minute"),
    # 编排执行
    "orchestrate_execute": getattr(settings, "RATE_LIMIT_ORCHESTRATE", "30/minute"),
}


def install_rate_limit(app) -> None:
    """挂载到 FastAPI app；同时注册 429 异常处理器。

    幂等：重复挂载只覆盖 state，不重复注册 handler。
    """
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=429,
        content={"detail": "Too Many Requests", "limit": str(exc.detail)},
        headers={"Retry-After": "1"},
    )
