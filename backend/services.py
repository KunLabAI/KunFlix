from sqlalchemy.ext.asyncio import AsyncSession
from models import Player, StoryChapter
from agents import narrative_engine
from agentscope.message import Msg
import json
import asyncio

class GameService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_player(self, username: str):
        player = Player(username=username)
        self.db.add(player)
        await self.db.commit()
        await self.db.refresh(player)
        return player

    async def init_world(self, player_id: str):
        # 1. Generate Worldview (Using AgentScope via NarrativeEngine)
        # This would call a specific agent for world-building
        world_prompt = "Create a unique, immersive worldview. Define the core conflict, magic/tech system, and 3 key factions."
        world_msg = narrative_engine.director(Msg(name="System", content=world_prompt))
        if asyncio.iscoroutine(world_msg):
            world_msg = await world_msg
        
        # 2. Generate Intro (Chapter 1 & 2)
        intro_chapter = await narrative_engine.generate_chapter(
            player_context={"id": player_id, "world_setting": world_msg.content},
            previous_summary="Beginning of the adventure."
        )
        
        # Save to DB
        chapter1 = StoryChapter(
            player_id=player_id,
            chapter_number=1,
            title="The Beginning",
            content=intro_chapter["content"],
            status="completed",
            world_state_snapshot={"setting": world_msg.content}
        )
        self.db.add(chapter1)
        
        # Pre-generate Chapter 2 (Background Task usually, but here synchronous for simplicity of demo)
        chapter2_outline = await narrative_engine.generate_chapter(
            player_context={"id": player_id},
            previous_summary=intro_chapter["outline"]
        )
        chapter2 = StoryChapter(
            player_id=player_id,
            chapter_number=2,
            title="The Journey Continues",
            content=chapter2_outline["content"],
            status="ready"
        )
        self.db.add(chapter2)
        
        await self.db.commit()
        return {"world": world_msg.content, "chapter1": chapter1, "chapter2": chapter2}

    async def process_player_choice(self, player_id: str, choice_text: str):
        # 1. Update Player State
        # 2. Check Deviation (Consistency Check)
        # 3. Trigger Next Chapter Generation
        pass
