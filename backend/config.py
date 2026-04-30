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
    # 默认留空：开发环境零依赖（内存降级）；生产环境设置为 redis://host:6379/0 即激活
    # 缓存/Pub-Sub/SSE Stream/JWT 黑名单等跨实例能力。
    REDIS_URL: str = ""
    AGENT_CACHE_MAX_SIZE: int = 256
    AGENT_CACHE_TTL_SECONDS: int = 600
    MODEL_CACHE_MAX_SIZE: int = 64
    MODEL_CACHE_TTL_SECONDS: int = 1800

    # ---------------------------------------------------------------
    # Storage backend —— local | s3（同时兼容 MinIO/R2/OSS）
    # ---------------------------------------------------------------
    STORAGE_BACKEND: str = "local"           # local | s3
    STORAGE_LOCAL_BASE_DIR: str = ""         # 空表示使用默认 backend/media 目录
    # S3 / MinIO / R2 / OSS 参数（仅 STORAGE_BACKEND=s3 时生效）
    STORAGE_S3_ENDPOINT: str = ""            # MinIO 填 http://localhost:9000；AWS 留空
    STORAGE_S3_BUCKET: str = ""
    STORAGE_S3_REGION: str = "us-east-1"
    STORAGE_S3_ACCESS_KEY: str = ""
    STORAGE_S3_SECRET_KEY: str = ""
    STORAGE_S3_PUBLIC_BASE_URL: str = ""     # CDN/公网访问前缀，留空则返回预签名 GET URL
    STORAGE_S3_USE_PATH_STYLE: bool = True   # MinIO 需 True；AWS S3 可置 False
    STORAGE_PRESIGN_EXPIRES: int = 3600      # 预签名 URL 过期秒数

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
    # Task queue (arq)
    # ---------------------------------------------------------------
    QUEUE_BACKEND: str = "memory"            # memory | arq
    QUEUE_REDIS_URL: str = ""                # 空则复用 REDIS_URL

    # ---------------------------------------------------------------
    # Rate limit & circuit breaker
    # ---------------------------------------------------------------
    RATE_LIMIT_ENABLED: bool = False
    RATE_LIMIT_DEFAULT: str = "100/minute"   # slowapi 全局兑底
    # 高频端点细粒度限流（ratelimit.limiter.ENDPOINT_LIMITS 默认兑底）
    RATE_LIMIT_CHAT_SEND: str = "60/minute"
    RATE_LIMIT_VIDEO_CREATE: str = "20/minute"
    RATE_LIMIT_IMAGE_GENERATE: str = "20/minute"
    RATE_LIMIT_MUSIC_CREATE: str = "20/minute"
    RATE_LIMIT_ORCHESTRATE: str = "30/minute"
    CIRCUIT_BREAKER_ENABLED: bool = False
    CIRCUIT_BREAKER_THRESHOLD: int = 5       # 连续失败阈值
    CIRCUIT_BREAKER_TTL: int = 30            # half-open 检测间隔秒

    # ---------------------------------------------------------------
    # Audit log
    # ---------------------------------------------------------------
    AUDIT_ENABLED: bool = True

    # ---------------------------------------------------------------
    # SSE resumable stream (Redis Stream)
    # ---------------------------------------------------------------
    # 未配置 REDIS_URL 时自动降级为 no-op，不影响现有 SSE 输出
    SSE_STREAM_MAXLEN: int = 1000            # XADD MAXLEN ~ 上限
    SSE_STREAM_TTL_SEC: int = 600            # Stream key 空闲过期秒
    SSE_RESUME_MAX_COUNT: int = 500          # /api/sse/resume 单次最多回放

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
