from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from config import settings
import asyncio

# Create Async Engine
# echo=False: 关闭 SQL 日志输出，减少终端干扰
engine = create_async_engine(
    settings.DATABASE_URL, 
    echo=False,
    pool_pre_ping=True,  # 自动重连
    pool_size=10,        # 连接池大小
    max_overflow=20,     # 最大溢出连接数
    connect_args={
        "check_same_thread": False,
        "timeout": 30,  # 连接超时30秒
    } if settings.DATABASE_URL.startswith("sqlite") else {}
)

# SQLite 优化配置：启用 WAL 模式 + 增加超时时间
# WAL 模式允许读写并发，显著减少 "database is locked" 错误
if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, connection_record):
        """设置 SQLite PRAGMA 优化参数"""
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")  # 30秒超时
        cursor.execute("PRAGMA synchronous=NORMAL")  # 平衡性能与安全
        cursor.close()

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
