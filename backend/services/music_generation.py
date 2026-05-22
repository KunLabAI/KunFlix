"""
music_generation — 音乐生成工厂 + 异步后台任务执行器。

调度模式：映射表驱动，与 video_generation.py 同构。
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

from services.music_providers import (
    MusicContext,
    MusicResult,
    MusicProviderAdapter,
    GeminiLyriaAdapter,
    extract_music_provider_type,
    MUSIC_PROVIDER_TYPES,
)
from services.media_utils import save_audio_data, MEDIA_DIR, get_relative_path, resolve_media_filepath
from models import Asset, User, generate_uuid
from sqlalchemy import func

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 供应商注册表
# ---------------------------------------------------------------------------
_PROVIDER_REGISTRY: dict[str, type[MusicProviderAdapter]] = {
    "gemini": GeminiLyriaAdapter,
}


def get_provider_adapter(provider_type: str) -> MusicProviderAdapter:
    """根据供应商类型获取适配器实例。"""
    cls = _PROVIDER_REGISTRY.get(provider_type)
    return cls() if cls else None


async def generate_music(ctx: MusicContext) -> MusicResult:
    """统一入口：根据 provider_type 分派到对应适配器。"""
    adapter = get_provider_adapter(ctx.provider_type)
    return (
        await adapter.generate(ctx)
        if adapter
        else MusicResult(status="failed", error=f"Unsupported music provider: {ctx.provider_type}")
    )


# ---------------------------------------------------------------------------
# Asset Registration
# ---------------------------------------------------------------------------

async def _register_music_asset(audio_url: str, mime_type: str, user_id: str, db: "AsyncSession") -> None:
    """将生成的音乐注册为用户 Asset 记录，使其出现在用户资产模块中。"""
    (not user_id) and logger.debug("Skipping music asset registration: no user_id")
    
    (not user_id) or await _do_register_music_asset(audio_url, mime_type, user_id, db)


async def _do_register_music_asset(audio_url: str, mime_type: str, user_id: str, db: "AsyncSession") -> None:
    """实际执行音乐资产注册。"""
    try:
        filename = audio_url.rsplit("/", 1)[-1]  # e.g. "uuid.mp3"
        relative = get_relative_path(user_id, "audio", filename)
        filepath = MEDIA_DIR / relative
        size = filepath.stat().st_size if filepath.exists() else None
        
        asset = Asset(
            id=generate_uuid(),
            user_id=user_id,
            filename=filename,
            original_name=f"generated_{filename}",
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
        logger.info("Registered music as asset: %s (user=%s)", filename, user_id)
    except Exception as e:
        logger.warning("Failed to register music asset: %s", e, exc_info=True)


# ---------------------------------------------------------------------------
# 实时通知辅助
# ---------------------------------------------------------------------------

async def _push_music_event(user_id: str, task, billing_underpaid: bool = False, remaining_credits: Optional[float] = None) -> None:
    """将音乐任务终态推送给前端（安静失败）。"""
    try:
        from realtime.dispatcher import push_to_user
        await push_to_user(
            user_id,
            f"music.{task.status}",
            {
                "task_id": task.id,
                "status": task.status,
                "audio_url": task.result_audio_url,
                "lyrics": task.lyrics,
                "billing_underpaid": billing_underpaid,
                "remaining_credits": remaining_credits,
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.debug("push_music_event failed (user=%s): %s", user_id, exc)


# ---------------------------------------------------------------------------
# 后台任务执行器
# ---------------------------------------------------------------------------

async def execute_music_task_background(
    task_id: str,
    music_ctx: MusicContext,
    provider_id: str,
    user_id: str,
    session_id: str | None,
    theater_id: str | None,
) -> None:
    """后台协程：执行音乐生成、保存文件、计费、创建画布节点。

    使用独立的 DB session（不依赖请求上下文）。
    """
    from database import AsyncSessionLocal
    from models import MusicTask, LLMProvider
    from sqlalchemy import select

    db: AsyncSession = AsyncSessionLocal()
    try:
        # ---- 执行生成 ----
        result = await generate_music(music_ctx)

        task_stmt = select(MusicTask).where(MusicTask.id == task_id)
        task = (await db.execute(task_stmt)).scalar_one_or_none()
        if not task:
            logger.error("MusicTask %s not found in background", task_id)
            return

        # ---- 失败处理 ----
        if result.status != "completed" or not result.audio_data:
            task.status = "failed"
            task.error_message = result.error or "No audio data returned"
            task.completed_at = datetime.now(timezone.utc)
            await db.commit()
            logger.warning("Music task %s failed: %s", task_id, task.error_message)
            return

        # ---- 保存音频文件 ----
        audio_url = await save_audio_data(result.audio_data, result.mime_type, user_id=user_id)
        
        # ---- 注册用户资产 ----
        await _register_music_asset(audio_url, result.mime_type, user_id, db)

        # ---- 计费 ----
        credit_cost = 0.0
        billing_metadata: dict = {}
        billing_underpaid = False  # 本次扣费是否不足被兜底扣到 0
        remaining_credits: Optional[float] = None  # 扣费后用户余额
        try:
            credit_cost, billing_metadata, billing_underpaid, remaining_credits = await _calculate_and_deduct(
                db, provider_id, music_ctx.model, user_id, task_id,
            )
        except Exception as exc:
            logger.warning("Music billing error for task %s: %s", task_id, exc)

        # ---- 更新任务记录 ----
        task.status = "completed"
        task.result_audio_url = audio_url
        task.lyrics = result.lyrics
        task.credit_cost = credit_cost
        task.completed_at = datetime.now(timezone.utc)
        await db.commit()

        logger.info(
            "Music task %s completed: %s (cost=%.4f, remaining=%s)",
            task_id, audio_url, credit_cost, remaining_credits,
        )

        # ---- 画布音频节点创建（可选） ----
        theater_id and await _create_canvas_audio_node(db, theater_id, audio_url, task)

        # ---- 实时通知前端（兼容 arq worker 和 fallback 路径） ----
        await _push_music_event(user_id, task, billing_underpaid=billing_underpaid, remaining_credits=remaining_credits)

    except Exception:
        logger.exception("Music background task %s crashed", task_id)
        # 尝试标记为失败
        try:
            task_stmt = select(MusicTask).where(MusicTask.id == task_id)
            task = (await db.execute(task_stmt)).scalar_one_or_none()
            task and _mark_failed(task, "Internal error during music generation")
            await db.commit()
            # 通知前端失败状态
            task and await _push_music_event(user_id, task)
        except Exception:
            logger.exception("Failed to mark music task %s as failed", task_id)
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
    """计算音乐生成费用并原子扣费。

    返回 (cost, metadata, underpaid, remaining_credits)：
    - underpaid=True 表示本次扣费不足、余额被兜底扣到 0
    - remaining_credits 为扣费后用户最新余额（免费任务为 None）
    """
    from services.billing import deduct_credits_atomic, load_pricing, InsufficientCreditsError

    # 从 ModelPricing（供应商, 模型）读取积分卖价
    rate_map = await load_pricing(provider_id, model, db)

    # 按次计费：audio_generation 维度
    rate = rate_map.get("audio_generation", 0) or 0
    total_cost = float(rate)

    metadata = {
        "model": model,
        "audio_generation_rate": rate,
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
            idempotency_key=f"music:{task_id}",
        )
        # 同步最新余额供上层推送给前端
        tx and hasattr(tx, 'balance_after') and (remaining_credits := float(tx.balance_after))
    except InsufficientCreditsError:
        underpaid = True
        remaining_credits = 0.0
        logger.warning(
            "Music task %s underpaid: user=%s cost=%.4f, balance drained to 0",
            task_id, user_id, total_cost,
        )

    return total_cost, metadata, underpaid, remaining_credits


# ---------------------------------------------------------------------------
# 画布节点创建
# ---------------------------------------------------------------------------

async def _create_canvas_audio_node(
    db: "AsyncSession",
    theater_id: str,
    audio_url: str,
    task,
) -> None:
    """在画布上自动创建音频节点。"""
    from models import TheaterNode
    import uuid as _uuid

    try:
        node = TheaterNode(
            id=str(_uuid.uuid4()),
            theater_id=theater_id,
            node_type="audio",
            position_x=100,
            position_y=100,
            width=280,
            height=180,
            z_index=0,
            data={
                "name": (task.prompt[:30] + "...") if len(task.prompt) > 30 else task.prompt,
                "description": task.lyrics[:100] if task.lyrics else "",
                "audioUrl": audio_url,
                "lyrics": task.lyrics or "",
            },
        )
        db.add(node)
        await db.commit()
        logger.info("Created canvas audio node for music task %s in theater %s", task.id, theater_id)
    except Exception:
        logger.exception("Failed to create canvas audio node for task %s", task.id)


def _mark_failed(task, error_msg: str) -> None:
    """标记任务失败（无条件赋值）。"""
    task.status = "failed"
    task.error_message = error_msg
    task.completed_at = datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# 异步提交入口（供 REST / 工具链共同复用）
# ---------------------------------------------------------------------------

import base64 as _b64
import mimetypes as _mimetypes
from dataclasses import asdict as _asdict


def _resolve_local_media(url: str | None) -> str | None:
    """将本地 /api/media/xxx.jpg 路径转换为 base64 data URI。"""
    is_local = (url or "").startswith("/api/media/")
    if not is_local:
        return url
    filename = url.rsplit("/", 1)[-1]
    filepath = resolve_media_filepath(filename)
    if not filepath:
        logger.warning("Local media file not found: %s", filename)
        return url
    mime, _ = _mimetypes.guess_type(str(filepath))
    mime = mime or "image/jpeg"
    b64 = _b64.b64encode(filepath.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _normalize_reference_images(raw: list) -> list[dict]:
    """将各种格式的 reference_images 统一为 {url, mime_type}。输入可以是 str 或 dict。"""
    out: list[dict] = []
    for item in (raw or [])[:10]:
        is_dict = isinstance(item, dict)
        url = item.get("url", "") if is_dict else str(item or "")
        mime = item.get("mime_type", "") if is_dict else ""
        resolved = _resolve_local_media(url)
        has_data_uri = (resolved or "").startswith("data:")
        guessed, _ = (None, None) if has_data_uri else _mimetypes.guess_type(url)
        final_mime = mime or guessed or "image/jpeg"
        resolved and out.append({"url": resolved, "mime_type": final_mime})
    return out


async def submit_music_task(
    *,
    db: "AsyncSession",
    user_id: str,
    prompt: str,
    model: str,
    provider_id: str | None = None,
    session_id: str | None = None,
    theater_id: str | None = None,
    output_format: str = "mp3",
    negative_prompt: str = "",
    structured: dict | None = None,
    reference_images: list | None = None,
) -> dict:
    """提交一个音乐生成任务：校验 provider → 创建 MusicTask → 入队 arq / fallback asyncio。

    返回：{task_id, status, model, provider_id} 或 {error}。
    调用方负责 commit/refresh。
    """
    from models import LLMProvider, MusicTask
    from sqlalchemy import select
    from tasks_queue import enqueue as enqueue_job

    # ---- 解析 provider ----
    prov_stmt = select(LLMProvider).where(LLMProvider.is_active == True)
    prov_stmt = prov_stmt.where(LLMProvider.id == provider_id) if provider_id else prov_stmt
    provider = (await db.execute(prov_stmt)).scalars().first()
    if not provider:
        return {"error": "Music provider not found or inactive"}

    music_provider_type = extract_music_provider_type(provider.provider_type or "")
    if not music_provider_type:
        return {"error": f"Provider type '{provider.provider_type}' does not support music generation"}

    # ---- 构造 MusicContext ----
    ref_images = _normalize_reference_images(reference_images or [])
    ctx = MusicContext(
        api_key=provider.api_key,
        model=model,
        prompt=prompt,
        provider_type=music_provider_type,
        output_format=output_format,
        reference_images=ref_images,
        structured=structured or None,
        negative_prompt=negative_prompt or "",
    )

    # ---- 写入 MusicTask ----
    task = MusicTask(
        session_id=session_id,
        provider_id=provider.id,
        model=model,
        user_id=user_id,
        prompt=prompt,
        output_format=output_format,
        input_image_count=len(ref_images),
        status="processing",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    logger.info("Music task submitted: %s (%s: %s)", task.id, music_provider_type, model)

    # ---- 入队或 fallback ----
    job = await enqueue_job(
        "run_music_task_job",
        task.id,
        _asdict(ctx),
        provider.id,
        user_id,
        session_id,
        theater_id,
    )
    job is None and asyncio.create_task(
        execute_music_task_background(
            task_id=task.id,
            music_ctx=ctx,
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
