import agentscope
from agentscope.agent import AgentBase
from agentscope.message import Msg
from agentscope.model import OpenAIChatModel, DashScopeChatModel, AnthropicChatModel, GeminiChatModel
from config import settings
from sqlalchemy.future import select
from models import LLMProvider
from database import AsyncSessionLocal
import asyncio
import logging

logger = logging.getLogger(__name__)

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
        
        # 计算输入字符数
        input_chars = sum(len(m['content']) for m in messages)
        
        # Call model
        response = self.model(messages)
        
        # Extract content and usage
        content = response.text if hasattr(response, 'text') else str(response)
        
        # 从response.usage提取真实token统计
        usage = getattr(response, 'usage', None)
        input_tokens = getattr(usage, 'input_tokens', 0) if usage else 0
        output_tokens = getattr(usage, 'output_tokens', 0) if usage else 0
        
        # 创建包含token统计的消息
        res_msg = Msg(
            name=self.name,
            content=content,
            role="assistant",
            metadata={
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "input_chars": input_chars,
                "output_chars": len(content),
            }
        )
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
            
            provider_type_lower = provider_type.lower()
            
            # 供应商类型映射到模型类和配置
            openai_compatible = ["openai", "azure", "deepseek"]
            anthropic_compatible = ["anthropic", "minimax"]
            
            # 默认 base_url 配置
            default_base_urls = {
                "deepseek": "https://api.deepseek.com",
                "minimax": "https://api.minimax.chat/v1"
            }
            
            # 确定实际使用的 base_url
            effective_base_url = base_url or default_base_urls.get(provider_type_lower)
            client_kwargs = {"base_url": effective_base_url} if effective_base_url else None
            
            # 根据供应商类型创建对应的模型实例
            model_creators = {
                "dashscope": lambda: DashScopeChatModel(model_name=model_name, api_key=api_key),
                "gemini": lambda: GeminiChatModel(model_name=model_name, api_key=api_key),
            }
            
            # 检查是否有直接匹配的创建器
            creator = model_creators.get(provider_type_lower)
            
            # 检查是否属于 OpenAI 兼容类型
            is_openai = creator is None and any(t in provider_type_lower for t in openai_compatible)
            # 检查是否属于 Anthropic 兼容类型
            is_anthropic = creator is None and any(t in provider_type_lower for t in anthropic_compatible)
            
            if creator:
                self.current_model = creator()
            elif is_anthropic:
                self.current_model = AnthropicChatModel(
                    model_name=model_name,
                    api_key=api_key,
                    client_kwargs=client_kwargs
                )
            else:
                # 默认使用 OpenAI 兼容格式
                self.current_model = OpenAIChatModel(
                    model_name=model_name,
                    api_key=api_key,
                    client_kwargs=client_kwargs
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
                    "npc_updates": "{}",
                    "usage": {"input_tokens": 0, "output_tokens": 0, "input_chars": 0, "output_chars": 0}
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
        
        # 汇总所有agent的token统计
        all_msgs = [outline_msg, story_msg, npc_update]
        total_input_tokens = sum(m.metadata.get("input_tokens", 0) for m in all_msgs)
        total_output_tokens = sum(m.metadata.get("output_tokens", 0) for m in all_msgs)
        total_input_chars = sum(m.metadata.get("input_chars", 0) for m in all_msgs)
        total_output_chars = sum(m.metadata.get("output_chars", 0) for m in all_msgs)
        
        # 日志输出
        logger.info(f"\n{'='*60}")
        logger.info(f"NarrativeEngine Chapter Generation Complete")
        logger.info(f"Director tokens: {outline_msg.metadata.get('input_tokens', 0)} in / {outline_msg.metadata.get('output_tokens', 0)} out")
        logger.info(f"Narrator tokens: {story_msg.metadata.get('input_tokens', 0)} in / {story_msg.metadata.get('output_tokens', 0)} out")
        logger.info(f"NPC Manager tokens: {npc_update.metadata.get('input_tokens', 0)} in / {npc_update.metadata.get('output_tokens', 0)} out")
        logger.info(f"Total: {total_input_tokens} in / {total_output_tokens} out = {total_input_tokens + total_output_tokens} tokens")
        logger.info(f"Chars: {total_input_chars} in / {total_output_chars} out = {total_input_chars + total_output_chars} chars")
        logger.info(f"{'='*60}\n")
        
        return {
            "outline": outline_msg.content,
            "content": story_msg.content,
            "npc_updates": npc_update.content,
            "usage": {
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
                "input_chars": total_input_chars,
                "output_chars": total_output_chars,
            }
        }

narrative_engine = NarrativeEngine()
# Note: Initial loading happens when needed or triggered by startup event

