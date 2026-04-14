"""
视频生成 API 路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.future import select
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from typing import Optional
import logging

from database import get_db
from models import LLMProvider, VideoTask, ChatMessage, Asset, generate_uuid
from schemas import VideoGenerateRequest, VideoTaskResponse, VideoTaskListResponse, VideoConfig
from auth import get_current_active_user_or_admin, is_admin_entity, scoped_query
from services.video_generation import submit_video_task, poll_video_task, VideoContext, MAX_POLL_FAILURES, infer_provider_type
from services.video_providers import extract_video_provider_type
from services.video_providers.model_capabilities import get_model_capabilities
from services.billing import calculate_video_credit_cost, deduct_credits_atomic, InsufficientCreditsError
from services.media_utils import save_video_from_url, MEDIA_DIR

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/videos", tags=["videos"])


@router.get("", response_model=VideoTaskListResponse)
async def list_video_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    video_mode: Optional[str] = None,
    provider_id: Optional[str] = None,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """分页查询视频任务列表"""
    query = select(VideoTask)
    count_query = select(func.count(VideoTask.id))

    # 行级隔离
    query = scoped_query(query, VideoTask, current_user)
    count_query = scoped_query(count_query, VideoTask, current_user)

    # 筛选条件映射表
    filter_map = {
        VideoTask.status: status,
        VideoTask.video_mode: video_mode,
        VideoTask.provider_id: provider_id,
    }
    for field, value in filter_map.items():
        value and (query := query.where(field == value))
        value and (count_query := count_query.where(field == value))

    # 总数
    total = (await db.execute(count_query)).scalar() or 0

    # 分页排序
    query = query.order_by(VideoTask.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    tasks = (await db.execute(query)).scalars().all()

    # 批量获取 LLMProvider 名称（一次 IN 查询）
    prov_ids = list({t.provider_id for t in tasks if t.provider_id})
    provider_name_map = {}
    prov_ids and (provider_name_map := {
        p.id: p.name
        for p in (await db.execute(select(LLMProvider).where(LLMProvider.id.in_(prov_ids)))).scalars().all()
    })

    items = [_build_task_response(t, provider_name=provider_name_map.get(t.provider_id)) for t in tasks]
    return VideoTaskListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=VideoTaskResponse)
async def create_video_task(
    request: VideoGenerateRequest,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """提交视频生成任务"""
    entity_id = current_user.id

    # 查询 LLMProvider
    provider_result = await db.execute(select(LLMProvider).where(LLMProvider.id == request.provider_id))
    provider = provider_result.scalar_one_or_none()
    provider or (_ for _ in ()).throw(HTTPException(status_code=404, detail="LLM Provider not found"))

    # 合并配置
    config = request.config or VideoConfig()

    # 计算输入图片数量
    input_image_count = 1 if request.image_url and request.video_mode in ("image_to_video", "edit") else 0
    input_image_count += 1 if request.last_frame_image else 0

    # 推断供应商类型
    provider_type = extract_video_provider_type(provider.provider_type) or infer_provider_type(request.model, provider.provider_type)
    
    # 构建视频上下文
    ctx = VideoContext(
        api_key=provider.api_key,
        model=request.model,
        prompt=request.prompt,
        provider_type=provider_type,
        image_url=request.image_url,
        last_frame_image=request.last_frame_image,
        duration=config.duration,
        quality=config.quality,
        aspect_ratio=config.aspect_ratio,
        mode=config.mode,
        video_mode=request.video_mode,
        prompt_optimizer=config.prompt_optimizer,
        fast_pretreatment=config.fast_pretreatment,
        reference_images=request.reference_images or [],
        extension_video_url=request.extension_video_url,
        reference_videos=request.reference_videos or [],
        reference_audios=request.reference_audios or [],
        return_last_frame=request.return_last_frame,
    )

    # 提交到供应商 (根据 provider_type 自动路由)
    result = await submit_video_task(ctx)

    # 提交失败
    (result.status == "failed") and (_ for _ in ()).throw(
        HTTPException(status_code=502, detail=f"Video generation failed: {result.error}")
    )

    # 创建 VideoTask 记录
    task = VideoTask(
        xai_task_id=result.task_id,
        session_id=request.session_id,
        provider_id=request.provider_id,
        model=request.model,
        user_id=entity_id,
        video_mode=request.video_mode,
        prompt=request.prompt,
        image_url=request.image_url,
        duration=config.duration,
        quality=config.quality,
        aspect_ratio=config.aspect_ratio,
        mode=config.mode,
        status="pending",
        input_image_count=input_image_count,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    logger.info(f"Video task created: {task.id} ({provider_type}: {result.task_id})")

    return _build_task_response(task, provider_name=provider.name)


@router.get("/{task_id}/status", response_model=VideoTaskResponse)
async def get_video_task_status(
    task_id: str,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """轮询视频任务状态"""
    entity_id = current_user.id

    # 查询任务
    task_result = await db.execute(select(VideoTask).where(VideoTask.id == task_id))
    task = task_result.scalar_one_or_none()
    task or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Video task not found"))

    # 终态直接返回缓存结果
    terminal_states = {"completed", "failed"}
    if task.status in terminal_states:
        provider_result = await db.execute(select(LLMProvider).where(LLMProvider.id == task.provider_id))
        provider = provider_result.scalar_one_or_none()
        return _build_task_response(task, provider_name=getattr(provider, "name", None))

    # 查询 LLMProvider 获取 API key
    provider_result = await db.execute(select(LLMProvider).where(LLMProvider.id == task.provider_id))
    provider = provider_result.scalar_one_or_none()
    provider or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Provider not found"))

    # 轮询供应商 (根据 provider_type 自动选择适配器)
    provider_type = extract_video_provider_type(provider.provider_type) or infer_provider_type(task.model or "", provider.provider_type)
    poll_result = await poll_video_task(provider.api_key, task.xai_task_id, provider_type)

    # 超时保护：pending 且有错误超过 5 分钟 → 判定失败
    poll_has_error = poll_result.error and poll_result.status == "pending"
    elapsed = (datetime.now() - task.created_at.replace(tzinfo=None)).total_seconds() if task.created_at else 0
    timed_out = poll_has_error and elapsed > 300

    # 更新任务状态（SDK 层已处理 moderation → failed）
    task.status = "failed" if timed_out else poll_result.status
    timed_out and setattr(task, "error_message", poll_result.error or "Timeout")

    # 完成处理：下载视频 + 计费
    if poll_result.status == "completed" and poll_result.video_url:
        try:
            # Gemini 需要 API key 下载视频
            download_headers = None
            provider_type == "gemini" and download_headers and None
            provider_type == "gemini" and (download_headers := {"x-goog-api-key": provider.api_key})
            
            local_url = await save_video_from_url(poll_result.video_url, headers=download_headers)
            task.result_video_url = local_url
            task.output_duration_seconds = poll_result.duration_seconds or task.duration
            task.completed_at = datetime.now(timezone.utc)

            # 将生成的视频注册为用户资产
            await _register_video_asset(local_url, entity_id, db)

            # 计费：从 provider.model_costs[model] 获取费率
            rate_map = (provider.model_costs or {}).get(task.model, {})
            credit_cost, billing_metadata = calculate_video_credit_cost(task, rate_map)
            task.credit_cost = credit_cost

            # 扣费
            (credit_cost > 0) and await deduct_credits_atomic(
                user_id=entity_id,
                cost=credit_cost,
                session=db,
                metadata=billing_metadata,
                transaction_type="consumption",
            )

            # 在聊天会话中插入视频消息
            task.session_id and await _insert_video_chat_message(db, task)

        except InsufficientCreditsError:
            task.status = "failed"
            task.error_message = "Insufficient credits"
        except Exception as e:
            logger.error(f"Video completion processing failed: {e}")
            task.status = "failed"
            task.error_message = str(e)

    # 失败处理
    (poll_result.status == "failed") and setattr(task, "error_message", poll_result.error)

    await db.commit()
    await db.refresh(task)

    return _build_task_response(task, provider_name=provider.name)


async def _register_video_asset(local_url: str, user_id: str, db: AsyncSession) -> None:
    """将生成/编辑的视频注册为用户 Asset 记录。"""
    try:
        filename = local_url.rsplit("/", 1)[-1]  # e.g. "uuid.mp4"
        filepath = MEDIA_DIR / filename
        size = filepath.stat().st_size if filepath.exists() else None
        asset = Asset(
            id=generate_uuid(),
            user_id=user_id,
            filename=filename,
            original_name=f"generated_{filename}",
            file_path=filename,
            file_type="video",
            mime_type="video/mp4",
            size=size,
        )
        db.add(asset)
        await db.flush()
        logger.info("Registered video as asset: %s (user=%s)", filename, user_id)
    except Exception as e:
        logger.warning("Failed to register video asset: %s", e, exc_info=True)


@router.get("/session/{session_id}", response_model=list[VideoTaskResponse])
async def get_session_video_tasks(
    session_id: str,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取会话的视频任务列表"""
    result = await db.execute(
        select(VideoTask)
        .where(VideoTask.session_id == session_id)
        .order_by(VideoTask.created_at.asc())
    )
    tasks = result.scalars().all()
    return [_build_task_response(t) for t in tasks]


