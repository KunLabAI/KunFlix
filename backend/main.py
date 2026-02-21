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

from fastapi import FastAPI, WebSocket, Depends, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import os
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, engine, Base, AsyncSessionLocal
from services import GameService
from models import Player, StoryChapter
from routers import llm_config, admin as admin_router, agents, chats
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
                # Instead of create_all, we could run migrations here or just check connection
                # For now, let's just ensure we can connect.
                # Migrations should be run separately or we can integrate them here.
                # await conn.run_sync(Base.metadata.create_all) # Disabled in favor of Alembic
                pass
            
            # Run Alembic migrations
            print("Running database migrations...")
            import subprocess
            # Run alembic upgrade head
            # We use subprocess to avoid messing with async loop and alembic context issues
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
app.include_router(llm_config.router)
app.include_router(admin_router.router)
app.include_router(agents.router)
app.include_router(chats.router)

# Mount Admin Static Files
# base_dir = os.path.dirname(os.path.abspath(__file__))
# admin_dir = os.path.join(base_dir, "admin")
# app.mount("/admin", StaticFiles(directory=admin_dir, html=True), name="admin")

# @app.on_event("startup")
# async def startup():
#     # 数据库连接重试逻辑
#     max_retries = 5
#     for i in range(max_retries):
#         try:
#             async with engine.begin() as conn:
#                 await conn.run_sync(Base.metadata.create_all)
#             break
#         except Exception as e:
#             if i == max_retries - 1:
#                 print(f"Failed to connect to database after {max_retries} attempts: {e}")
#             print(f"Database connection failed, retrying in 2 seconds... ({i+1}/{max_retries})")
#             import asyncio
#             await asyncio.sleep(2)
#             
#     # Try to initialize narrative engine from DB
#     try:
#         await narrative_engine.load_config_from_db()
#     except Exception as e:
#         print(f"Failed to load LLM config on startup: {e}")



@app.get("/")
async def root():
    return {"message": "Welcome to the Infinite Narrative Game API"}


from pydantic import BaseModel

class PlayerCreate(BaseModel):
    username: str

@app.post("/players/")
async def create_player(player: PlayerCreate, db: AsyncSession = Depends(get_db)):
    game_service = GameService(db)
    try:
        new_player = await game_service.create_player(player.username)
        return {"id": new_player.id, "username": new_player.username}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/story/init/{player_id}")
async def start_story(player_id: int, background_tasks: BackgroundTasks):
    async def run_story_init(pid: int):
        async with AsyncSessionLocal() as session:
            game_service = GameService(session)
            await game_service.init_world(pid)

    background_tasks.add_task(run_story_init, player_id)
    return {"message": "Story generation started. Check WebSocket for updates."}

@app.websocket("/ws/{player_id}")
async def websocket_endpoint(websocket: WebSocket, player_id: int):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            # Handle player input here
            # game_service.process_player_choice(player_id, data)
            await websocket.send_text(f"Message received: {data}")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await websocket.close()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
