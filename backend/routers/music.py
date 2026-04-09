"""
音乐生成 API 路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.future import select
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import logging

from database import get_db
from models import LLMProvider, MusicTask
from schemas import MusicTaskResponse
from auth import get_current_active_user_or_admin, scoped_query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/music", tags=["music"])


# ---------------------------------------------------------------------------
# Response builder
# ---------------------------------------------------------------------------

def _build_task_response(task: MusicTask, provider_name: str = None) -> MusicTaskResponse:
    """构建音乐任务响应"""
    return MusicTaskResponse(
        id=task.id,
        status=task.status or "pending",
        prompt=task.prompt or "",
        lyrics=task.lyrics,
        model=task.model or "",
        output_format=task.output_format or "mp3",
        audio_url=task.result_audio_url,
        credit_cost=task.credit_cost or 0.0,
        error_message=task.error_message,
        provider_id=task.provider_id,
        user_id=task.user_id or "",
        input_image_count=task.input_image_count or 0,
        created_at=task.created_at,
        completed_at=task.completed_at,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{task_id}/status", response_model=MusicTaskResponse)
async def get_music_task_status(
    task_id: str,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """轮询音乐任务状态（前端轮询用）"""
    task_result = await db.execute(select(MusicTask).where(MusicTask.id == task_id))
    task = task_result.scalar_one_or_none()
    task or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Music task not found"))

    # 获取供应商名称（可选）
    provider_name = None
    task.provider_id and (
        provider_name := getattr(
            (await db.execute(select(LLMProvider).where(LLMProvider.id == task.provider_id))).scalar_one_or_none(),
            "name", None,
        )
    )

    return _build_task_response(task, provider_name=provider_name)


@router.get("/session/{session_id}", response_model=list[MusicTaskResponse])
async def get_session_music_tasks(
    session_id: str,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取会话的音乐任务列表"""
    result = await db.execute(
        select(MusicTask)
        .where(MusicTask.session_id == session_id)
        .order_by(MusicTask.created_at.asc())
    )
    tasks = result.scalars().all()
    return [_build_task_response(t) for t in tasks]


@router.get("", response_model=dict)
async def list_music_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """分页查询音乐任务列表"""
    query = select(MusicTask)
    count_query = select(func.count(MusicTask.id))

    # 行级隔离
    query = scoped_query(query, MusicTask, current_user)
    count_query = scoped_query(count_query, MusicTask, current_user)

    # 筛选
    status and (query := query.where(MusicTask.status == status))
    status and (count_query := count_query.where(MusicTask.status == status))

    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(MusicTask.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    tasks = (await db.execute(query)).scalars().all()

    # 批量获取供应商名称
    prov_ids = list({t.provider_id for t in tasks if t.provider_id})
    provider_name_map = {}
    prov_ids and (provider_name_map := {
        p.id: p.name
        for p in (await db.execute(select(LLMProvider).where(LLMProvider.id.in_(prov_ids)))).scalars().all()
    })

    items = [_build_task_response(t, provider_name=provider_name_map.get(t.provider_id)) for t in tasks]
    return {"items": [item.model_dump() for item in items], "total": total, "page": page, "page_size": page_size}
