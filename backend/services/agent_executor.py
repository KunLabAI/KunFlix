"""
AgentExecutor - Unified wrapper for DialogAgent execution with token tracking.

缓存策略（二级缓存）：
- L1：进程内 cachetools.TTLCache，缓存 DialogAgent / model 实例（含 LLM Client 不可序列化）
- L2：Redis，缓存 Agent / Provider 配置的可序列化快照（JSON），减少 DB 命中
- 每个 cache_key 挂一把 asyncio.Lock，防止缓存击穿下的重复构造
- 容量与 TTL 从 Settings 注入，生产可通过 .env 调优
- 失效：routers/llm_config.py 在 CRUD 后发布 invalidate 事件，听众负责清 L1
"""
from typing import Dict, Any, List, Optional, Tuple, AsyncGenerator, TYPE_CHECKING
from dataclasses import dataclass
from collections import defaultdict
import asyncio
import json
import logging

from cachetools import TTLCache
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from config import settings
from models import Agent, LLMProvider
from agents import DialogAgent
from agentscope.message import Msg
from agentscope.model import (
    OpenAIChatModel,
    DashScopeChatModel,
    AnthropicChatModel,
    GeminiChatModel,
    OllamaChatModel,
)
import agentscope
from services.llm_stream import stream_completion, StreamResult, DEFAULT_BASE_URLS
from cache import get_cache_backend
from cache.pubsub import subscribe, channel_invalidate

if TYPE_CHECKING:
    from services.tool_manager import ToolManager
    from services.tool_manager.context import ToolContext

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


def _extract_tool_results(new_messages: list, is_anthropic: bool) -> dict:
    """Extract tool results from messages appended by append_tool_round_with_errors.
    Returns {tool_call_id: result_content} mapping.
    """
    results = {}
    for msg in new_messages:
        # OpenAI format: {"role": "tool", "tool_call_id": ..., "content": ...}
        (not is_anthropic and msg.get("role") == "tool") and results.__setitem__(
            msg.get("tool_call_id", ""), msg.get("content", "")
        )
        # Anthropic format: {"role": "user", "content": [{"type": "tool_result", ...}]}
        is_anthropic and msg.get("role") == "user" and isinstance(msg.get("content"), list) and [
            results.__setitem__(block.get("tool_use_id", ""), block.get("content", ""))
            for block in msg["content"]
            if isinstance(block, dict) and block.get("type") == "tool_result"
        ]
    return results


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


# ---------------------------------------------------------------------------
# Model factory — 映射表驱动，避免多层 if-else
# ---------------------------------------------------------------------------
# 直接匹配的 provider_type -> 模型工厂
_DIRECT_MODEL_CREATORS = {
    "dashscope": lambda model_name, api_key, base_url=None: DashScopeChatModel(
        model_name=model_name, api_key=api_key,
    ),
    "gemini": lambda model_name, api_key, base_url=None: GeminiChatModel(
        model_name=model_name, api_key=api_key,
    ),
    "ollama": lambda model_name, api_key, base_url=None: OllamaChatModel(
        model_name=model_name, host=base_url,
    ),
}

# 家族类型 -> 模型工厂（OpenAI/Anthropic 使用 client_kwargs 注入 base_url）
_FAMILY_MODEL_CREATORS = {
    "anthropic": lambda model_name, api_key, base_url=None: AnthropicChatModel(
        model_name=model_name,
        api_key=api_key,
        client_kwargs={"base_url": base_url} if base_url else None,
    ),
    "openai": lambda model_name, api_key, base_url=None: OpenAIChatModel(
        model_name=model_name,
        api_key=api_key,
        client_kwargs={"base_url": base_url} if base_url else None,
    ),
}

# 家族识别关键字（子串包含即匹配）
_ANTHROPIC_FAMILY_KEYWORDS = ("anthropic", "minimax")


def _resolve_model_family(provider_type: str) -> str:
    """Pick the model family key for factory lookup.

    Priority:
    1. Direct match on _DIRECT_MODEL_CREATORS (dashscope/gemini/ollama)
    2. Anthropic family (provider_type 包含 anthropic 或 minimax)
    3. OpenAI 兜底（含 openai/azure/deepseek/vllm/xai 等）
    """
    pt = provider_type.lower()
    probes = [
        (pt in _DIRECT_MODEL_CREATORS, pt),
        (any(k in pt for k in _ANTHROPIC_FAMILY_KEYWORDS), "anthropic"),
    ]
    return next((key for matched, key in probes if matched), "openai")


