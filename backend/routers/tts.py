"""
TTS 语音合成 API 路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.future import select
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import base64
import logging

from database import get_db
from models import LLMProvider, TTSTask, ReplicatedVoice, User, Admin
from schemas import (
    TTSTaskResponse, TTSGenerateRequest, TTSGenerateResponse, TTSSpeakerConfig,
    TTSPreviewRequest, TTSPreviewResponse,
)
from auth import get_current_active_user_or_admin, scoped_query
from services.tts_providers import extract_tts_provider_type, PREBUILT_VOICES, list_voice_library, TTSContext
from services.tts_providers.gemini_tts import _MODEL_CAPS
from services.tts_generation import submit_tts_task, register_replicated_voice, _resolve_tts_provider, generate_tts
from services.billing import require_positive_balance, InsufficientCreditsError, BalanceFrozenError
from services.credit_reset import maybe_reset_monthly_credits
from errors import BizError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tts", tags=["tts"])

# 复刻音频上传限制（参考音频 10-30s WAV，预留充裕上限）
_MAX_VOICE_SAMPLE_BYTES = 15 * 1024 * 1024
_ACCEPTED_AUDIO_TYPES = {"audio/wav", "audio/x-wav", "audio/wave", "audio/mpeg", "audio/mp3"}

# 试听默认短句（前端未传文本时使用；语言由模型自动识别）
_DEFAULT_PREVIEW_TEXT = "Hello! This is a preview of how I sound."


# ---------------------------------------------------------------------------
# Response builder
# ---------------------------------------------------------------------------

def _build_task_response(task: TTSTask, provider_name: str = None, remaining_credits: Optional[float] = None) -> TTSTaskResponse:
    """构建 TTS 任务响应"""
    speakers = [TTSSpeakerConfig(**s) for s in (task.speakers_json or [])]
    return TTSTaskResponse(
        id=task.id,
        status=task.status or "pending",
        text=task.text or "",
        model=task.model or "",
        voice=task.voice,
        style=task.style,
        speakers=speakers or None,
        output_format=task.output_format or "wav",
        audio_url=task.result_audio_url,
        credit_cost=task.credit_cost or 0.0,
        error_message=task.error_message,
        provider_id=task.provider_id,
        user_id=task.user_id or "",
        created_at=task.created_at,
        completed_at=task.completed_at,
        remaining_credits=remaining_credits,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{task_id}/status", response_model=TTSTaskResponse)
async def get_tts_task_status(
    task_id: str,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """轮询 TTS 任务状态（前端轮询用）"""
    task_result = await db.execute(select(TTSTask).where(TTSTask.id == task_id))
    task = task_result.scalar_one_or_none()
    task or (_ for _ in ()).throw(HTTPException(status_code=404, detail="TTS task not found"))

    # 轮询到 completed 时查一次当前用户余额，供前端同步 user.credits。
    remaining_credits: Optional[float] = None
    if task.status == "completed":
        user_row = (await db.execute(select(User.credits).where(User.id == current_user.id))).scalar()
        admin_row = user_row is None and (await db.execute(select(Admin.credits).where(Admin.id == current_user.id))).scalar()
        balance = user_row if user_row is not None else admin_row
        balance is not None and balance is not False and (remaining_credits := float(balance))

    return _build_task_response(task, remaining_credits=remaining_credits)


@router.get("/session/{session_id}", response_model=list[TTSTaskResponse])
async def get_session_tts_tasks(
    session_id: str,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取会话的 TTS 任务列表"""
    result = await db.execute(
        select(TTSTask)
        .where(TTSTask.session_id == session_id)
        .order_by(TTSTask.created_at.asc())
    )
    tasks = result.scalars().all()
    return [_build_task_response(t) for t in tasks]


