"""
Tool execution logger — records each tool invocation to the database.

Writes are non-blocking (asyncio.create_task) and failure-silent
so they never interrupt the main chat flow.
"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from database import AsyncSessionLocal
from services.tool_manager.providers.canvas import CANVAS_TOOL_NAMES_SET
from services.tool_manager.providers.image_gen import IMAGE_GEN_TOOL_NAME

if TYPE_CHECKING:
    from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Provider name inference (lookup-map, no if-chains)
# ---------------------------------------------------------------------------

_PROVIDER_NAME_MAP: dict[str, str] = {
    "load_skill": "skill",
    IMAGE_GEN_TOOL_NAME: "image_gen",
    **{name: "canvas" for name in CANVAS_TOOL_NAMES_SET},
}
# Default for names not in the map: "base"

# Keys to strip from arguments before persisting
_SENSITIVE_KEYS = frozenset({"api_key", "secret", "token", "password"})

_MAX_RESULT_LEN = 500


def _sanitize_args(args: dict) -> dict:
    """Remove sensitive keys from arguments snapshot."""
    return {k: v for k, v in args.items() if k not in _SENSITIVE_KEYS}


_MAX_RETRIES = 5
_RETRY_BASE_DELAY = 1.0  # seconds
# 首次延迟较长，让主聊天流程的消息落库事务先完成，避免与主写者竞争
_INITIAL_DELAY = 1.5


async def _write_record(
    tool_name: str,
    args: dict,
    result: str,
    status: str,
    duration_ms: int,
    ctx: "ToolContext",
) -> None:
    """Persist a ToolExecution record using an independent DB session.

    Retries on database-locked errors with exponential backoff.
    首次延迟 1.5s 等主聊天事务提交；失败后按 1s, 2s, 4s, 8s 退避。
    """
    from models import ToolExecution

    # 初始延迟：让主流程的消息保存事务先落地，减少写锁竞争
    await asyncio.sleep(_INITIAL_DELAY)

    for attempt in range(_MAX_RETRIES):
        try:
            async with AsyncSessionLocal() as session:
                record = ToolExecution(
                    tool_name=tool_name,
                    provider_name=_PROVIDER_NAME_MAP.get(tool_name, "unknown"),
                    agent_id=ctx.agent.id,
                    session_id=ctx.session_id,
                    user_id=ctx.user_id,
                    is_admin=ctx.is_admin,
                    theater_id=ctx.theater_id,
                    arguments=_sanitize_args(args),
                    result_summary=result[:_MAX_RESULT_LEN] if result else None,
                    status=status,
                    error_message=result if status == "error" else None,
                    duration_ms=duration_ms,
                )
                session.add(record)
                await session.commit()
            return
        except Exception as exc:
            is_locked = "database is locked" in str(exc)
            remaining = _MAX_RETRIES - attempt - 1
            log_fn = logger.debug if (is_locked and remaining > 0) else logger.warning
            log_fn("Failed to record tool execution for %s (attempt %d/%d): %s",
                   tool_name, attempt + 1, _MAX_RETRIES, exc)
            # Only retry on lock errors
            if not is_locked or remaining <= 0:
                return
            await asyncio.sleep(_RETRY_BASE_DELAY * (2 ** attempt))


def record_tool_execution(
    tool_name: str,
    args: dict,
    result: str,
    status: str,
    duration_ms: int,
    ctx: "ToolContext",
) -> None:
    """Schedule a non-blocking write of a tool execution record."""
    asyncio.create_task(
        _write_record(tool_name, args, result, status, duration_ms, ctx)
    )