def _create_llm_model(provider: LLMProvider, model_name: str):
    """Create an LLM model instance from a provider config using the family registry."""
    provider_type = provider.provider_type.lower()
    api_key = provider.api_key
    base_url = provider.base_url or DEFAULT_BASE_URLS.get(provider_type)

    family = _resolve_model_family(provider_type)
    factories = {**_DIRECT_MODEL_CREATORS, **_FAMILY_MODEL_CREATORS}
    factory = factories[family]
    return factory(model_name=model_name, api_key=api_key, base_url=base_url)


class AgentExecutor:
    """
    Unified executor for agent calls with automatic token tracking.
    Wraps DialogAgent and provides consistent interface for orchestration.
    """

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        # TTL + LRU 缓存，容量/TTL 来自 Settings，便于生产调优
        self._model_cache: TTLCache = TTLCache(
            maxsize=settings.MODEL_CACHE_MAX_SIZE,
            ttl=settings.MODEL_CACHE_TTL_SECONDS,
        )
        self._agent_cache: TTLCache = TTLCache(
            maxsize=settings.AGENT_CACHE_MAX_SIZE,
            ttl=settings.AGENT_CACHE_TTL_SECONDS,
        )
        # per-key 锁：防止同一 key 并发构造时缓存击穿
        self._cache_locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
        # 注册到全局弱引用集合，便于失效事件到达后逐实例清 L1
        _executor_registry.add(self)

    def invalidate_provider(self, provider_id: str) -> None:
        """清除 L1 中与该 provider 相关的实例。"""
        # agent_cache key 格式：{agent_id}_{provider_id}
        suffix = f"_{provider_id}"
        stale = [k for k in list(self._agent_cache) if k.endswith(suffix)]
        for k in stale:
            self._agent_cache.pop(k, None)
            self._cache_locks.pop(k, None)
        # model_cache key 格式：{provider_id}_{model_name}
        prefix = f"{provider_id}_"
        stale_m = [k for k in list(self._model_cache) if k.startswith(prefix)]
        for k in stale_m:
            self._model_cache.pop(k, None)

    def invalidate_agent(self, agent_id: str) -> None:
        """清除 L1 中与该 agent 相关的实例。"""
        prefix = f"{agent_id}_"
        stale = [k for k in list(self._agent_cache) if k.startswith(prefix)]
        for k in stale:
            self._agent_cache.pop(k, None)
            self._cache_locks.pop(k, None)

    async def execute(
        self,
        agent_id: str,
        messages: List[Dict[str, str]],
        context: Optional[Dict[str, Any]] = None,
    ) -> ExecutionResult:
        """Execute an agent with given messages."""
        agent_config = await self._load_agent(agent_id)
        provider = await self._load_provider(agent_config.provider_id)

        dialog_agent = await self._get_dialog_agent(agent_config, provider)

        input_content = messages[-1]["content"] if messages else ""
        input_msg = Msg(name="User", content=input_content, role="user")

        input_chars = sum(len(m.get("content", "")) for m in messages)

        logger.info(f"Executing agent '{agent_config.name}' (ID: {agent_id})")
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
                "context": context,
            },
        )

    async def execute_streaming(
        self,
        agent_id: str,
        messages: List[Dict[str, str]],
        context: Optional[Dict[str, Any]] = None,
        system_prompt_override: Optional[str] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        user_id: str | None = None,
    ) -> AsyncGenerator[Tuple[str, StreamResult], None]:
        """Execute an agent with streaming output, bypassing DialogAgent.reply()."""
        agent_config = await self._load_agent(agent_id)
        provider = await self._load_provider(agent_config.provider_id)

        effective_prompt = system_prompt_override if system_prompt_override is not None else agent_config.system_prompt
        full_messages: List[Dict[str, str]] = []
        effective_prompt and full_messages.append({"role": "system", "content": effective_prompt})
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
            tools=tools,
            user_id=user_id,
        ):
            yield chunk, result

    async def execute_streaming_with_tools(
        self,
        agent_id: str,
        messages: List[Dict[str, str]],
        tool_manager: "ToolManager",
        tool_context: "ToolContext",
        tools: Optional[List[Dict[str, Any]]] = None,
        max_tool_rounds: int = 100,
        system_prompt_override: Optional[str] = None,
        user_id: str | None = None,
    ) -> AsyncGenerator[Tuple[str, Any], None]:
        """Execute an agent with streaming + tool-call loop."""
        from services.chat_tool_dispatch import append_tool_round_with_errors

        agent_config = await self._load_agent(agent_id)
        provider = await self._load_provider(agent_config.provider_id)
        is_anthropic = provider.provider_type.lower() in ("anthropic", "minimax")

        effective_prompt = system_prompt_override if system_prompt_override is not None else agent_config.system_prompt
        full_messages: List[Dict[str, str]] = []
        effective_prompt and full_messages.append({"role": "system", "content": effective_prompt})
        full_messages.extend(messages)

        tool_names = [d.get("function", {}).get("name", "?") for d in (tools or [])]
        logger.info(f"Streaming+Tools agent '{agent_config.name}' (ID: {agent_id}), tools={tool_names}")

        current_tools = tools
        last_result: Optional[StreamResult] = None

        for _round in range(max_tool_rounds + 1):
            is_last_round = _round == max_tool_rounds
            round_tools = None if is_last_round else current_tools
            last_result = None

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
                tools=round_tools,
                user_id=user_id,
            ):
                last_result = result
                yield ("chunk", chunk, result)

            has_tool_calls = last_result and last_result.tool_calls
            if not has_tool_calls:
                break

            tool_calls_valid = []
            tool_calls_with_error = []
            for tc in last_result.tool_calls:
                try:
                    args = json.loads(tc.arguments)
                    tool_calls_valid.append((tc, args))
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse tool arguments for {tc.name}: {e}")
                    tool_calls_with_error.append((tc, f"Error: Invalid JSON in tool arguments: {e}"))

            for tc, args in tool_calls_valid:
                yield ("tool_call", {"tool_name": tc.name, "arguments": args}, None)
            for tc, _ in tool_calls_with_error:
                yield ("tool_call", {"tool_name": tc.name, "arguments": {"error": "JSON parse failed"}}, None)

            total = len(tool_calls_valid) + len(tool_calls_with_error)
            logger.info(
                f"[Subtask Tool Round {_round + 1}] {total} tool call(s) "
                f"({len(tool_calls_valid)} valid, {len(tool_calls_with_error)} error)"
            )
            msg_count_before = len(full_messages)
            await append_tool_round_with_errors(
                full_messages, last_result, tool_manager, tool_context,
                is_anthropic, tool_calls_valid, tool_calls_with_error,
            )

            tool_results = _extract_tool_results(full_messages[msg_count_before:], is_anthropic)

            for tc, args in tool_calls_valid:
                yield (
                    "tool_result",
                    {"tool_name": tc.name, "success": True, "result": tool_results.get(tc.id, "")},
                    None,
                )
            for tc, _ in tool_calls_with_error:
                yield ("tool_result", {"tool_name": tc.name, "success": False}, None)

            current_tools = tool_manager.rebuild_after_round(tool_context) or tools

    async def execute_with_system_prompt(
        self,
        agent_id: str,
        user_content: str,
        system_prompt_override: Optional[str] = None,
    ) -> ExecutionResult:
        """Execute agent with optional system prompt override."""
        agent_config = await self._load_agent(agent_id)
        provider = await self._load_provider(agent_config.provider_id)

        effective_prompt = system_prompt_override or agent_config.system_prompt

        # Fresh DialogAgent with potentially different prompt — do NOT cache this path
        model = _create_llm_model(provider, agent_config.model)
        dialog_agent = DialogAgent(
            name=agent_config.name,
            sys_prompt=effective_prompt,
            model=model,
            skill_names=agent_config.tools or None,
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
            },
        )

    async def _load_agent(self, agent_id: str) -> Agent:
        """Load agent configuration from database, with L2 (Redis) cache fallback."""
        cache_key = f"agent:{agent_id}"
        cached = await _L2_CACHE.get(cache_key)
        if cached is not None:
            agent = Agent(**cached)
            return agent
        result = await self.db.execute(select(Agent).filter(Agent.id == agent_id))
        agent = result.scalars().first()
        if not agent:
            raise ValueError(f"Agent not found: {agent_id}")
        await _L2_CACHE.set(cache_key, _serialize_orm(agent))
        return agent

    async def _load_provider(self, provider_id: str) -> LLMProvider:
        """Load LLM provider configuration with L2 (Redis) cache fallback."""
        cache_key = f"provider:{provider_id}"
        cached = await _L2_CACHE.get(cache_key)
        if cached is not None:
            return LLMProvider(**cached)
        result = await self.db.execute(select(LLMProvider).filter(LLMProvider.id == provider_id))
        provider = result.scalars().first()
        if not provider:
            raise ValueError(f"LLM Provider not found: {provider_id}")
        await _L2_CACHE.set(cache_key, _serialize_orm(provider))
        return provider

    async def _get_dialog_agent(self, agent_config: Agent, provider: LLMProvider) -> DialogAgent:
        """Get-or-create cached DialogAgent under per-key lock (防缓存击穿)."""
        cache_key = f"{agent_config.id}_{provider.id}"

        cached = self._agent_cache.get(cache_key)
        if cached is not None:
            return cached

        async with self._cache_locks[cache_key]:
            # double-check after acquiring lock
            cached = self._agent_cache.get(cache_key)
            if cached is not None:
                return cached

            model = _create_llm_model(provider, agent_config.model)
            dialog_agent = DialogAgent(
                name=agent_config.name,
                sys_prompt=agent_config.system_prompt,
                model=model,
                skill_names=agent_config.tools or None,
            )
            self._agent_cache[cache_key] = dialog_agent
            return dialog_agent

    def _create_model(self, provider: LLMProvider, model_name: str):
        """Backward-compat instance method; delegates to module-level factory."""
        return _create_llm_model(provider, model_name)

    def clear_cache(self):
        """Clear agent and model caches (admin endpoint)."""
        self._model_cache.clear()
        self._agent_cache.clear()
        self._cache_locks.clear()


