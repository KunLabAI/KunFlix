from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import settings
import asyncio

# Create Async Engine
# echo=True means it will log all SQL statements (good for debugging)
engine = create_async_engine(
    settings.DATABASE_URL, 
    echo=True,
    pool_pre_ping=True,  # 自动重连
    pool_size=10,        # 连接池大小
    max_overflow=20      # 最大溢出连接数
)

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
