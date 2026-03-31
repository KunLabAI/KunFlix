"""
管理员工具管理路由 — 工具注册表、使用统计、执行日志
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_admin
from database import get_db
from models import Admin, Agent, ToolExecution
from services.tool_manager import ToolManager

router = APIRouter(
    prefix="/api/admin/tools",
    tags=["admin-tools"],
    responses={404: {"description": "Not found"}},
)


# ---------------------------------------------------------------------------
# 1. 工具注册表 — 列出所有 Provider 和工具定义
# ---------------------------------------------------------------------------

@router.get("/registry")
async def get_tool_registry(
    _admin: Admin = Depends(require_admin),
):
    """返回系统中所有注册的工具 Provider 及其工具元信息。"""
    manager = ToolManager()
    return manager.get_registry()


# ---------------------------------------------------------------------------
# 2. Agent 工具使用情况 — 每个 Agent 启用了哪些工具能力
# ---------------------------------------------------------------------------

@router.get("/agent-usage")
async def get_agent_tool_usage(
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """返回每个 Agent 的工具配置概览。"""
    result = await db.execute(
        select(
            Agent.id, Agent.name, Agent.tools,
            Agent.target_node_types, Agent.image_config,
        ).order_by(Agent.name)
    )
    rows = result.all()
    return [
        {
            "agent_id": r.id,
            "agent_name": r.name,
            "skills": r.tools or [],
            "canvas_enabled": bool(r.target_node_types),
            "canvas_node_types": r.target_node_types or [],
            "image_gen_enabled": bool((r.image_config or {}).get("image_generation_enabled")),
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# 3. 统计概览 — 工具调用次数、错误率等
# ---------------------------------------------------------------------------

@router.get("/stats")
async def get_tool_stats(
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """返回工具执行统计数据。"""
    total = await db.scalar(select(func.count(ToolExecution.id))) or 0
    errors = await db.scalar(
        select(func.count(ToolExecution.id)).where(ToolExecution.status == "error")
    ) or 0
    avg_duration = await db.scalar(
        select(func.avg(ToolExecution.duration_ms))
    )

    # 按工具名称分组统计
    by_tool_result = await db.execute(
        select(
            ToolExecution.tool_name,
            func.count(ToolExecution.id).label("count"),
            func.avg(ToolExecution.duration_ms).label("avg_ms"),
        )
        .group_by(ToolExecution.tool_name)
        .order_by(desc("count"))
    )
    by_tool = [
        {
            "tool_name": r.tool_name,
            "count": r.count,
            "avg_duration_ms": round(r.avg_ms, 1) if r.avg_ms else None,
        }
        for r in by_tool_result.all()
    ]

    # 按 Provider 分组统计
    by_provider_result = await db.execute(
        select(
            ToolExecution.provider_name,
            func.count(ToolExecution.id).label("count"),
        )
        .group_by(ToolExecution.provider_name)
        .order_by(desc("count"))
    )
    by_provider = [
        {"provider_name": r.provider_name, "count": r.count}
        for r in by_provider_result.all()
    ]

    return {
        "total_executions": total,
        "total_errors": errors,
        "error_rate": round(errors / total * 100, 2) if total else 0,
        "avg_duration_ms": round(avg_duration, 1) if avg_duration else None,
        "by_tool": by_tool,
        "by_provider": by_provider,
    }


# ---------------------------------------------------------------------------
# 4. 执行日志 — 分页查询工具调用记录
# ---------------------------------------------------------------------------

@router.get("/executions")
async def get_tool_executions(
    skip: int = 0,
    limit: int = Query(default=50, le=200),
    tool_name: str | None = None,
    provider_name: str | None = None,
    status: str | None = None,
    agent_id: str | None = None,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """分页查询工具执行日志，支持多维度过滤。"""
    query = select(ToolExecution).order_by(ToolExecution.created_at.desc())

    # 动态过滤 — 使用 lookup-map 消除 if 链
    _filters = {
        ToolExecution.tool_name: tool_name,
        ToolExecution.provider_name: provider_name,
        ToolExecution.status: status,
        ToolExecution.agent_id: agent_id,
    }
    for col, val in _filters.items():
        val is not None and (query := query.where(col == val))

    total = await db.scalar(select(func.count()).select_from(query.subquery()))

    result = await db.execute(query.offset(skip).limit(limit))
    rows = result.scalars().all()

    return {
        "items": [
            {
                "id": r.id,
                "tool_name": r.tool_name,
                "provider_name": r.provider_name,
                "agent_id": r.agent_id,
                "session_id": r.session_id,
                "user_id": r.user_id,
                "is_admin": r.is_admin,
                "theater_id": r.theater_id,
                "arguments": r.arguments,
                "result_summary": r.result_summary,
                "status": r.status,
                "error_message": r.error_message,
                "duration_ms": r.duration_ms,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": total or 0,
        "skip": skip,
        "limit": limit,
    }
