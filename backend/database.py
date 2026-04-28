"""SQLAlchemy async engine + session factory.

Design:
- 使用方言映射表避免 SQLite/PostgreSQL 的 if-else 分支
- 连接池参数全部来自 Settings，便于生产通过 .env 覆盖
- SQLite 专属 PRAGMA 通过事件监听器安装，仅在方言为 sqlite 时生效
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event

from config import settings


# ---------------------------------------------------------------------------
# Dialect-specific connection args (映射表驱动，避免 if-else)
# ---------------------------------------------------------------------------
_DIALECT_CONNECT_ARGS: dict[str, dict] = {
    "sqlite": {"check_same_thread": False, "timeout": 30},
    "postgresql": {"server_settings": {"application_name": "kunflix"}},
}


def _resolve_dialect(url: str) -> str:
    """Pick the dialect key from the URL prefix; unknown -> empty string."""
    prefixes = {"sqlite": "sqlite", "postgresql": "postgresql", "postgres": "postgresql"}
    for prefix, key in prefixes.items():
        if url.startswith(prefix):
            return key
    return ""


def _build_engine_kwargs(url: str) -> dict:
    """Build create_async_engine kwargs including pool settings + dialect connect_args."""
    dialect = _resolve_dialect(url)
    return {
        "echo": False,
        "pool_pre_ping": settings.DB_POOL_PRE_PING,
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_recycle": settings.DB_POOL_RECYCLE,
        "connect_args": _DIALECT_CONNECT_ARGS.get(dialect, {}),
    }


engine = create_async_engine(settings.DATABASE_URL, **_build_engine_kwargs(settings.DATABASE_URL))


# ---------------------------------------------------------------------------
# SQLite PRAGMA installer: WAL mode + busy_timeout + synchronous=NORMAL
# 仅在 SQLite 方言下注册，PostgreSQL 场景自动跳过
# ---------------------------------------------------------------------------
_SQLITE_PRAGMAS: tuple[str, ...] = (
    "PRAGMA journal_mode=WAL",
    "PRAGMA busy_timeout=30000",
    "PRAGMA synchronous=NORMAL",
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


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
