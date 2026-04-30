"""审计日志服务。

设计原则：
- 主调用方在请求处理流程中调用 `record(...)`，内部使用 fire-and-forget 异步任务，不阻塞请求
- 写库失败仅 logger.warning，决不影响主业务
- 敏感字段（api_key 等）通过 SENSITIVE_KEYS 集合统一脱敏为 "***REDACTED***"
- 通过 settings.AUDIT_ENABLED 开关全局启用/禁用，便于轻量部署关闭
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Iterable, Mapping, Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import AsyncSessionLocal
from models import AuditLog

logger = logging.getLogger(__name__)

# 全局脱敏字段集合（小写）；命中则 value 替换为占位符
SENSITIVE_KEYS = frozenset({
    "api_key", "apikey", "secret", "secret_key", "password", "password_hash",
    "token", "access_token", "refresh_token", "authorization",
})

_REDACTED = "***REDACTED***"


def redact(payload: Any) -> Any:
    """递归脱敏，命中 SENSITIVE_KEYS 的字段替换为占位符。"""
    if isinstance(payload, Mapping):
        return {k: (_REDACTED if str(k).lower() in SENSITIVE_KEYS else redact(v)) for k, v in payload.items()}
    if isinstance(payload, (list, tuple)):
        return [redact(v) for v in payload]
    return payload


def _client_meta(request: Optional[Request]) -> dict:
    """从请求对象提取 ip / user-agent，无请求时返回空。"""
    extractors = {
        True: lambda r: {
            "ip": (r.client.host if r.client else None),
            "user_agent": (r.headers.get("user-agent") or "")[:500] or None,
        },
        False: lambda r: {"ip": None, "user_agent": None},
    }
    return extractors[request is not None](request)


def _resolve_actor(actor: Any) -> tuple[str, Optional[str]]:
    """识别 actor 类型：仅依赖 `__class__.__name__`，避免 if-else 分支。"""
    actor_type_map = {"User": "user", "Admin": "admin"}
    if actor is None:
        return "system", None
    actor_type = actor_type_map.get(type(actor).__name__, "system")
    actor_id = getattr(actor, "id", None)
    return actor_type, actor_id


async def _persist(entry: dict) -> None:
    """实际落库；任意异常仅 warning。"""
    session: AsyncSession = AsyncSessionLocal()
    try:
        log = AuditLog(**entry)
        session.add(log)
        await session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("audit log persist failed action=%s err=%s", entry.get("action"), exc)
        await session.rollback()
    finally:
        await session.close()


def record(
    *,
    action: str,
    actor: Any = None,
    resource_type: Optional[str] = None,
    resource_id: Any = None,
    status: str = "success",
    detail: Any = None,
    request: Optional[Request] = None,
    error_message: Optional[str] = None,
) -> None:
    """记录一条审计日志（非阻塞）。

    使用方法：在路由中获取 actor / request 后直接调用：
        record(action="llm_provider.create", actor=current_admin,
               resource_type="llm_provider", resource_id=p.id,
               detail={"name": p.name}, request=request)
    """
    if not settings.AUDIT_ENABLED:
        return

    actor_type, actor_id = _resolve_actor(actor)
    meta = _client_meta(request)
    entry = {
        "actor_type": actor_type,
        "actor_id": actor_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": (None if resource_id is None else str(resource_id)),
        "status": status,
        "ip": meta["ip"],
        "user_agent": meta["user_agent"],
        "detail": redact(detail) if detail is not None else None,
        "error_message": error_message,
    }
    # fire-and-forget：失败不影响主流程
    try:
        asyncio.create_task(_persist(entry))
    except RuntimeError:
        # 无运行中事件循环时直接同步降级（极少发生）
        logger.debug("audit record fallback sync action=%s", action)


__all__ = ["record", "redact", "SENSITIVE_KEYS"]