@router.get("/model-capabilities/{model_name}")
async def get_video_model_capabilities(
    model_name: str,
    current_user=Depends(get_current_active_user_or_admin),
):
    """获取指定视频模型的能力配置"""
    capabilities = get_model_capabilities(model_name)
    capabilities or (_ for _ in ()).throw(HTTPException(status_code=404, detail=f"Model {model_name} not found or not supported"))
    return capabilities


# 可删除的终态集合
_DELETABLE_STATUSES = {"completed", "failed"}


@router.delete("/{task_id}")
async def delete_video_task(
    task_id: str,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """删除视频任务及其本地视频文件"""
    task_result = await db.execute(select(VideoTask).where(VideoTask.id == task_id))
    task = task_result.scalar_one_or_none()
    task or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Video task not found"))

    # 仅允许删除终态任务
    (task.status in _DELETABLE_STATUSES) or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="只能删除已完成或失败的任务")
    )

    # 删除本地视频文件（路径格式: /api/media/{uuid}.mp4）
    video_path = task.result_video_url
    video_path and _try_delete_local_file(video_path)

    # 删除关联的聊天消息
    task.message_id and await db.execute(
        select(ChatMessage).where(ChatMessage.id == task.message_id)
    ) and await db.execute(
        ChatMessage.__table__.delete().where(ChatMessage.id == task.message_id)
    )

    await db.delete(task)
    await db.commit()

    logger.info(f"Video task deleted: {task_id}")
    return {"detail": "ok"}


