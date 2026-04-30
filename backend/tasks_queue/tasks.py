"""Background tasks definitions for arq worker.

约定：所有任务函数签名为 `async def task(ctx, ...) -> Any`，
ctx 为 arq 注入的字典（含 redis 等）。函数名即任务名，与 enqueue 的字符串保持一致。
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Video task polling
# ---------------------------------------------------------------------------

# poll 间隔（秒）与最大尝试次数
_POLL_INTERVAL_SEC = 10
_POLL_MAX_ATTEMPTS = 60   # 10s × 60 ≈ 10 分钟


async def poll_video_task_job(ctx: dict, task_id: str) -> dict:
    """后台轮询视频任务直至终态。

    流程：
    1. 加载 VideoTask + Provider
    2. 调用 provider 适配器查询状态
    3. 终态 → 更新 DB、扣费、生成资产、推送 WS
    4. 非终态 → 等待间隔后重试
    """
    from sqlalchemy.future import select
    from database import AsyncSessionLocal
    from models import VideoTask, LLMProvider
    from services.video_generation import poll_video_task, infer_provider_type
    from services.video_providers import extract_video_provider_type
    from realtime.dispatcher import push_to_user

    last_status = None
    attempt = 0
    while attempt < _POLL_MAX_ATTEMPTS:
        attempt += 1
        async with AsyncSessionLocal() as db:
            task = await db.scalar(select(VideoTask).where(VideoTask.id == task_id))
            if not task:
                logger.warning("poll_video_task_job: task not found id=%s", task_id)
                return {"ok": False, "reason": "not_found"}
            if task.status in {"completed", "failed"}:
                return {"ok": True, "status": task.status, "attempts": attempt}

            provider = await db.scalar(select(LLMProvider).where(LLMProvider.id == task.provider_id))
            if not provider:
                task.status = "failed"
                task.error_message = "provider missing"
                await db.commit()
                return {"ok": False, "reason": "provider_missing"}

            ptype = extract_video_provider_type(provider.provider_type) or infer_provider_type(task.model or "", provider.provider_type)
            try:
                poll = await poll_video_task(provider.api_key, task.xai_task_id, ptype, base_url=provider.base_url)
            except Exception as exc:  # noqa: BLE001
                logger.warning("poll_video_task_job upstream error attempt=%d: %s", attempt, exc)
                await asyncio.sleep(_POLL_INTERVAL_SEC)
                continue

            new_status = poll.status
            last_status = new_status
            if new_status in {"completed", "failed"}:
                task.status = new_status
                task.error_message = (poll.error.get("message") if isinstance(poll.error, dict) else str(poll.error or "")) or None
                task.completed_at = datetime.now(timezone.utc)
                await db.commit()
                # 推送终态
                task.user_id and await push_to_user(
                    task.user_id,
                    f"video.{new_status}",
                    {"task_id": task.id, "status": new_status, "video_url": poll.video_url},
                )
                return {"ok": True, "status": new_status, "attempts": attempt}

        await asyncio.sleep(_POLL_INTERVAL_SEC)

    # 超时收尾：不擅自标记 failed，避免与用户主动轮询路径冲突
    return {"ok": False, "reason": "timeout", "last_status": last_status}


__all__ = ["poll_video_task_job", "run_music_task_job", "run_batch_image_job"]


# ---------------------------------------------------------------------------
# Music task execution
# ---------------------------------------------------------------------------

async def run_music_task_job(
    ctx: dict,
    task_id: str,
    music_ctx_payload: dict,
    provider_id: str,
    user_id: str,
    session_id: str | None = None,
    theater_id: str | None = None,
) -> dict:
    """在 arq worker 进程中执行音乐生成。

    入参都是可序列化原语（免于跨进程传 dataclass）：
    - music_ctx_payload: {api_key, model, prompt, provider_type, output_format, reference_images}
    生成完成后由 execute_music_task_background 自行将状态回写 DB；
    进一步 push_to_user 使前端 SSE/WS 能收到终态事件。
    """
    from services.music_providers.base import MusicContext
    from services.music_generation import execute_music_task_background
    from realtime.dispatcher import push_to_user
    from sqlalchemy.future import select
    from database import AsyncSessionLocal
    from models import MusicTask

    music_ctx = MusicContext(**music_ctx_payload)
    await execute_music_task_background(
        task_id=task_id,
        music_ctx=music_ctx,
        provider_id=provider_id,
        user_id=user_id,
        session_id=session_id,
        theater_id=theater_id,
    )

    # 读回状态并推送 WS
    async with AsyncSessionLocal() as db:
        task = await db.scalar(select(MusicTask).where(MusicTask.id == task_id))
        task and user_id and await push_to_user(
            user_id,
            f"music.{task.status}",
            {
                "task_id": task.id,
                "status": task.status,
                "audio_url": task.result_audio_url,
                "lyrics": task.lyrics,
            },
        )
        return {"ok": True, "task_id": task_id, "status": getattr(task, "status", "unknown")}


# ---------------------------------------------------------------------------
# Batch image generation (Gemini)
# ---------------------------------------------------------------------------

async def run_batch_image_job(
    ctx: dict,
    payload: dict,
) -> dict:
    """后台批量图像生成。payload 格式：

    {
      "api_key": str, "model": str, "prompts": list[str],
      "config": {...BatchImageConfig...},
      "max_concurrent": int,
      "user_id": str, "ref_id": str | None
    }
    完成后向 user 推送 "image.batch.completed" 事件。
    """
    from services.batch_image_gen import batch_generate_images, BatchImageConfig
    from realtime.dispatcher import push_to_user

    cfg_dict = payload.get("config") or {}
    config = BatchImageConfig(**{k: v for k, v in cfg_dict.items() if k in BatchImageConfig.__dataclass_fields__})
    result = await batch_generate_images(
        api_key=payload["api_key"],
        model=payload["model"],
        prompts=payload.get("prompts") or [],
        config=config,
        max_concurrent=int(payload.get("max_concurrent") or 4),
        user_id=payload.get("user_id"),
    )

    user_id = payload.get("user_id")
    user_id and await push_to_user(
        user_id,
        "image.batch.completed",
        {
            "ref_id": payload.get("ref_id"),
            "total": result.total_prompts,
            "completed": result.completed,
            "failed": result.failed,
            "image_urls": [r.image_url for r in result.results if r.image_url],
        },
    )
    return {
        "ok": True,
        "total": result.total_prompts,
        "completed": result.completed,
        "failed": result.failed,
    }
