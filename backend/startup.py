"""Application startup orchestration.

把 main.py 中的数据库重试 / Alembic 迁移 / 残留临时表清理 / 启动初始化
等逻辑抽成模块化函数，避免 main.py 臃肿，并让 SQLite 专属的 tmp-table
清理通过方言映射表调度，不再硬编码在主流程里。

对外仅暴露 `run_startup(app)` 与 `lifespan` 上下文管理器。
"""
from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Callable

from fastapi import FastAPI

from config import DB_PATH, settings
from database import engine

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parent
_MAX_DB_RETRIES = 5
_DB_RETRY_DELAY_SECONDS = 2


# ---------------------------------------------------------------------------
# Alembic migration runner
# ---------------------------------------------------------------------------

def _run_alembic_upgrade() -> None:
    subprocess.check_call(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(_BACKEND_DIR),
    )


def _cleanup_sqlite_tmp_tables() -> None:
    """Alembic 在 SQLite 上失败时常残留 _alembic_tmp_* 表，需清理后重试。"""
    import sqlite3

    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_alembic_tmp_%'"
        )
        residuals = [row[0] for row in cur.fetchall()]
        for table in residuals:
            logger.warning("Dropping residual Alembic tmp table: %s", table)
            cur.execute(f'DROP TABLE IF EXISTS "{table}"')
        conn.commit()
    finally:
        conn.close()


def _noop_cleanup() -> None:
    """非 SQLite 方言无需清理。"""


# 方言 -> 迁移失败时的清理策略
_MIGRATION_CLEANUP: dict[str, Callable[[], None]] = {
    "sqlite": _cleanup_sqlite_tmp_tables,
}


def _resolve_dialect(url: str) -> str:
    prefixes = {"sqlite": "sqlite", "postgresql": "postgresql", "postgres": "postgresql"}
    return next((key for p, key in prefixes.items() if url.startswith(p)), "")


def _execute_migrations() -> None:
    """运行 Alembic 升级；失败时按方言执行清理后重试一次。"""
    try:
        _run_alembic_upgrade()
        logger.info("Database migrations completed.")
    except subprocess.CalledProcessError as exc:
        logger.error("Migration failed: %s", exc)
        cleanup = _MIGRATION_CLEANUP.get(_resolve_dialect(settings.DATABASE_URL), _noop_cleanup)
        cleanup()
        _run_alembic_upgrade()
        logger.info("Database migrations completed after cleanup.")


# 迁移开关 -> 执行策略（映射表替代 if）
_MIGRATION_STRATEGY: dict[bool, Callable[[], None]] = {
    True: _execute_migrations,
    False: lambda: logger.info("Skipping database migrations (RUN_MIGRATIONS=False)."),
}


# ---------------------------------------------------------------------------
# DB connectivity probe with retry
# ---------------------------------------------------------------------------

async def _probe_database() -> None:
    async with engine.begin():
        pass


async def _wait_for_database() -> None:
    last_err: Exception | None = None
    for attempt in range(1, _MAX_DB_RETRIES + 1):
        try:
            await _probe_database()
            return
        except Exception as exc:  # noqa: BLE001 — 启动阶段兜底
            last_err = exc
            logger.warning(
                "Database connection failed (%d/%d), retrying in %ds...",
                attempt,
                _MAX_DB_RETRIES,
                _DB_RETRY_DELAY_SECONDS,
            )
            await asyncio.sleep(_DB_RETRY_DELAY_SECONDS)
    logger.error("Database unreachable after %d attempts: %s", _MAX_DB_RETRIES, last_err)
    raise last_err if last_err else RuntimeError("Database unreachable")


# ---------------------------------------------------------------------------
# Auxiliary init steps
# ---------------------------------------------------------------------------

async def _load_narrative_engine() -> None:
    from agents import narrative_engine

    try:
        await narrative_engine.load_config_from_db()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to load LLM config on startup: %s", exc)


def _ensure_media_dir() -> None:
    media = Path(settings.STORAGE_LOCAL_BASE_DIR) if settings.STORAGE_LOCAL_BASE_DIR else _BACKEND_DIR / "media"
    media.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Background tasks (cancelled on shutdown)
# ---------------------------------------------------------------------------

_background_tasks: list[asyncio.Task] = []


def _spawn_background_tasks() -> None:
    """启动需要跟随应用生命周期的后台任务。"""
    from services.agent_executor import start_invalidation_listener
    from realtime.dispatcher import start_user_event_listener

    factories = {
        "cache_invalidation": start_invalidation_listener,
        "user_event_listener": start_user_event_listener,
    }
    for name, fn in factories.items():
        task = asyncio.create_task(fn(), name=name)
        _background_tasks.append(task)
        logger.info("Spawned background task: %s", name)


async def _shutdown_background_tasks() -> None:
    for task in _background_tasks:
        task.cancel()
    for task in _background_tasks:
        try:
            await task
        except (asyncio.CancelledError, Exception) as exc:  # noqa: BLE001
            logger.debug("Background task %s exited: %s", task.get_name(), exc)
    _background_tasks.clear()


async def _close_external_clients() -> None:
    from cache.client import close_redis

    closers = {"redis": close_redis}
    for name, fn in closers.items():
        try:
            await fn()
        except Exception as exc:  # noqa: BLE001
            logger.warning("close %s error: %s", name, exc)


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------

async def run_startup() -> None:
    """Execute the full startup sequence."""
    await _wait_for_database()
    _MIGRATION_STRATEGY[bool(settings.RUN_MIGRATIONS)]()
    await _load_narrative_engine()
    _ensure_media_dir()
    _spawn_background_tasks()


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001 — FastAPI 约定签名
    await run_startup()
    try:
        yield
    finally:
        await _shutdown_background_tasks()
        await _close_external_clients()


__all__ = ["lifespan", "run_startup"]
