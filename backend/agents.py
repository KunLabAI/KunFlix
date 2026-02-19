import agentscope
from agentscope.agent import AgentBase
from agentscope.message import Msg
from agentscope.model import OpenAIChatModel, DashScopeChatModel
from config import settings
from sqlalchemy.future import select
from models import LLMProvider
from database import AsyncSessionLocal
import asyncio

class DialogAgent(AgentBase):
    def __init__(self, name: str, sys_prompt: str, model):
        super().__init__()
        self.name = name
        self.sys_prompt = sys_prompt
        self.model = model
        self.memory = []

    async def reply(self, x: Msg = None) -> Msg:
        if x:
            self.memory.append(x)
        
        # Prepare messages for model
        messages = [{"role": "system", "content": self.sys_prompt}]
        for m in self.memory:
            role = "user"
            if m.name == self.name:
                role = "assistant"
            elif m.role == "system":
                role = "system"
            messages.append({"role": role, "content": m.content})
            
        # Call model
        response = self.model(messages)
        
        # Extract content
        content = response.text if hasattr(response, 'text') else str(response)
        
        res_msg = Msg(name=self.name, content=content, role="assistant")
        self.memory.append(res_msg)
        return res_msg

class NarrativeEngine:
    def __init__(self):
        self.initialized = False
        self.current_model = None

        
    async def load_config_from_db(self, db_session=None):
        """
        Loads the active LLM configuration from the database.
        If db_session is provided, use it. Otherwise, create a new one.
        """
        if db_session:
            return await self._fetch_and_init(db_session)
        
        async with AsyncSessionLocal() as session:
            return await self._fetch_and_init(session)

    async def _fetch_and_init(self, session):
        result = await session.execute(
            select(LLMProvider).filter(LLMProvider.is_active == True).order_by(LLMProvider.is_default.desc())
        )
        provider = result.scalars().first()
        
        if not provider:
            print("Warning: No active LLM Provider found in database. Using fallback settings if available.")
            # Fallback to settings if DB is empty (migration path)
            if settings.OPENAI_API_KEY:
                self.initialize(
                    api_key=settings.OPENAI_API_KEY, 
                    model_name=settings.STORY_GENERATION_MODEL,
                    base_url=None
                )
            return
            
        print(f"Initializing NarrativeEngine with provider: {provider.name}")
        
        # Parse models from JSON or list
        model_to_use = "gpt-4"
        if provider.models:
            if isinstance(provider.models, list) and len(provider.models) > 0:
                model_to_use = provider.models[0]
            elif isinstance(provider.models, str):
                import json
                try:
                    models_list = json.loads(provider.models)
                    if models_list and len(models_list) > 0:
                        model_to_use = models_list[0]
                except:
                    model_to_use = provider.models

        self.initialize(
            api_key=provider.api_key,
            model_name=model_to_use,
            base_url=provider.base_url,
            provider_type=provider.provider_type,
            config_json=provider.config_json
        )

    def initialize(self, api_key=None, model_name="gpt-4", base_url=None, provider_type="openai_chat", config_json=None):
        if not api_key:
            print("Warning: API Key not provided for Narrative Engine.")
            return

        try:
            agentscope.init()
            
            if "dashscope" in provider_type:
                 self.current_model = DashScopeChatModel(
                    model_name=model_name,
                    api_key=api_key
                 )
            else:
                 # Default to OpenAI
                 self.current_model = OpenAIChatModel(
                    model_name=model_name,
                    api_key=api_key,
                    client_kwargs={"base_url": base_url} if base_url else None
                 )

            print(f"AgentScope initialized with model: {model_name} ({provider_type})")
        except Exception as e:
            print(f"AgentScope init error: {e}")
            return

        # Re-create agents with new config
        self._create_agents()
        self.initialized = True

    def _create_agents(self):
        self.director = DialogAgent(
            name="Director",
            sys_prompt="You are the Director of an interactive story. Your goal is to guide the narrative, ensuring consistency and engagement. You decide the flow and verify plot points.",
            model=self.current_model
        )
        
        self.narrator = DialogAgent(
            name="Narrator",
            sys_prompt="You are the Narrator. You generate immersive, descriptive text based on the Director's outline. Focus on sensory details and character emotions.",
            model=self.current_model
        )
        
        self.npc_manager = DialogAgent(
            name="NPC_Manager",
            sys_prompt="You manage the NPCs. You track their relationships with the player and determine their reactions based on affinity, trust, and hidden traits.",
            model=self.current_model
        )

    async def reload_config(self, db_session):
        """Method to trigger a reload of configuration from the API"""
        await self.load_config_from_db(db_session)

    async def generate_chapter(self, player_context: dict, previous_summary: str):
        if not self.initialized:
            # Try to lazy load from DB if not initialized
            await self.load_config_from_db()
            
            if not self.initialized:
                 return {
                    "outline": "Error: AI Engine not initialized (Missing Active Provider)",
                    "content": "The story cannot proceed without the AI engine. Please configure an LLM Provider in the admin panel.",
                    "npc_updates": "{}"
                }

        # 1. Director outlines the chapter
        outline_msg = self.director(Msg(
            name="System", 
            content=f"Create an outline for the next chapter based on: {previous_summary}. Player context: {player_context}"
        ))
        if asyncio.iscoroutine(outline_msg):
            outline_msg = await outline_msg
        
        # 2. Narrator fleshes it out
        story_msg = self.narrator(outline_msg)
        if asyncio.iscoroutine(story_msg):
            story_msg = await story_msg
        
        # 3. NPC Manager updates state (simulated for now)
        npc_update = self.npc_manager(Msg(
            name="System",
            content=f"Analyze the story: {story_msg.content}. Update NPC relationships."
        ))
        if asyncio.iscoroutine(npc_update):
            npc_update = await npc_update
        
        return {
            "outline": outline_msg.content,
            "content": story_msg.content,
            "npc_updates": npc_update.content
        }

narrative_engine = NarrativeEngine()
# Note: Initial loading happens when needed or triggered by startup event

