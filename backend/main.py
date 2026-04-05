import sys
import asyncio
import logging
import codecs

# Fix for asyncpg on Windows
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    # 修复Windows终端UTF-8编码问题（仅在buffer属性存在时）
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'ignore')
    if hasattr(sys.stderr, 'buffer'):
        sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'ignore')

# 配置日志 - 精细化控制
logging.basicConfig(
    level=logging.INFO,
    format='[%(name)s] %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

# 关闭 SQLAlchemy 日志
logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)
logging.getLogger('sqlalchemy.pool').setLevel(logging.WARNING)

# 关闭 uvicorn access 日志（保留 error 日志）
logging.getLogger('uvicorn.access').setLevel(logging.WARNING)

# 保留应用日志
logger = logging.getLogger(__name__)

from fastapi import FastAPI, WebSocket, BackgroundTasks
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import os
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, engine, Base, AsyncSessionLocal
from models import User
from routers import llm_config, admin as admin_router, agents, chats, orchestrate, media, subscriptions, admin_auth, prompt_templates, videos, theaters, skills_api, admin_debug, admin_tools
from routers import auth as auth_router
import uvicorn
from agents import narrative_engine
from fastapi.middleware.cors import CORSMiddleware

from config import settings, DB_PATH

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 数据库连接重试逻辑
    max_retries = 5
    for i in range(max_retries):
        try:
            # Check connection
            async with engine.begin() as conn:
                pass
            
            # Run Alembic migrations (if enabled)
            if settings.RUN_MIGRATIONS:
                print("Running database migrations...")
                import subprocess
                try:
                    subprocess.check_call([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=os.path.dirname(os.path.abspath(__file__)))
                    print("Database migrations completed.")
                except subprocess.CalledProcessError as e:
                    print(f"Migration failed: {e}")
                    print("Attempting to fix residual temp tables...")
                    # 尝试清理残留表后重试
                    try:
                        import sqlite3
                        conn = sqlite3.connect(DB_PATH)
                        cur = conn.cursor()
                        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_alembic_tmp_%'")
                        temp_tables = [t[0] for t in cur.fetchall()]
                        for table in temp_tables:
                            print(f"  Dropping residual table: {table}")
                            cur.execute(f'DROP TABLE IF EXISTS "{table}"')
                        conn.commit()
                        conn.close()
                        # 重试迁移
                        subprocess.check_call([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=os.path.dirname(os.path.abspath(__file__)))
                        print("Database migrations completed after cleanup.")
                    except Exception as cleanup_error:
                        print(f"Migration failed even after cleanup: {cleanup_error}")
                        raise
            else:
                print("Skipping database migrations (RUN_MIGRATIONS=False).")
            
            break
        except Exception as e:
            if i == max_retries - 1:
                print(f"Failed to connect to database or run migrations after {max_retries} attempts: {e}")
            print(f"Database connection failed, retrying in 2 seconds... ({i+1}/{max_retries})")
            import asyncio
            await asyncio.sleep(2)
            
    # Try to initialize narrative engine from DB
    try:
        await narrative_engine.load_config_from_db()
    except Exception as e:
        print(f"Failed to load LLM config on startup: {e}")
    
    # 确保媒体目录存在
    from pathlib import Path
    Path(__file__).resolve().parent.joinpath("media").mkdir(exist_ok=True)
    
    yield

app = FastAPI(
    title="Infinite Narrative Theater",
    lifespan=lifespan,
)

# DEBUG: Log Authorization header for /api/theaters requests
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

class DebugAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        path = request.url.path
        auth_header = request.headers.get("authorization", "<MISSING>")
        origin = request.headers.get("origin", "<no-origin>")
        logger.info(f"[DEBUG-AUTH] {request.method} {path} | Origin: {origin} | Auth: {auth_header[:40]}...")
        response = await call_next(request)
        return response

app.add_middleware(DebugAuthMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3666",
        "http://127.0.0.1:3666",
        "http://localhost:3888",
        "http://127.0.0.1:3888",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(auth_router.router)
app.include_router(admin_auth.router)
app.include_router(llm_config.router)
app.include_router(admin_router.router)
app.include_router(agents.router)
app.include_router(chats.router)
app.include_router(orchestrate.router)
app.include_router(media.router)
app.include_router(subscriptions.router)
app.include_router(prompt_templates.router)
app.include_router(videos.router)
app.include_router(theaters.router)
app.include_router(skills_api.router)
app.include_router(admin_debug.router)
app.include_router(admin_tools.router)


@app.get("/")
async def root():
    return {"message": "Welcome to the Infinite Narrative Theater API"}


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Message received: {data}")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await websocket.close()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