def _try_delete_local_file(media_url: str):
    """尝试删除本地媒体文件，忽略不存在的情况"""
    # /api/media/xxx.mp4 → xxx.mp4
    filename = media_url.rsplit("/", 1)[-1]
    filepath = MEDIA_DIR / filename
    filepath.unlink(missing_ok=True)
    logger.info(f"Deleted local file: {filepath}")


def _build_task_response(task: VideoTask, provider_name: str = None) -> VideoTaskResponse:
    """构建视频任务响应"""
    return VideoTaskResponse(
        id=task.id,
        xai_task_id=task.xai_task_id or "",
        status=task.status or "pending",
        video_mode=task.video_mode or "",
        prompt=task.prompt or "",
        duration=task.duration or 5,
        quality=task.quality or "720p",
        aspect_ratio=task.aspect_ratio or "16:9",
        video_url=task.result_video_url,
        credit_cost=task.credit_cost or 0.0,
        error_message=task.error_message,
        provider_id=task.provider_id or "",
        provider_name=provider_name,
        model=task.model or "",
        user_id=task.user_id or "",
        image_url=task.image_url,
        created_at=task.created_at,
        completed_at=task.completed_at,
    )


async def _insert_video_chat_message(db: AsyncSession, task: VideoTask):
    """在聊天会话中插入视频结果消息"""
    content = f"__VIDEO_DONE__{task.id}|{task.result_video_url}|{task.quality}|{task.output_duration_seconds or 0}|{task.credit_cost or 0}"
    msg = ChatMessage(
        session_id=task.session_id,
        role="assistant",
        content=content,
    )
    db.add(msg)
    task.message_id = msg.id
