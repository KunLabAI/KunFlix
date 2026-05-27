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


def _alembic_stamp_head() -> None:
    subprocess.check_call(
        [sys.executable, "-m", "alembic", "stamp", "head"],
        cwd=str(_BACKEND_DIR),
    )


# 多 worker 并发启动跨进程互斥锁的 64-bit key（PG advisory lock 要求 bigint）
# 'KUNFXLCK' 的 ASCII 拼拼，固定不变以免与其他应用冲突
_BOOTSTRAP_LOCK_KEY = 0x4B554E46584C434B


async def _try_fast_bootstrap() -> bool:
    """空库快通道：用 Base.metadata.create_all() 直建终态 schema，再
    alembic stamp head 标记已到最新版本，跳过整条针对 SQLite
    手写的迁移脚本（PRAGMA、sqlite_master、类型混用等不兼容 PG）。

    返回 True 表示已完成 fast bootstrap；非空库返回 False，由调用方
    走正常 upgrade head。

    多 worker 互斥：uvicorn --workers >1 时每个子进程都跑 lifespan，并发
    create_all() 在 PG 上会撞 pg_type_typname_nsp_index 唯一约束。这里
    用 advisory_xact_lock（事务级、自动释放）跨进程串行，锁内再 double-
    check is_fresh，确保只有第一个进入临界区的 worker 真正建表。
    SQLite 单文件无该并发问题，方言映射表自动跳过。
    """
    from sqlalchemy import inspect, text
    from database import Base, engine
    import models  # noqa: F401 — 触发 Base.metadata 注册所有表

    _lock_sql_by_dialect = {
        "postgresql": text("SELECT pg_advisory_xact_lock(:key)"),
    }
    lock_sql = _lock_sql_by_dialect.get(engine.dialect.name)

    async with engine.begin() as conn:
        # 先拿锁，让后到的 worker 阻塞在这里直到第一个 worker 提交事务
        lock_sql is not None and await conn.execute(lock_sql, {"key": _BOOTSTRAP_LOCK_KEY})
        # 锁内 inspect：double-check 让后入锁的 worker 看到表已存在
        tables = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).get_table_names()
        )
        is_fresh = 'alembic_version' not in tables and 'users' not in tables
        _fresh_action = {
            True: lambda: conn.run_sync(Base.metadata.create_all),
        }
        awaitable = _fresh_action.get(is_fresh, lambda: None)()
        awaitable and await awaitable
        # stamp 必须保留在 advisory lock 内：否则 worker B 在 stamp 完成前拿到锁后
        # 会看到 alembic_version 为空，走到 _execute_migrations_upgrade 全量重放撞已存在的表
        is_fresh and _alembic_stamp_head()
    is_fresh and logger.info(
        "Fresh database detected — ran create_all + alembic stamp head, skipping migration chain."
    )
    return is_fresh


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


def _execute_migrations_upgrade() -> None:
    _run_alembic_upgrade()
    logger.info("Database migrations completed.")


async def _execute_migrations() -> None:
    """迁移调度：空库走 fast bootstrap；非空库走 alembic upgrade head；
    失败时按方言清理后重试一次。"""
    try:
        did_fast = await _try_fast_bootstrap()
        _post_bootstrap = {
            True: lambda: None,
            False: _execute_migrations_upgrade,
        }
        _post_bootstrap[did_fast]()
    except subprocess.CalledProcessError as exc:
        logger.error("Migration failed: %s", exc)
        cleanup = _MIGRATION_CLEANUP.get(_resolve_dialect(settings.DATABASE_URL), _noop_cleanup)
        cleanup()
        _run_alembic_upgrade()
        logger.info("Database migrations completed after cleanup.")


async def _skip_migrations() -> None:
    logger.info("Skipping database migrations (RUN_MIGRATIONS=False).")


# 迁移开关 -> 执行策略（映射表替代 if，两边统一为 async）
_MIGRATION_STRATEGY: dict[bool, Callable[[], "asyncio.Future | asyncio.coroutines.Coroutine"]] = {
    True: _execute_migrations,
    False: _skip_migrations,
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

_MIN_JWT_SECRET_LEN = 32
# 历史占位字符串，迁移期间的及时提示；不再写入 config.py 避免 Secret Scanning 正则命中
_LEGACY_JWT_PLACEHOLDERS = frozenset({
    "change-me-in-production-use-openssl-rand-hex-32",
    "CHANGE_ME_OPENSSL_RAND_HEX_32",
})


def _is_production_like() -> bool:
    """根据运行环境特征判断是否为生产类似环境（映射表无 if-else）。"""
    url = (settings.DATABASE_URL or "").lower()
    signals = {
        settings.RUN_MIGRATIONS: True,
        url.startswith("postgresql"): True,
        url.startswith("postgres"): True,
        os.environ.get("ENVIRONMENT", "").lower() == "production": True,
    }
    return True in signals


def _validate_production_secrets() -> None:
    """JWT_SECRET_KEY 硬化校验：
    - 生产类似环境：空 / 占位符 / 长度 < 32 均 fail-fast
    - 本地开发：空值时生成进程内随机密钥并 warn，保证零配置可启动
    """
    current = (settings.JWT_SECRET_KEY or "").strip()
    prod = _is_production_like()

    is_missing = not current
    is_placeholder = current in _LEGACY_JWT_PLACEHOLDERS
    is_too_short = bool(current) and len(current) < _MIN_JWT_SECRET_LEN

    fail_reasons = {
        is_missing: "JWT_SECRET_KEY is empty",
        is_placeholder: "JWT_SECRET_KEY is still the default placeholder",
        is_too_short: f"JWT_SECRET_KEY shorter than {_MIN_JWT_SECRET_LEN} chars",
    }
    active_reason = next((msg for bad, msg in fail_reasons.items() if bad), "")

    # 生产无条件拒绝
    if prod and active_reason:
        raise RuntimeError(
            f"{active_reason} in a production-like environment. "
            "Generate one via `python -c \"import secrets; print(secrets.token_hex(32))\"` "
            "and set JWT_SECRET_KEY in .env.prod before starting."
        )

    # 开发兼容：空值 / 占位符 → 进程内随机密钥（重启失效，防经典错误）
    needs_patch = active_reason and not prod
    if needs_patch:
        import secrets
        settings.JWT_SECRET_KEY = secrets.token_hex(32)
        logger.warning(
            "%s; generated an ephemeral in-memory JWT_SECRET_KEY for local dev. "
            "Tokens will be invalidated on restart \u2014 set JWT_SECRET_KEY in .env for persistent sessions.",
            active_reason,
        )


async def run_startup() -> None:
    """Execute the full startup sequence."""
    _validate_production_secrets()
    await _wait_for_database()
    await _MIGRATION_STRATEGY[bool(settings.RUN_MIGRATIONS)]()
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
