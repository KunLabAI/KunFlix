from fastapi import FastAPI, WebSocket, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db, engine, Base, AsyncSessionLocal
from services import GameService
from models import Player, StoryChapter
import uvicorn

app = FastAPI(title="Infinite Narrative Game")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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
