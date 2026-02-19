from agents import narrative_engine
from models import StoryChapter, Asset
from database import AsyncSessionLocal
from sqlalchemy import select
import asyncio

async def pre_generate_next_chapter(player_id: int, current_chapter_num: int):
    async with AsyncSessionLocal() as session:
        # Check if next chapter already exists
        result = await session.execute(
            select(StoryChapter).where(
                StoryChapter.player_id == player_id,
                StoryChapter.chapter_number == current_chapter_num + 1
            )
        )
        existing_chapter = result.scalar_one_or_none()
        
        if existing_chapter:
            if existing_chapter.status == "ready":
                return
            # If generating or pending, handle logic
        
        # Get context from previous chapter
        prev_result = await session.execute(
            select(StoryChapter).where(
                StoryChapter.player_id == player_id,
                StoryChapter.chapter_number == current_chapter_num
            )
        )
        prev_chapter = prev_result.scalar_one_or_none()
        
        if not prev_chapter:
            return # Should not happen
            
        # Generate Content
        # Using AgentScope
        new_chapter_data = narrative_engine.generate_chapter(
            player_context={"id": player_id},
            previous_summary=prev_chapter.content[:500] # Truncated for demo
        )
        
        # Save to DB
        new_chapter = StoryChapter(
            player_id=player_id,
            chapter_number=current_chapter_num + 1,
            title=f"Chapter {current_chapter_num + 1}",
            content=new_chapter_data["content"],
            status="ready",
            world_state_snapshot={"npc_updates": new_chapter_data["npc_updates"]}
        )
        session.add(new_chapter)
        await session.commit()
        
        # Trigger Asset Generation (Async)
        await generate_assets_for_chapter(new_chapter.id, new_chapter.content)

async def generate_assets_for_chapter(chapter_id: int, content: str):
    # Analyze content to extract scenes/characters
    # Call Image Generation API
    # Save assets to DB
    pass