def calculate_credit_cost(
    input_tokens: int,
    output_tokens: int,
    input_rate: float,
    output_rate: float,
) -> float:
    """Calculate credit cost based on token usage and rates."""
    return (input_tokens / 1000 * input_rate) + (output_tokens / 1000 * output_rate)


# ---------------------------------------------------------------------------
# L2 cache (config snapshot) + invalidation listener
# ---------------------------------------------------------------------------
_L2_CACHE = get_cache_backend(
    max_size=settings.AGENT_CACHE_MAX_SIZE,
    default_ttl=settings.AGENT_CACHE_TTL_SECONDS,
)

# 进程内跟踪所有 AgentExecutor 实例（弱引用），方便收到失效事件后清 L1
import weakref
_executor_registry: "weakref.WeakSet[AgentExecutor]" = weakref.WeakSet()


def _serialize_orm(obj) -> Dict[str, Any]:
    """仅取 SQLAlchemy ORM 实例的列字段为 JSON 快照。"""
    cols = obj.__table__.columns.keys()
    return {c: getattr(obj, c, None) for c in cols}


# 远程失效事件 -> L1/L2 清理动作（映射表驱动）
async def _evict_provider(key: str) -> None:
    await _L2_CACHE.delete(f"provider:{key}")
    for ex in list(_executor_registry):
        ex.invalidate_provider(key)


async def _evict_agent(key: str) -> None:
    await _L2_CACHE.delete(f"agent:{key}")
    for ex in list(_executor_registry):
        ex.invalidate_agent(key)


_INVALIDATION_HANDLERS = {
    channel_invalidate("provider"): _evict_provider,
    channel_invalidate("agent"): _evict_agent,
}


async def start_invalidation_listener() -> None:
    """后台任务：订阅失效频道，收到后清 L1/L2。未连 Redis 立刻返回。"""
    channels = list(_INVALIDATION_HANDLERS.keys())
    async for ch, payload in subscribe(*channels):
        handler = _INVALIDATION_HANDLERS.get(ch)
        key = isinstance(payload, dict) and payload.get("key")
        handler and key and await handler(key)
