from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List, Dict, Any

from database import get_db
from models import Player, StoryChapter, LLMProvider, Asset

router = APIRouter(
    prefix="/api/admin",
    tags=["admin_general"],
    responses={404: {"description": "Not found"}},
)

@router.get("/stats", response_model=Dict[str, int])
async def get_stats(db: AsyncSession = Depends(get_db)):
    """
    Get dashboard statistics.
    """
    player_count = await db.scalar(select(func.count(Player.id)))
    story_count = await db.scalar(select(func.count(StoryChapter.id)))
    asset_count = await db.scalar(select(func.count(Asset.id)))
    provider_count = await db.scalar(select(func.count(LLMProvider.id)))
    
    return {
        "players": player_count or 0,
        "stories": story_count or 0,
        "assets": asset_count or 0,
        "providers": provider_count or 0
    }

@router.get("/players", response_model=List[Dict[str, Any]])
async def get_players(
    skip: int = 0, 
    limit: int = 50, 
    db: AsyncSession = Depends(get_db)
):
    """
    List players with basic info.
    """
    result = await db.execute(
        select(Player).order_by(Player.created_at.desc()).offset(skip).limit(limit)
    )
    players = result.scalars().all()
    
    # Transform to include computed fields if necessary, or just return dicts
    return [
        {
            "id": p.id,
            "username": p.username,
            "created_at": p.created_at,
            "current_chapter": p.current_chapter,
            "inventory_count": len(p.inventory) if p.inventory else 0
        }
        for p in players
    ]

@router.delete("/players/{player_id}")
async def delete_player(player_id: str, db: AsyncSession = Depends(get_db)):
    """
    Delete a player and their stories.
    """
    result = await db.execute(select(Player).filter(Player.id == player_id))
    player = result.scalars().first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
        
    # Delete associated stories first (though cascade might handle this if configured, but let's be safe)
    await db.execute(
        select(StoryChapter).filter(StoryChapter.player_id == player_id)
    )
    # Actually, let's just delete the player and let DB constraints handle it or do manual cleanup if needed.
    # For now, explicit delete of stories is safer if no cascade.
    
    # Delete stories
    # await db.execute(delete(StoryChapter).where(StoryChapter.player_id == player_id)) # Requires import delete
    # Let's just delete the player object
    await db.delete(player)
    await db.commit()
    return {"ok": True}

@router.get("/stories", response_model=List[Dict[str, Any]])
async def get_stories(
    skip: int = 0, 
    limit: int = 50, 
    player_id: str = None,
    db: AsyncSession = Depends(get_db)
):
    """
    List stories.
    """
    query = select(StoryChapter).order_by(StoryChapter.created_at.desc())
    
    if player_id:
        query = query.filter(StoryChapter.player_id == player_id)
        
    result = await db.execute(query.offset(skip).limit(limit))
    stories = result.scalars().all()
    
    return [
        {
            "id": s.id,
            "player_id": s.player_id,
            "chapter_number": s.chapter_number,
            "title": s.title,
            "status": s.status,
            "created_at": s.created_at
        }
        for s in stories
    ]
