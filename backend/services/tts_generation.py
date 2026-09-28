"""
tts_generation — TTS 语音合成工厂 + 异步后台任务执行器。

调度模式：映射表驱动，与 music_generation.py 同构。
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict as _asdict
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from services.tts_providers import (
    TTSContext,
    TTSResult,
    TTSSpeaker,
    TTSProviderAdapter,
    GeminiTTSAdapter,
    extract_tts_provider_type,
    replicate_voice,
    TTS_PROVIDER_TYPES,
)
from services.media_utils import save_audio_data, MEDIA_DIR, get_relative_path
from models import Asset, User, ReplicatedVoice, generate_uuid
from sqlalchemy import func

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# output_format -> response mime 映射
_FORMAT_MIME: dict[str, str] = {
    "wav": "audio/wav",
    "l16": "audio/l16",
}


# ---------------------------------------------------------------------------
# 供应商注册表
# ---------------------------------------------------------------------------
_PROVIDER_REGISTRY: dict[str, type[TTSProviderAdapter]] = {
    "gemini": GeminiTTSAdapter,
}


def get_provider_adapter(provider_type: str) -> TTSProviderAdapter:
    """根据供应商类型获取适配器实例。"""
    cls = _PROVIDER_REGISTRY.get(provider_type)
    return cls() if cls else None


async def generate_tts(ctx: TTSContext) -> TTSResult:
    """统一入口：根据 provider_type 分派到对应适配器。"""
    adapter = get_provider_adapter(ctx.provider_type)
    return (
        await adapter.generate(ctx)
        if adapter
        else TTSResult(status="failed", error=f"Unsupported TTS provider: {ctx.provider_type}")
    )


# ---------------------------------------------------------------------------
# Asset Registration
# ---------------------------------------------------------------------------

async def _register_tts_asset(audio_url: str, mime_type: str, user_id: str, db: "AsyncSession") -> None:
    """将合成的语音注册为用户 Asset 记录，使其出现在用户资产模块中。"""
    (not user_id) and logger.debug("Skipping TTS asset registration: no user_id")

    (not user_id) or await _do_register_tts_asset(audio_url, mime_type, user_id, db)


async def _do_register_tts_asset(audio_url: str, mime_type: str, user_id: str, db: "AsyncSession") -> None:
    """实际执行语音资产注册。"""
    try:
        filename = audio_url.rsplit("/", 1)[-1]  # e.g. "uuid.wav"
        relative = get_relative_path(user_id, "audio", filename)
        filepath = MEDIA_DIR / relative
        size = filepath.stat().st_size if filepath.exists() else None

        asset = Asset(
            id=generate_uuid(),
            user_id=user_id,
            filename=filename,
            original_name=f"tts_{filename}",
            file_path=relative,
            file_type="audio",
            mime_type=mime_type,
            size=size,
        )
        db.add(asset)
        # 增量更新用户存储用量
        (size or 0) and await db.execute(
            User.__table__.update()
            .where(User.id == user_id)
            .values(storage_used_bytes=func.coalesce(User.storage_used_bytes, 0) + size)
        )
        await db.flush()
        logger.info("Registered TTS audio as asset: %s (user=%s)", filename, user_id)
    except Exception as e:
        logger.warning("Failed to register TTS asset: %s", e, exc_info=True)


# ---------------------------------------------------------------------------
# 实时通知辅助
# ---------------------------------------------------------------------------

async def _push_tts_event(user_id: str, task, billing_underpaid: bool = False, remaining_credits: Optional[float] = None) -> None:
    """将 TTS 任务终态推送给前端（安静失败）。"""
    try:
        from realtime.dispatcher import push_to_user
        await push_to_user(
            user_id,
            f"tts.{task.status}",
            {
                "task_id": task.id,
                "status": task.status,
                "audio_url": task.result_audio_url,
                "billing_underpaid": billing_underpaid,
                "remaining_credits": remaining_credits,
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug("push_tts_event failed (user=%s): %s", user_id, exc)


# ---------------------------------------------------------------------------
# 后台任务执行器
# ---------------------------------------------------------------------------

async def execute_tts_task_background(
    task_id: str,
    tts_ctx: TTSContext,
    provider_id: str,
    user_id: str,
    session_id: str | None,
    theater_id: str | None,
) -> None:
    """后台协程：执行语音合成、保存文件、计费、更新画布节点。

    使用独立的 DB session（不依赖请求上下文）。
    """
    from database import AsyncSessionLocal
    from models import TTSTask
    from sqlalchemy import select

    db: AsyncSession = AsyncSessionLocal()
    try:
        # ---- 执行生成 ----
        result = await generate_tts(tts_ctx)

        task_stmt = select(TTSTask).where(TTSTask.id == task_id)
        task = (await db.execute(task_stmt)).scalar_one_or_none()
        if not task:
            logger.error("TTSTask %s not found in background", task_id)
            return

        # ---- 失败处理 ----
        if result.status != "completed" or not result.audio_data:
            task.status = "failed"
            task.error_message = result.error or "No audio data returned"
            task.completed_at = datetime.now(timezone.utc)
            await db.commit()
            logger.warning("TTS task %s failed: %s", task_id, task.error_message)
            await _push_tts_event(user_id, task)
            return

        # ---- 保存音频文件 ----
        audio_url = await save_audio_data(result.audio_data, result.mime_type, user_id=user_id)

        # ---- 注册用户资产 ----
        await _register_tts_asset(audio_url, result.mime_type, user_id, db)

        # ---- 计费 ----
        credit_cost = 0.0
        billing_underpaid = False  # 本次扣费是否不足被兜底扣到 0
        remaining_credits: Optional[float] = None  # 扣费后用户余额
        try:
            credit_cost, _meta, billing_underpaid, remaining_credits = await _calculate_and_deduct(
                db, provider_id, tts_ctx.model, user_id, task_id,
            )
        except Exception as exc:
            logger.warning("TTS billing error for task %s: %s", task_id, exc)

        # ---- 更新任务记录 ----
        task.status = "completed"
        task.result_audio_url = audio_url
        task.credit_cost = credit_cost
        task.completed_at = datetime.now(timezone.utc)
        await db.commit()

        logger.info(
            "TTS task %s completed: %s (cost=%.4f, remaining=%s)",
            task_id, audio_url, credit_cost, remaining_credits,
        )

        # ---- 画布占位节点更新（如果工具执行时创建了占位节点） ----
        task.canvas_node_id and await _update_canvas_tts_node(db, task, audio_url)

        # ---- 实时通知前端（兼容 arq worker 和 fallback 路径） ----
        await _push_tts_event(user_id, task, billing_underpaid=billing_underpaid, remaining_credits=remaining_credits)

    except Exception:
        logger.exception("TTS background task %s crashed", task_id)
        # 尝试标记为失败
        try:
            task_stmt = select(TTSTask).where(TTSTask.id == task_id)
            task = (await db.execute(task_stmt)).scalar_one_or_none()
            task and _mark_failed(task, "Internal error during speech generation")
            await db.commit()
            # 通知前端失败状态
            task and await _push_tts_event(user_id, task)
        except Exception:
            logger.exception("Failed to mark TTS task %s as failed", task_id)
    finally:
        await db.close()


# ---------------------------------------------------------------------------
# 计费辅助
# ---------------------------------------------------------------------------

async def _calculate_and_deduct(
    db: "AsyncSession",
    provider_id: str,
    model: str,
    user_id: str,
    task_id: str,
) -> tuple[float, dict, bool, Optional[float]]:
    """计算 TTS 合成费用并原子扣费。

    返回 (cost, metadata, underpaid, remaining_credits)：
    - underpaid=True 表示本次扣费不足、余额被兜底扣到 0
    - remaining_credits 为扣费后用户最新余额（免费任务为 None）
    """
    from services.billing import deduct_credits_atomic, load_pricing, InsufficientCreditsError

    # 从 ModelPricing（供应商, 模型）读取积分卖价
    rate_map = await load_pricing(provider_id, model, db)

    # 按次计费：tts_generation 维度
    rate = rate_map.get("tts_generation", 0) or 0
    total_cost = float(rate)

    metadata = {
        "model": model,
        "tts_generation_rate": rate,
        "task_id": task_id,
    }

    # 仅在有费用时扣费；扣费不足时 deduct_credits_atomic 会把余额兜底扣到 0 并抛 InsufficientCreditsError
    underpaid = False
    remaining_credits: Optional[float] = None
    try:
        tx = total_cost > 0 and await deduct_credits_atomic(
            user_id=user_id,
            cost=total_cost,
            session=db,
            metadata=metadata,
            transaction_type="consumption",
            idempotency_key=f"tts:{task_id}",
        )
        # 同步最新余额供上层推送给前端
        tx and hasattr(tx, 'balance_after') and (remaining_credits := float(tx.balance_after))
    except InsufficientCreditsError:
        underpaid = True
        remaining_credits = 0.0
        logger.warning(
            "TTS task %s underpaid: user=%s cost=%.4f, balance drained to 0",
            task_id, user_id, total_cost,
        )

    return total_cost, metadata, underpaid, remaining_credits


# ---------------------------------------------------------------------------
# 画布节点更新
# ---------------------------------------------------------------------------

async def _update_canvas_tts_node(
    db: "AsyncSession",
    task,
    audio_url: str,
) -> None:
    """更新占位 TTS 节点为实际媒体 URL。"""
    try:
        from services.media_canvas_bridge import update_placeholder_node
        from realtime.dispatcher import push_to_user
        name = (task.text[:30] + "...") if len(task.text) > 30 else task.text
        await update_placeholder_node(
            task.canvas_node_id,
            {"audioUrl": audio_url, "text": task.text or "", "name": name},
            db,
        )
        # 通知前端画布更新
        task.user_id and await push_to_user(
            task.user_id, "canvas.updated", {"action": "update_canvas_node"}
        )
    except Exception:
        logger.exception("Failed to update canvas TTS node for task %s", task.id)


def _mark_failed(task, error_msg: str) -> None:
    """标记任务失败（无条件赋值）。"""
    task.status = "failed"
    task.error_message = error_msg
    task.completed_at = datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# 异步提交入口（供 REST / 工具链共同复用）
# ---------------------------------------------------------------------------

def _normalize_speakers(raw: list) -> list[dict]:
    """将各种格式的 speakers 统一为 {speaker, voice, text, style} dict 列表（最多 2 个）。"""
    out: list[dict] = []
    for item in (raw or [])[:2]:
        is_dict = isinstance(item, dict)
        speaker = (item.get("speaker") or "").strip() if is_dict else ""
        text = (item.get("text") or "").strip() if is_dict else str(item or "").strip()
        # 无角色名或无台词的条目直接丢弃
        (speaker and text) and out.append({
            "speaker": speaker,
            "voice": (item.get("voice") or "").strip() if is_dict else "",
            "text": text,
            "style": (item.get("style") or "").strip() if is_dict else "",
        })
    return out


async def submit_tts_task(
    *,
    db: "AsyncSession",
    user_id: str,
    text: str,
    model: str,
    provider_id: str | None = None,
    session_id: str | None = None,
    theater_id: str | None = None,
    voice: str = "",
    style: str = "",
    speakers: list | None = None,
    output_format: str = "wav",
) -> dict:
    """提交一个 TTS 合成任务：校验 provider → 创建 TTSTask → 入队 arq / fallback asyncio。

    返回：{task_id, status, model, provider_id} 或 {error}。
    调用方负责 commit/refresh。
    """
    from models import LLMProvider, TTSTask
    from sqlalchemy import select
    from tasks_queue import enqueue as enqueue_job

    # ---- 解析 provider ----
    prov_stmt = select(LLMProvider).where(LLMProvider.is_active == True)
    prov_stmt = prov_stmt.where(LLMProvider.id == provider_id) if provider_id else prov_stmt
    provider = (await db.execute(prov_stmt)).scalars().first()
    if not provider:
        return {"error": "TTS provider not found or inactive"}

    tts_provider_type = extract_tts_provider_type(provider.provider_type or "")
    if not tts_provider_type:
        return {"error": f"Provider type '{provider.provider_type}' does not support TTS"}

    # ---- 构造 TTSContext ----
    speaker_list = _normalize_speakers(speakers or [])
    effective_text = text.strip() or "\n".join(f"{s['speaker']}: {s['text']}" for s in speaker_list)
    if not effective_text and not speaker_list:
        return {"error": "TTS text is required"}

    # "auto" / 空 → 自动音色（适配器省略 speech_config，由模型自行选择）
    effective_voice = "" if (voice or "").strip().lower() == "auto" else (voice or "").strip()

    ctx = TTSContext(
        api_key=provider.api_key,
        model=model,
        text=effective_text,
        provider_type=tts_provider_type,
        voice=effective_voice,
        style=style or "",
        speakers=[TTSSpeaker(**s) for s in speaker_list],
        output_mime=_FORMAT_MIME.get(output_format, "audio/wav"),
    )

    # ---- 写入 TTSTask ----
    task = TTSTask(
        session_id=session_id,
        provider_id=provider.id,
        model=model,
        user_id=user_id,
        text=effective_text,
        voice=effective_voice or None,
        style=style or "",
        speakers_json=speaker_list or None,
        output_format=output_format,
        status="processing",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    logger.info("TTS task submitted: %s (%s: %s)", task.id, tts_provider_type, model)

    # ---- 入队或 fallback ----
    ctx_payload = _asdict(ctx)
    job = await enqueue_job(
        "run_tts_task_job",
        task.id,
        ctx_payload,
        provider.id,
        user_id,
        session_id,
        theater_id,
    )
    job is None and asyncio.create_task(
        execute_tts_task_background(
            task_id=task.id,
            tts_ctx=ctx,
            provider_id=provider.id,
            user_id=user_id,
            session_id=session_id,
            theater_id=theater_id,
        )
    )

    return {
        "task_id": task.id,
        "status": task.status,
        "model": task.model,
        "provider_id": provider.id,
    }


# ---------------------------------------------------------------------------
# 音色复刻（持久音色库）
# ---------------------------------------------------------------------------

async def _resolve_tts_provider(db: "AsyncSession", provider_id: str | None):
    """解析一个支持 TTS 的活跃供应商。

    provider_id 指定时→该供应商（仍需支持 TTS）；
    为空时→遍历所有活跃供应商，取第一个 provider_type 支持 TTS 的（而非盲取首个）。
    """
    from models import LLMProvider
    from sqlalchemy import select

    stmt = select(LLMProvider).where(LLMProvider.is_active == True)
    stmt = stmt.where(LLMProvider.id == provider_id) if provider_id else stmt
    providers = (await db.execute(stmt)).scalars().all()
    # 取第一个 provider_type 支持 TTS 的供应商（生成器 + next，避免 if 堆叠）
    return next((p for p in providers if extract_tts_provider_type(p.provider_type or "")), None)


async def register_replicated_voice(
    *,
    db: "AsyncSession",
    user_id: str,
    display_name: str,
    source_audio_bytes: bytes,
    consent_audio_bytes: bytes,
    provider_id: str | None = None,
    model: str = "gemini-3.8-flash-tts",
    source_mime: str = "audio/wav",
    consent_mime: str = "audio/wav",
) -> dict:
    """复刻音色并入库（持久音色库）。

    返回：{voice_id, id, display_name, model, provider_id} 或 {error}。
    调用方负责 commit/refresh。
    """
    import base64 as _b64

    provider = await _resolve_tts_provider(db, provider_id)
    if not provider:
        return {"error": "TTS provider not found or does not support voice replication"}

    result = await replicate_voice(
        api_key=provider.api_key,
        model=model,
        display_name=display_name,
        source_audio_b64=_b64.b64encode(source_audio_bytes).decode("ascii"),
        consent_audio_b64=_b64.b64encode(consent_audio_bytes).decode("ascii"),
        source_mime=source_mime,
        consent_mime=consent_mime,
        store=True,
    )

    if result.status != "completed" or not result.voice_id:
        return {"error": result.error or "Voice replication failed"}

    voice = ReplicatedVoice(
        id=generate_uuid(),
        user_id=user_id,
        provider_id=provider.id,
        model=model,
        display_name=display_name,
        voice_id=result.voice_id,
        status="active",
    )
    db.add(voice)
    await db.commit()
    await db.refresh(voice)

    logger.info("Registered replicated voice %s (%s) for user %s", result.voice_id, display_name, user_id)
    return {
        "voice_id": result.voice_id,
        "id": voice.id,
        "display_name": voice.display_name,
        "model": voice.model,
        "provider_id": voice.provider_id,
    }
