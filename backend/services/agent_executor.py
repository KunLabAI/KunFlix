"""
AgentExecutor - Unified wrapper for DialogAgent execution with token tracking
"""
from typing import Dict, Any, List, Optional, Tuple, AsyncGenerator
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import logging

from models import Agent, LLMProvider
from agents import DialogAgent
from agentscope.message import Msg
from agentscope.model import OpenAIChatModel, DashScopeChatModel, AnthropicChatModel, GeminiChatModel, OllamaChatModel
import agentscope
from services.llm_stream import stream_completion, StreamResult

logger = logging.getLogger(__name__)


def _normalize_content(content) -> str:
    """Normalize LLM response content to str (handles list from multi-modal APIs)."""
    type_handlers = {
        str: lambda c: c,
        list: lambda c: "".join(
            item.get("text", "") if hasattr(item, "get") else str(item)
            for item in c
        ),
    }
    return type_handlers.get(type(content), str)(content)


@dataclass
class ExecutionResult:
    """Result of agent execution"""
    content: str
    input_tokens: int = 0
    output_tokens: int = 0
    input_chars: int = 0
    output_chars: int = 0
    metadata: Dict[str, Any] = None

    def __post_init__(self):
        self.metadata = self.metadata or {}


# Provider type to model class mapping
MODEL_CREATORS = {
    "dashscope": lambda model_name, api_key, **_: DashScopeChatModel(model_name=model_name, api_key=api_key),
    "gemini": lambda model_name, api_key, **_: GeminiChatModel(model_name=model_name, api_key=api_key),
    "ollama": lambda model_name, base_url=None, **_: OllamaChatModel(model_name=model_name, host=base_url),
}

OPENAI_COMPATIBLE = ["openai", "azure", "deepseek", "vllm"]
ANTHROPIC_COMPATIBLE = ["anthropic", "minimax"]

DEFAULT_BASE_URLS = {
    "deepseek": "https://api.deepseek.com",
    "minimax": "https://api.minimax.chat/v1",
}


