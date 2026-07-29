"""SQLAlchemy async engine + session factory.

Design:
- 使用方言映射表避免 SQLite/PostgreSQL 的 if-else 分支
- 连接池参数全部来自 Settings，便于生产通过 .env 覆盖
- SQLite 专属 PRAGMA 通过事件监听器安装，仅在方言为 sqlite 时生效
- SQLite 连接池调优为 5+10，兼顾多智能体并发与其他 API 请求，避免池耗尽卡死
- SQLite 全局写锁：多智能体并发 commit 时在应用层排队，消除 database is locked 错误
"""
import asyncio

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event

from config import settings


# ---------------------------------------------------------------------------
# Dialect-specific connection args (映射表驱动，避免 if-else)
# ---------------------------------------------------------------------------
_DIALECT_CONNECT_ARGS: dict[str, dict] = {
    "sqlite": {"check_same_thread": False, "timeout": 60},
    "postgresql": {"server_settings": {"application_name": "kunflix"}},
}


def _resolve_dialect(url: str) -> str:
    """Pick the dialect key from the URL prefix; unknown -> empty string."""
    prefixes = {"sqlite": "sqlite", "postgresql": "postgresql", "postgres": "postgresql"}
    for prefix, key in prefixes.items():
        if url.startswith(prefix):
            return key
    return ""


# ---------------------------------------------------------------------------
# SQLite 连接池参数覆盖
# SQLite WAL 模式下读写可并行，写写排队由 busy_timeout 保证等待而非报错。
# 池大小需兑顾多智能体并发子任务 + 其他 API 请求的连接需求，
# 太小会导致池耗尽（全服务卡死），太大会加剧写排队压力。
# pool_size=5, max_overflow=10（总计最多 15 连接）是本地开发的平衡点。
# ---------------------------------------------------------------------------
_DIALECT_POOL_OVERRIDES: dict[str, dict] = {
    "sqlite": {"pool_size": 20, "max_overflow": 20},
}


def _build_engine_kwargs(url: str) -> dict:
    """Build create_async_engine kwargs including pool settings + dialect connect_args."""
    dialect = _resolve_dialect(url)
    pool_overrides = _DIALECT_POOL_OVERRIDES.get(dialect, {})
    return {
        "echo": False,
        "pool_pre_ping": settings.DB_POOL_PRE_PING,
        "pool_size": pool_overrides.get("pool_size", settings.DB_POOL_SIZE),
        "max_overflow": pool_overrides.get("max_overflow", settings.DB_MAX_OVERFLOW),
        "pool_recycle": settings.DB_POOL_RECYCLE,
        "connect_args": _DIALECT_CONNECT_ARGS.get(dialect, {}),
    }


engine = create_async_engine(settings.DATABASE_URL, **_build_engine_kwargs(settings.DATABASE_URL))


# ---------------------------------------------------------------------------
# SQLite PRAGMA installer: WAL mode + busy_timeout + performance tuning
# 仅在 SQLite 方言下注册，PostgreSQL 场景自动跳过
# ---------------------------------------------------------------------------
_SQLITE_PRAGMAS: tuple[str, ...] = (
    "PRAGMA journal_mode=WAL",
    "PRAGMA busy_timeout=60000",
    "PRAGMA synchronous=NORMAL",
    "PRAGMA wal_autocheckpoint=1000",
    "PRAGMA cache_size=-32000",
)


def _apply_sqlite_pragmas(dbapi_conn, _connection_record) -> None:
    cursor = dbapi_conn.cursor()
    for pragma in _SQLITE_PRAGMAS:
        cursor.execute(pragma)
    cursor.close()


def _install_sqlite_pragmas(target_engine) -> None:
    event.listen(target_engine.sync_engine, "connect", _apply_sqlite_pragmas)


_PRAGMA_INSTALLERS = {"sqlite": _install_sqlite_pragmas}
_installer = _PRAGMA_INSTALLERS.get(_resolve_dialect(settings.DATABASE_URL))
_installer and _installer(engine)


AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# SQLite global write lock — serializes concurrent commits at the app level
# ---------------------------------------------------------------------------
# SQLite 仅支持单写者；多智能体并发场景下多个 asyncio task 同时 commit 会触发
# "database is locked"。此锁将写排队从 SQLite 层上移到 asyncio 层，
# 确保同一时刻只有一个 task 执行 commit，彻底消除锁竞争。
# PostgreSQL 不需要此锁（原生支持 MVCC 并发写）。
# ---------------------------------------------------------------------------
_sqlite_write_lock: asyncio.Lock | None = (
    asyncio.Lock() if _resolve_dialect(settings.DATABASE_URL) == "sqlite" else None
)

_SAFE_COMMIT_MAX_RETRIES = 3
_SAFE_COMMIT_RETRY_DELAY = 0.5  # seconds


async def safe_commit(session: AsyncSession) -> None:
    """Commit with global write serialization for SQLite.

    多智能体并发时，所有写入 commit 通过此函数排队执行，
    避免 SQLite 层面 database is locked 错误。
    内置重试：即使获取锁后仍出现瞬态锁冲突（如外部进程），自动退避重试。
    PostgreSQL 场景直接透传 commit，无额外开销。
    """
    for attempt in range(_SAFE_COMMIT_MAX_RETRIES):
        try:
            if _sqlite_write_lock:
                async with _sqlite_write_lock:
                    await session.commit()
            else:
                await session.commit()
            return
        except Exception as exc:
            is_locked = "database is locked" in str(exc)
            remaining = _SAFE_COMMIT_MAX_RETRIES - attempt - 1
            if not is_locked or remaining <= 0:
                raise
            await asyncio.sleep(_SAFE_COMMIT_RETRY_DELAY * (2 ** attempt))


async def safe_flush(session: AsyncSession) -> None:
    """Flush with global write serialization for SQLite.

    与 safe_commit 同理，flush 也会触发 SQL 写操作，需要序列化。
    """
    for attempt in range(_SAFE_COMMIT_MAX_RETRIES):
        try:
            if _sqlite_write_lock:
                async with _sqlite_write_lock:
                    await session.flush()
            else:
                await session.flush()
            return
        except Exception as exc:
            is_locked = "database is locked" in str(exc)
            remaining = _SAFE_COMMIT_MAX_RETRIES - attempt - 1
            if not is_locked or remaining <= 0:
                raise
            await asyncio.sleep(_SAFE_COMMIT_RETRY_DELAY * (2 ** attempt))


async def get_db():
    session = AsyncSessionLocal()
    try:
        yield session
    finally:
        # aiosqlite 连接可能已断开（pool recycle / idle timeout），
        # session.close() 内部 rollback 失败时不应再触发 500 崩溃。
        try:
            await session.close()
        except Exception:  # noqa: BLE001
            pass
