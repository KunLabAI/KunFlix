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
from schemas import MusicTaskResponse, MusicGenerateRequest, MusicGenerateResponse
from auth import get_current_active_user_or_admin, scoped_query
from services.music_providers import extract_music_provider_type
from services.music_generation import submit_music_task
from services.billing import require_positive_balance, InsufficientCreditsError, BalanceFrozenError
from services.credit_reset import maybe_reset_monthly_credits
from errors import BizError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/music", tags=["music"])


# ---------------------------------------------------------------------------
# Model capability registry (与 gemini_lyria 保持一致)
# ---------------------------------------------------------------------------
_MODEL_CAPS: dict[str, dict] = {
    "lyria-3-clip-preview": {
        "formats": ["mp3"],
        "duration_hint": "固定 30 秒短片",
        "supports_wav": False,
        "supports_timeline": False,
        "display_name": "Lyria 3 Clip",
    },
    "lyria-3-pro-preview": {
        "formats": ["mp3", "wav"],
        "duration_hint": "完整歌曲（约 1-2 分钟）",
        "supports_wav": True,
        "supports_timeline": True,
        "display_name": "Lyria 3 Pro",
    },
}



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


# ---------------------------------------------------------------------------
# Providers & capabilities
# ---------------------------------------------------------------------------

@router.get("/providers", response_model=list[dict])
async def list_music_providers(
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """列出所有支持音乐生成的活跃供应商。

    模型名称来源优先级（对齐 /images/providers）：
      1. provider.model_metadata[model].model_type == 'audio' → 使用 meta.display_name
      2. 如未配置 audio 元数据（兼容存量）→ gemini 内置的 _MODEL_CAPS 默认列表，display_name 取默认值

    这样管理员在后台修改 display_name 时，前端可立即看到更新。
    """
    stmt = select(LLMProvider).where(LLMProvider.is_active == True)
    providers = (await db.execute(stmt)).scalars().all()

    def _build_models(p: LLMProvider, music_type: str) -> list[dict]:
        # 优先：从 model_metadata 中读取被管理员标为 audio 的模型
        tagged = [
            {
                "name": model_name,
                "display_name": (meta or {}).get("display_name") or model_name,
            }
            for model_name, meta in (p.model_metadata or {}).items()
            if (meta or {}).get("model_type") == "audio"
        ]
        # 兵底：gemini 供应商未配置元数据时，使用内置 Lyria 默认列表
        fallback = [
            {"name": name, "display_name": caps.get("display_name") or name}
            for name, caps in _MODEL_CAPS.items()
        ] if (not tagged and music_type == "gemini") else []
        return tagged or fallback

    out: list[dict] = []
    for p in providers:
        music_type = extract_music_provider_type(p.provider_type or "")
        models = _build_models(p, music_type) if music_type else []
        models and out.append({
            "id": p.id,
            "name": p.name,
            "provider_type": p.provider_type,
            "music_provider_type": music_type,
            "models": models,
        })
    return out


@router.get("/model-capabilities/{model}", response_model=dict)
async def get_model_capabilities(
    model: str,
    current_user=Depends(get_current_active_user_or_admin),
):
    """返回指定模型的能力描述（前端根据此开关面板字段）。"""
    caps = _MODEL_CAPS.get(model)
    caps or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Unknown music model"))
    return {"model": model, **caps}


# ---------------------------------------------------------------------------
# Submit music task (POST /)
# ---------------------------------------------------------------------------

@router.post("", response_model=MusicGenerateResponse)
async def create_music_task(
    payload: MusicGenerateRequest,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """提交一个异步音乐生成任务（画布音频节点调用）。"""
    # Lazy 月度重置 + 严格正余额校验（修复 0 余额绕过漏洞）
    await maybe_reset_monthly_credits(current_user.id, db)
    try:
        await require_positive_balance(current_user.id, db)
    except InsufficientCreditsError:
        raise BizError.insufficient_credits()
    except BalanceFrozenError:
        raise BizError.balance_frozen(user_id=current_user.id)

    structured_dict = payload.structured.model_dump(exclude_none=True) if payload.structured else None
    ref_images = [r.model_dump() for r in (payload.reference_images or [])]

    # session 优先；若有 session 将 theater_id 通过 session 解析的逻辑交给后台（本接口不强制绑定 theater）
    result = await submit_music_task(
        db=db,
        user_id=current_user.id,
        prompt=payload.prompt,
        model=payload.model,
        provider_id=payload.provider_id,
        session_id=payload.session_id,
        theater_id=None,
        output_format=payload.output_format,
        negative_prompt=payload.negative_prompt or "",
        structured=structured_dict,
        reference_images=ref_images,
    )

    error = result.get("error")
    error and (_ for _ in ()).throw(HTTPException(status_code=400, detail=error))

    return MusicGenerateResponse(
        task_id=result["task_id"],
        status=result["status"],
        session_id=payload.session_id,
        node_id=payload.node_id,
        model=result["model"],
        provider_id=result.get("provider_id"),
    )
