import agentscope
from agentscope.agents import DialogAgent, UserAgent
from agentscope.message import Msg
from config import settings

class NarrativeEngine:
    def __init__(self):
        self.initialized = False
        
    def initialize(self):
        if self.initialized:
            return
            
        if not settings.OPENAI_API_KEY:
            print("Warning: OPENAI_API_KEY not set. Narrative Engine will not function.")
            return

        # Initialize agentscope with model configs
        self.model_config = {
            "config_name": "gpt-4-config",
            "model_type": "openai_chat",
            "model_name": settings.STORY_GENERATION_MODEL,
            "api_key": settings.OPENAI_API_KEY
        }
        agentscope.init(model_configs=[self.model_config])
        
        # Create agents
        self.director = DialogAgent(
            name="Director",
            sys_prompt="You are the Director of an interactive story. Your goal is to guide the narrative, ensuring consistency and engagement. You decide the flow and verify plot points.",
            model_config_name="gpt-4-config"
        )
        
        self.narrator = DialogAgent(
            name="Narrator",
            sys_prompt="You are the Narrator. You generate immersive, descriptive text based on the Director's outline. Focus on sensory details and character emotions.",
            model_config_name="gpt-4-config"
        )
        
        self.npc_manager = DialogAgent(
            name="NPC_Manager",
            sys_prompt="You manage the NPCs. You track their relationships with the player and determine their reactions based on affinity, trust, and hidden traits.",
            model_config_name="gpt-4-config"
        )
        self.initialized = True

    def generate_chapter(self, player_context: dict, previous_summary: str):
        if not self.initialized:
            self.initialize()
            if not self.initialized:
                 return {
                    "outline": "Error: AI Engine not initialized (Missing API Key)",
                    "content": "The story cannot proceed without the AI engine. Please configure the API key.",
                    "npc_updates": "{}"
                }

        # 1. Director outlines the chapter
        outline_msg = self.director(Msg(
            name="System", 
            content=f"Create an outline for the next chapter based on: {previous_summary}. Player context: {player_context}"
        ))
        
        # 2. Narrator fleshes it out
        story_msg = self.narrator(outline_msg)
        
        # 3. NPC Manager updates state (simulated for now)
        npc_update = self.npc_manager(Msg(
            name="System",
            content=f"Analyze the story: {story_msg.content}. Update NPC relationships."
        ))
        
        return {
            "outline": outline_msg.content,
            "content": story_msg.content,
            "npc_updates": npc_update.content
        }

narrative_engine = NarrativeEngine()
