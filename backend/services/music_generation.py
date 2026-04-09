"""
music_generation — 音乐生成工厂 + 异步后台任务执行器。

调度模式：映射表驱动，与 video_generation.py 同构。
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from services.music_providers import (
    MusicContext,
    MusicResult,
    MusicProviderAdapter,
    GeminiLyriaAdapter,
    extract_music_provider_type,
)
from services.media_utils import save_audio_data

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
        audio_url = save_audio_data(result.audio_data, result.mime_type)

        # ---- 计费 ----
        credit_cost = 0.0
        billing_metadata: dict = {}
        try:
            credit_cost, billing_metadata = await _calculate_and_deduct(
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
            "Music task %s completed: %s (cost=%.4f)",
            task_id, audio_url, credit_cost,
        )

        # ---- 画布音频节点创建（可选） ----
        theater_id and await _create_canvas_audio_node(db, theater_id, audio_url, task)

    except Exception:
        logger.exception("Music background task %s crashed", task_id)
        # 尝试标记为失败
        try:
            task_stmt = select(MusicTask).where(MusicTask.id == task_id)
            task = (await db.execute(task_stmt)).scalar_one_or_none()
            task and _mark_failed(task, "Internal error during music generation")
            await db.commit()
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
) -> tuple[float, dict]:
    """计算音乐生成费用并原子扣费。"""
    from models import LLMProvider
    from sqlalchemy import select
    from services.billing import deduct_credits_atomic

    prov_stmt = select(LLMProvider).where(LLMProvider.id == provider_id)
    provider = (await db.execute(prov_stmt)).scalar_one_or_none()

    rate_map: dict = {}
    model_costs = (provider.model_costs or {}) if provider else {}
    rate_map = model_costs.get(model, {})

    # 按次计费：audio_generation 维度
    rate = rate_map.get("audio_generation", 0) or 0
    total_cost = float(rate)

    metadata = {
        "model": model,
        "audio_generation_rate": rate,
        "task_id": task_id,
    }

    # 仅在有费用时扣费
    total_cost > 0 and await deduct_credits_atomic(
        user_id=user_id,
        cost=total_cost,
        session=db,
        metadata=metadata,
        transaction_type="consumption",
    )

    return total_cost, metadata


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