class AgentExecutor:
    """
    Unified executor for agent calls with automatic token tracking.
    Wraps DialogAgent and provides consistent interface for orchestration.
    """

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self._model_cache: Dict[str, Any] = {}
        self._agent_cache: Dict[str, DialogAgent] = {}

    async def execute(
        self,
        agent_id: str,
        messages: List[Dict[str, str]],
        context: Optional[Dict[str, Any]] = None
    ) -> ExecutionResult:
        """
        Execute an agent with given messages.
        
        Args:
            agent_id: The agent's UUID
            messages: List of message dicts with 'role' and 'content'
            context: Optional context data
            
        Returns:
            ExecutionResult with content and token usage
        """
        # Load agent config
        agent_config = await self._load_agent(agent_id)
        provider = await self._load_provider(agent_config.provider_id)
        
        # Build or get cached DialogAgent
        dialog_agent = await self._get_dialog_agent(agent_config, provider)
        
        # Prepare input message
        input_content = messages[-1]["content"] if messages else ""
        input_msg = Msg(name="User", content=input_content, role="user")
        
        # Calculate input chars
        input_chars = sum(len(m.get("content", "")) for m in messages)
        
        # Execute
        logger.info(f"Executing agent '{agent_config.name}' (ID: {agent_id})")
        response_msg = await dialog_agent.reply(input_msg)
        content_str = _normalize_content(response_msg.content)
        
        # Extract usage from metadata
        metadata = getattr(response_msg, "metadata", {}) or {}
        
        return ExecutionResult(
            content=content_str,
            input_tokens=metadata.get("input_tokens", 0),
            output_tokens=metadata.get("output_tokens", 0),
            input_chars=input_chars,
            output_chars=len(content_str),
            metadata={
                "agent_id": agent_id,
                "agent_name": agent_config.name,
                "model": agent_config.model,
                "context": context,
            }
        )

    async def execute_streaming(
        self,
        agent_id: str,
        messages: List[Dict[str, str]],
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[Tuple[str, StreamResult], None]:
        """
        Execute an agent with streaming output, bypassing DialogAgent.reply().
        Directly calls stream_completion for real-time chunk delivery.

        Yields:
            tuple[str, StreamResult]: (chunk_text, running_result)
        """
        agent_config = await self._load_agent(agent_id)
        provider = await self._load_provider(agent_config.provider_id)

        # Build full message list with system prompt
        full_messages: List[Dict[str, str]] = []
        if agent_config.system_prompt:
            full_messages.append({"role": "system", "content": agent_config.system_prompt})
        full_messages.extend(messages)

        logger.info(f"Streaming agent '{agent_config.name}' (ID: {agent_id})")

        async for chunk, result in stream_completion(
            provider_type=provider.provider_type,
            api_key=provider.api_key,
            base_url=provider.base_url,
            model=agent_config.model,
            messages=full_messages,
            temperature=agent_config.temperature,
            context_window=agent_config.context_window,
            thinking_mode=agent_config.thinking_mode or False,
            gemini_config=agent_config.gemini_config,
        ):
            yield chunk, result

    async def execute_with_system_prompt(
        self,
        agent_id: str,
        user_content: str,
        system_prompt_override: Optional[str] = None
    ) -> ExecutionResult:
        """
        Execute agent with optional system prompt override.
        Useful for task decomposition where leader needs special instructions.
        """
        agent_config = await self._load_agent(agent_id)
        provider = await self._load_provider(agent_config.provider_id)
        
        # Use override or original system prompt
        effective_prompt = system_prompt_override or agent_config.system_prompt
        
        # Create fresh DialogAgent with potentially different prompt
        model = self._create_model(provider, agent_config.model)
        dialog_agent = DialogAgent(
            name=agent_config.name,
            sys_prompt=effective_prompt,
            model=model
        )
        
        input_msg = Msg(name="User", content=user_content, role="user")
        input_chars = len(user_content)
        
        response_msg = await dialog_agent.reply(input_msg)
        content_str = _normalize_content(response_msg.content)
        metadata = getattr(response_msg, "metadata", {}) or {}
        
        return ExecutionResult(
            content=content_str,
            input_tokens=metadata.get("input_tokens", 0),
            output_tokens=metadata.get("output_tokens", 0),
            input_chars=input_chars,
            output_chars=len(content_str),
            metadata={
                "agent_id": agent_id,
                "agent_name": agent_config.name,
                "model": agent_config.model,
                "system_prompt_override": system_prompt_override is not None,
            }
        )

    async def _load_agent(self, agent_id: str) -> Agent:
        """Load agent configuration from database"""
        result = await self.db.execute(select(Agent).filter(Agent.id == agent_id))
        agent = result.scalars().first()
        if not agent:
            raise ValueError(f"Agent not found: {agent_id}")
        return agent

    async def _load_provider(self, provider_id: str) -> LLMProvider:
        """Load LLM provider configuration"""
        result = await self.db.execute(select(LLMProvider).filter(LLMProvider.id == provider_id))
        provider = result.scalars().first()
        if not provider:
            raise ValueError(f"LLM Provider not found: {provider_id}")
        return provider

    async def _get_dialog_agent(self, agent_config: Agent, provider: LLMProvider) -> DialogAgent:
        """Get or create cached DialogAgent instance"""
        cache_key = f"{agent_config.id}_{provider.id}"
        
        cached = self._agent_cache.get(cache_key)
        if cached:
            return cached
        
        model = self._create_model(provider, agent_config.model)
        dialog_agent = DialogAgent(
            name=agent_config.name,
            sys_prompt=agent_config.system_prompt,
            model=model
        )
        
        self._agent_cache[cache_key] = dialog_agent
        return dialog_agent

    def _create_model(self, provider: LLMProvider, model_name: str):
        """Create LLM model instance based on provider type"""
        provider_type = provider.provider_type.lower()
        api_key = provider.api_key
        base_url = provider.base_url or DEFAULT_BASE_URLS.get(provider_type)
        client_kwargs = {"base_url": base_url} if base_url else None
        
        # Check direct creator first
        creator = MODEL_CREATORS.get(provider_type)
        if creator:
            return creator(model_name=model_name, api_key=api_key, base_url=base_url)
        
        # Check Anthropic compatible
        is_anthropic = any(t in provider_type for t in ANTHROPIC_COMPATIBLE)
        if is_anthropic:
            return AnthropicChatModel(
                model_name=model_name,
                api_key=api_key,
                client_kwargs=client_kwargs
            )
        
        # Default to OpenAI compatible
        return OpenAIChatModel(
            model_name=model_name,
            api_key=api_key,
            client_kwargs=client_kwargs
        )

    def clear_cache(self):
        """Clear agent and model caches"""
        self._model_cache.clear()
        self._agent_cache.clear()


def calculate_credit_cost(
    input_tokens: int,
    output_tokens: int,
    input_rate: float,
    output_rate: float
) -> float:
    """Calculate credit cost based on token usage and rates"""
    return (input_tokens / 1000 * input_rate) + (output_tokens / 1000 * output_rate)
