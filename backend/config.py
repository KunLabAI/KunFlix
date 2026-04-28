import os
from pydantic_settings import BaseSettings

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "kunflix.db")


class Settings(BaseSettings):
    PROJECT_NAME: str = "KunFlix"
    VERSION: str = "1.0.0"

    # ---------------------------------------------------------------
    # Database
    # ---------------------------------------------------------------
    # 默认 SQLite 本地文件，生产通过 .env 覆盖为 PostgreSQL：
    #   DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/kunflix
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DB_PATH}"

    # 连接池参数（PostgreSQL 生产建议：DB_POOL_SIZE=20, DB_MAX_OVERFLOW=30）
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_RECYCLE: int = 3600       # 秒；防长连接被中间件/DB 主动断开
    DB_POOL_PRE_PING: bool = True

    # ---------------------------------------------------------------
    # Cache backend —— 当前仅实现 memory；redis 占位保留，部署 Redis 后切换
    # ---------------------------------------------------------------
    CACHE_BACKEND: str = "memory"            # memory | redis
    REDIS_URL: str = "redis://localhost:6379/0"
    AGENT_CACHE_MAX_SIZE: int = 256
    AGENT_CACHE_TTL_SECONDS: int = 600
    MODEL_CACHE_MAX_SIZE: int = 64
    MODEL_CACHE_TTL_SECONDS: int = 1800

    # ---------------------------------------------------------------
    # Storage backend —— 当前仅实现 local；s3 占位保留
    # ---------------------------------------------------------------
    STORAGE_BACKEND: str = "local"           # local | s3
    STORAGE_LOCAL_BASE_DIR: str = ""         # 空表示使用默认 backend/media 目录

    # ---------------------------------------------------------------
    # Security —— API Key 字段级加密（Fernet）
    # ENCRYPTION_KEY 为空时保持明文（向后兼容存量数据）
    # 生成方式： python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # ---------------------------------------------------------------
    ENCRYPTION_KEY: str = ""

    # ---------------------------------------------------------------
    # AI Models (仅保留实际被代码引用的字段)
    # ---------------------------------------------------------------
    OPENAI_API_KEY: str = ""
    STORY_GENERATION_MODEL: str = "gpt-4-turbo"  # agents.py fallback 使用

    # ---------------------------------------------------------------
    # JWT Auth
    # ---------------------------------------------------------------
    JWT_SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ---------------------------------------------------------------
    # CORS
    # ---------------------------------------------------------------
    CORS_ALLOW_ORIGINS: str = (
        "http://localhost:3666,http://127.0.0.1:3666,"
        "http://localhost:3888,http://127.0.0.1:3888"
    )

    # ---------------------------------------------------------------
    # System
    # ---------------------------------------------------------------
    RUN_MIGRATIONS: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ALLOW_ORIGINS comma-separated string into a clean list."""
        return [o.strip() for o in self.CORS_ALLOW_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()
