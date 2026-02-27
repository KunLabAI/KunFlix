import sys
import asyncio
import logging
import codecs

# Fix for asyncpg on Windows
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    # 修复Windows终端UTF-8编码问题
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'ignore')
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
from services import GameService
from models import User, StoryChapter
from routers import llm_config, admin as admin_router, agents, chats, orchestrate, media
from routers import auth as auth_router
import uvicorn
from agents import narrative_engine
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 数据库连接重试逻辑
    max_retries = 5
    for i in range(max_retries):
        try:
            # Check connection
            async with engine.begin() as conn:
                pass
            
            # Run Alembic migrations
            print("Running database migrations...")
            import subprocess
            subprocess.check_call([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=os.path.dirname(os.path.abspath(__file__)))
            print("Database migrations completed.")
            
            break
        except Exception as e:
            if i == max_retries - 1:
                print(f"Failed to connect to database or run migrations after {max_retries} attempts: {e}")
            print(f"Database connection/migration failed, retrying in 2 seconds... ({i+1}/{max_retries})")
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

app = FastAPI(title="Infinite Narrative Game", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(auth_router.router)
app.include_router(llm_config.router)
app.include_router(admin_router.router)
app.include_router(agents.router)
app.include_router(chats.router)
app.include_router(orchestrate.router)
app.include_router(media.router)


@app.get("/")
async def root():
    return {"message": "Welcome to the Infinite Narrative Game API"}


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
