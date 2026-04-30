"""
Orchestration API endpoints for multi-agent collaboration.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Optional
import logging

from database import get_db
from models import TaskExecution, SubTask, User
from schemas import OrchestrationRequest, TaskExecutionResponse, SubTaskResponse
from auth import get_current_active_user
from services.orchestrator import DynamicOrchestrator
from services.billing import check_balance_sufficient, BalanceFrozenError
from ratelimit import limiter, ENDPOINT_LIMITS
from realtime import new_stream_id, stream_key, sse_tee

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/orchestrate",
    tags=["orchestration"],
    responses={404: {"description": "Not found"}},
)


@router.post("")
@limiter.limit(ENDPOINT_LIMITS["orchestrate_execute"])
async def execute_orchestration(
    request: Request,
    payload: OrchestrationRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Execute a multi-agent orchestration task.

    Returns a streaming response with Server-Sent Events (SSE) for real-time progress.
    响应头 `X-Stream-Id` 为本次 SSE 流的引用 id，客户端断连后可通过
    `GET /api/sse/resume/orchestrate/{X-Stream-Id}` 携带 `Last-Event-ID` 续传。
    """
    # Check user credits for paid operations
    try:
        balance_ok = await check_balance_sufficient(current_user.id, 0, db)
        if not balance_ok:
            raise HTTPException(status_code=402, detail="Insufficient credits for orchestration task")
    except BalanceFrozenError:
        raise HTTPException(status_code=403, detail="Account balance is frozen")

    orchestrator = DynamicOrchestrator(db)
    ref_id = new_stream_id()
    skey = stream_key(current_user.id, "orchestrate", ref_id)

    async def generate():
        try:
            async for event in orchestrator.execute(
                task_description=payload.task_description,
                user_id=current_user.id,
                leader_agent_id=payload.leader_agent_id,
                session_id=payload.session_id,
                theater_id=payload.theater_id,
                max_iterations=payload.options.max_iterations,
                enable_review=payload.options.enable_review,
            ):
                yield event.to_sse()
        except Exception as e:
            logger.exception(f"Orchestration streaming error: {e}")
            yield f"event: error\ndata: {{\"error\": \"{str(e)}\"}}\n\n"

    return StreamingResponse(
        sse_tee(skey, generate()),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Stream-Id": ref_id,
        }
    )


@router.get("/{task_execution_id}", response_model=TaskExecutionResponse)
async def get_task_execution(
    task_execution_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get details of a task execution including all subtasks.
    """
    # Load task execution
    result = await db.execute(
        select(TaskExecution).filter(
            TaskExecution.id == task_execution_id,
            TaskExecution.user_id == current_user.id
        )
    )
    task_execution = result.scalars().first()

    if not task_execution:
        raise HTTPException(status_code=404, detail="Task execution not found")

    # Load subtasks
    subtasks_result = await db.execute(
        select(SubTask)
        .filter(SubTask.task_execution_id == task_execution_id)
        .order_by(SubTask.order_index)
    )
    subtasks = subtasks_result.scalars().all()

    # Build response
    response = TaskExecutionResponse.model_validate(task_execution)
    response.subtasks = [SubTaskResponse.model_validate(st) for st in subtasks]

    return response


@router.get("", response_model=list[TaskExecutionResponse])
async def list_task_executions(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List task executions for the current user.
    """
    query = select(TaskExecution).filter(
        TaskExecution.user_id == current_user.id
    ).order_by(TaskExecution.created_at.desc())

    if status:
        query = query.filter(TaskExecution.status == status)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    executions = result.scalars().all()

    # Load subtasks for each execution
    responses = []
    for execution in executions:
        subtasks_result = await db.execute(
            select(SubTask)
            .filter(SubTask.task_execution_id == execution.id)
            .order_by(SubTask.order_index)
        )
        subtasks = subtasks_result.scalars().all()

        response = TaskExecutionResponse.model_validate(execution)
        response.subtasks = [SubTaskResponse.model_validate(st) for st in subtasks]
        responses.append(response)

    return responses


@router.delete("/{task_execution_id}")
async def cancel_task_execution(
    task_execution_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel a running task execution.
    """
    result = await db.execute(
        select(TaskExecution).filter(
            TaskExecution.id == task_execution_id,
            TaskExecution.user_id == current_user.id
        )
    )
    task_execution = result.scalars().first()

    if not task_execution:
        raise HTTPException(status_code=404, detail="Task execution not found")

    if task_execution.status not in ["pending", "running"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel task with status: {task_execution.status}"
        )

    task_execution.status = "failed"
    task_execution.execution_metadata = {
        **(task_execution.execution_metadata or {}),
        "cancelled": True,
        "cancelled_by": current_user.id
    }

    await db.commit()
    return {"message": "Task execution cancelled", "id": task_execution_id}
