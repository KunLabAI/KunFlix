"""arq Worker entrypoint.

启动方式（独立进程）：
    arq tasks_queue.worker.WorkerSettings

依赖：QUEUE_BACKEND=arq 与可用的 Redis（默认复用 REDIS_URL）。
"""
from __future__ import annotations

import logging

from tasks_queue.client import _redis_settings  # type: ignore
from tasks_queue.tasks import poll_video_task_job, run_music_task_job, run_batch_image_job

logger = logging.getLogger(__name__)


async def startup(ctx: dict) -> None:
    logger.info("arq worker started")


async def shutdown(ctx: dict) -> None:
    logger.info("arq worker shutdown")


class WorkerSettings:
    """arq 约定式 worker 配置。"""

    functions = [poll_video_task_job, run_music_task_job, run_batch_image_job]
    redis_settings = _redis_settings()
    on_startup = startup
    on_shutdown = shutdown
    job_timeout = 900
    keep_result = 60