@router.get("", response_model=dict)
async def list_tts_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """分页查询 TTS 任务列表"""
    query = select(TTSTask)
    count_query = select(func.count(TTSTask.id))

    # 行级隔离
    query = scoped_query(query, TTSTask, current_user)
    count_query = scoped_query(count_query, TTSTask, current_user)

    # 筛选
    status and (query := query.where(TTSTask.status == status))
    status and (count_query := count_query.where(TTSTask.status == status))

    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(TTSTask.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    tasks = (await db.execute(query)).scalars().all()

    items = [_build_task_response(t) for t in tasks]
    return {"items": [item.model_dump() for item in items], "total": total, "page": page, "page_size": page_size}


# ---------------------------------------------------------------------------
# Providers & capabilities & voices
# ---------------------------------------------------------------------------

@router.get("/providers", response_model=list[dict])
async def list_tts_providers(
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """列出所有支持 TTS 的活跃供应商。

    模型名称来源优先级（对齐 /music/providers）：
      1. provider.model_metadata[model].model_type == 'tts' → 使用 meta.display_name
      2. 如未配置 tts 元数据（兼容存量）→ gemini 内置的 _MODEL_CAPS 默认列表
    """
    stmt = select(LLMProvider).where(LLMProvider.is_active == True)
    providers = (await db.execute(stmt)).scalars().all()

    def _build_models(p: LLMProvider, tts_type: str) -> list[dict]:
        # 优先：从 model_metadata 中读取被管理员标为 tts 的模型
        tagged = [
            {
                "name": model_name,
                "display_name": (meta or {}).get("display_name") or model_name,
            }
            for model_name, meta in (p.model_metadata or {}).items()
            if (meta or {}).get("model_type") == "tts"
        ]
        # 兜底：gemini 供应商未配置元数据时，使用内置 TTS 默认列表
        fallback = [
            {"name": name, "display_name": caps.get("display_name") or name}
            for name, caps in _MODEL_CAPS.items()
        ] if (not tagged and tts_type == "gemini") else []
        return tagged or fallback

    out: list[dict] = []
    for p in providers:
        tts_type = extract_tts_provider_type(p.provider_type or "")
        models = _build_models(p, tts_type) if tts_type else []
        models and out.append({
            "id": p.id,
            "name": p.name,
            "provider_type": p.provider_type,
            "tts_provider_type": tts_type,
            "models": models,
        })
    return out


@router.get("/model-capabilities/{model}", response_model=dict)
async def get_tts_model_capabilities(
    model: str,
    current_user=Depends(get_current_active_user_or_admin),
):
    """返回指定 TTS 模型的能力描述（前端根据此开关面板字段）。"""
    caps = _MODEL_CAPS.get(model)
    caps or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Unknown TTS model"))
    return {"model": model, **caps}


@router.get("/voices", response_model=list[dict])
async def list_tts_voices(
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """返回可用音色列表：30 个预置 studio voices + 当前用户的复刻音色。

    每项：{name, tone, gender, type, display_name, id}
    - prebuilt：name = 音色名（如 Kore），tone = 英文语气标签，gender = male/female
    - replicated：name = voice_ ID（传给合成接口），display_name = 用户命名，id = 主键
    """
    prebuilt = [
        {"name": name, "tone": tone, "gender": gender, "type": "prebuilt", "display_name": name, "id": None}
        for name, tone, gender in PREBUILT_VOICES
    ]

    result = await db.execute(
        select(ReplicatedVoice)
        .where(ReplicatedVoice.user_id == current_user.id, ReplicatedVoice.status == "active")
        .order_by(ReplicatedVoice.created_at.desc())
    )
    replicated = [
        {
            "name": v.voice_id,
            "tone": "",
            "gender": "",
            "type": "replicated",
            "display_name": v.display_name,
            "id": v.id,
        }
        for v in result.scalars().all()
    ]
    return [*replicated, *prebuilt]


@router.post("/voices/replicate", response_model=dict)
async def replicate_tts_voice(
    display_name: str = Form(..., min_length=1, max_length=100),
    source_audio: UploadFile = File(...),
    consent_audio: UploadFile = File(...),
    provider_id: Optional[str] = Form(None),
    model: str = Form("gemini-3.8-flash-tts"),
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """上传参考音频 + 授权音频复刻音色，注册为持久音色并入库。"""
    source_bytes = await source_audio.read()
    consent_bytes = await consent_audio.read()

    # 校验：非空 + 大小 + MIME
    for label, blob, upload in (("source", source_bytes, source_audio), ("consent", consent_bytes, consent_audio)):
        (not blob) and (_ for _ in ()).throw(HTTPException(status_code=400, detail=f"{label}_audio is empty"))
        (len(blob) > _MAX_VOICE_SAMPLE_BYTES) and (_ for _ in ()).throw(
            HTTPException(status_code=400, detail=f"{label}_audio exceeds 15MB limit")
        )
        mime = (upload.content_type or "").lower()
        (mime and mime not in _ACCEPTED_AUDIO_TYPES) and (_ for _ in ()).throw(
            HTTPException(status_code=400, detail=f"{label}_audio type '{mime}' not supported (use WAV)")
        )

    result = await register_replicated_voice(
        db=db,
        user_id=current_user.id,
        display_name=display_name.strip(),
        source_audio_bytes=source_bytes,
        consent_audio_bytes=consent_bytes,
        provider_id=provider_id,
        model=model,
        source_mime=(source_audio.content_type or "audio/wav").lower(),
        consent_mime=(consent_audio.content_type or "audio/wav").lower(),
    )

    error = result.get("error")
    error and (_ for _ in ()).throw(HTTPException(status_code=400, detail=error))
    return result


@router.delete("/voices/replicated/{voice_pk}", response_model=dict)
async def delete_replicated_voice(
    voice_pk: str,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """删除（下架）用户自己的复刻音色记录。"""
    result = await db.execute(
        select(ReplicatedVoice).where(
            ReplicatedVoice.id == voice_pk, ReplicatedVoice.user_id == current_user.id
        )
    )
    voice = result.scalar_one_or_none()
    voice or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Replicated voice not found"))
    await db.delete(voice)
    await db.commit()
    return {"ok": True, "id": voice_pk}


@router.get("/voice-library", response_model=dict)
async def get_voice_library(
    provider_id: Optional[str] = Query(None, description="指定 TTS 供应商（为空时自动选第一个支持 TTS 的活跃供应商）"),
    gender: Optional[str] = Query(None, description="male/female/neutral（可逗号分隔）"),
    language_code: Optional[str] = Query(None, description="BCP-47，如 zh-CN,en-US（可逗号分隔）"),
    pitch: Optional[str] = Query(None, description="low/medium/high"),
    accent: Optional[str] = None,
    context: Optional[str] = Query(None, description="使用场景，如 Audiobook,Conversational,News"),
    persona: Optional[str] = None,
    search: Optional[str] = Query(None, max_length=100),
    voice_type: Optional[str] = Query(None, alias="type", description="prebuilt/prompted/replicated"),
    page_size: int = Query(50, ge=1, le=200),
    page_token: Optional[str] = None,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """代理查询 Gemini 扩展音色库（数百个音色，支持性别/语言/音高/搜索/分页）。

    API Key 由后端从活跃 TTS 供应商解析，不暴露给前端。
    """
    provider = await _resolve_tts_provider(db, provider_id)
    provider or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="No active TTS provider available for voice library")
    )

    result = await list_voice_library(
        api_key=provider.api_key,
        gender=gender,
        language_code=language_code,
        pitch=pitch,
        accent=accent,
        context=context,
        persona=persona,
        voice_type=voice_type,
        search=search or "",
        page_size=page_size,
        page_token=page_token or "",
    )

    error = result.get("error")
    error and (_ for _ in ()).throw(HTTPException(status_code=502, detail=error))
    return result


@router.post("/preview", response_model=TTSPreviewResponse)
async def preview_tts_voice(
    payload: TTSPreviewRequest,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """音色试听：同步合成一小段示例音频，返回内联 base64 WAV。

    专用于试听：不创建任务、不计费、不注册资产。适用于预置/复刻/扩展库任意音色。
    """
    provider = await _resolve_tts_provider(db, payload.provider_id)
    provider or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="No active TTS provider available for preview")
    )

    text = (payload.text or "").strip()[:200] or _DEFAULT_PREVIEW_TEXT
    # auto / 空 → 由模型自选音色（适配器会省略 speech_config）
    voice = "" if (payload.voice or "auto").strip().lower() == "auto" else payload.voice.strip()

    ctx = TTSContext(
        api_key=provider.api_key,
        model=payload.model or "gemini-3.8-flash-tts",
        text=text,
        voice=voice,
        style=payload.style or "",
        output_mime="audio/wav",
    )
    result = await generate_tts(ctx)

    failed = result.status != "completed" or not result.audio_data
    failed and (_ for _ in ()).throw(HTTPException(status_code=502, detail=result.error or "Preview synthesis failed"))

    return TTSPreviewResponse(
        audio_base64=base64.b64encode(result.audio_data).decode("ascii"),
        mime_type=result.mime_type or "audio/wav",
    )


# ---------------------------------------------------------------------------
# Submit TTS task (POST /)
# ---------------------------------------------------------------------------

@router.post("", response_model=TTSGenerateResponse)
async def create_tts_task(
    payload: TTSGenerateRequest,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """提交一个异步 TTS 合成任务（画布 TTS 节点调用）。"""
    # Lazy 月度重置 + 严格正余额校验
    await maybe_reset_monthly_credits(current_user.id, db)
    try:
        await require_positive_balance(current_user.id, db)
    except InsufficientCreditsError:
        raise BizError.insufficient_credits()
    except BalanceFrozenError:
        raise BizError.balance_frozen(user_id=current_user.id)

    speakers = [s.model_dump(exclude_none=True) for s in (payload.speakers or [])]
    (not payload.text.strip() and not speakers) and (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="Either text or speakers must be provided")
    )

    result = await submit_tts_task(
        db=db,
        user_id=current_user.id,
        text=payload.text,
        model=payload.model,
        provider_id=payload.provider_id,
        session_id=payload.session_id,
        theater_id=None,
        voice=payload.voice or "auto",
        style=payload.style or "",
        speakers=speakers,
        output_format=payload.output_format,
    )

    error = result.get("error")
    error and (_ for _ in ()).throw(HTTPException(status_code=400, detail=error))

    return TTSGenerateResponse(
        task_id=result["task_id"],
        status=result["status"],
        session_id=payload.session_id,
        node_id=payload.node_id,
        model=result["model"],
        provider_id=result.get("provider_id"),
    )
