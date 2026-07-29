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
from agents import DialogAgent, create_chat_model
from agentscope.message import UserMsg
from services.llm_stream import stream_completion, StreamResult, DEFAULT_BASE_URLS
from cache import get_cache_backend
from cache.pubsub import subscribe, channel_invalidate

# 工具执行期间心跳间隔（秒），防止 Nginx proxy_read_timeout 断连
_TOOL_HEARTBEAT_INTERVAL = 30.0

if TYPE_CHECKING:
    from services.tool_manager import ToolManager
    from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)


def _normalize_content(content) -> str:
    """Normalize 2.0 Msg/ChatResponse content to str (TextBlock list 或 str)."""
    type_handlers = {
        str: lambda c: c,
        list: lambda c: "".join(_block_text(b) for b in c),
    }
    return type_handlers.get(type(content), str)(content)


def _block_text(block) -> str:
    """单个 content block → 文本（兼容 Pydantic TextBlock 与 dict）。"""
    if isinstance(block, dict):
        return block.get("text", "") if not block.get("type") or block.get("type") == "text" else ""
    return getattr(block, "text", "") or ""


def _extract_tool_results(new_messages: list, is_anthropic: bool) -> dict:
    """Extract tool results from messages appended by append_tool_round_with_errors.
    Returns {tool_call_id: result_content_str} mapping.
    Multimodal list content is flattened to text for SSE transport.
    """
    results = {}
    for msg in new_messages:
        # OpenAI format: {"role": "tool", "tool_call_id": ..., "content": ...}
        if not is_anthropic and msg.get("role") == "tool":
            content = msg.get("content", "")
            # 多模态 content (list) → 提取 text 部分作为摘要
            text_val = (
                next((p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"), "[multimodal content]")
                if isinstance(content, list) else content
            )
            results[msg.get("tool_call_id", "")] = text_val
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
# Model factory — 委托给 agents.create_chat_model，这里只保留轻量适配层
# ---------------------------------------------------------------------------

def _create_llm_model(provider: LLMProvider, model_name: str):
    """Create a 2.0 ChatModel instance from LLMProvider DB record.

    这里不再处理 provider_type 分派，统一委托给 ``agents.create_chat_model``，
    避免与 agents.py 里的家族映射重复。
    """
    return create_chat_model(
        provider_type=provider.provider_type,
        api_key=provider.api_key,
        model_name=model_name,
        base_url=provider.base_url,
    )


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
        input_msg = UserMsg(name="User", content=input_content)

        input_chars = sum(len(m.get("content", "")) for m in messages)

        logger.info(f"Executing agent '{agent_config.name}' (ID: {agent_id})")
        response_msg = await dialog_agent.reply(input_msg)
        content_str = _normalize_content(response_msg.content)

        # P0-1: reply 后持久化 AgentState
        await self.save_agent_state(agent_config, provider, dialog_agent)

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

        # ── stream_completion 内联信号前缀（与 chat_generation.py 保持一致）──
        # 这两个前缀是 llm_stream 层用来在文本流里夹带 工具预告 / 参数增量 信号的：
        #   __TOOL_PENDING__:<tool_name>
        #   __TOOL_DELTA__:<tool_name>:<arg_chunk>
        # 单智能体路径会将它们转为 SSE tool_pending / tool_call_delta 事件。
        # 多智能体子智能体路径：不需要精细预告（tool_call 到达时前端会自动触发 ghost），
        # 这里直接过滤掉，避免它们作为普通文本 chunk 泄入子任务 result / subtask_chunk 流。
        _TOOL_PENDING_PREFIX = "__TOOL_PENDING__:"
        _TOOL_DELTA_PREFIX = "__TOOL_DELTA__:"

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
                # 过滤内联信号前缀，不往上游 yield（防止子任务 result 混入 __TOOL_PENDING__/__TOOL_DELTA__ 原始标记）
                if chunk.startswith(_TOOL_PENDING_PREFIX) or chunk.startswith(_TOOL_DELTA_PREFIX):
                    continue
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
            tool_task = asyncio.create_task(
                append_tool_round_with_errors(
                    full_messages, last_result, tool_manager, tool_context,
                    is_anthropic, tool_calls_valid, tool_calls_with_error,
                )
            )
            while not tool_task.done():
                done, _ = await asyncio.wait({tool_task}, timeout=_TOOL_HEARTBEAT_INTERVAL)
                (not done) and (yield ("heartbeat", {}, None))
            tool_task.result()

            tool_results = _extract_tool_results(full_messages[msg_count_before:], is_anthropic)

            for tc, args in tool_calls_valid:
                yield (
                    "tool_result",
                    {"tool_name": tc.name, "success": True, "result": tool_results.get(tc.id, "")},
                    None,
                )
            for tc, _ in tool_calls_with_error:
                yield ("tool_result", {"tool_name": tc.name, "success": False}, None)

            # 画布图像桥接：本轮工具中若累积了 generate_image 生成的 URL，
            # 立即落地为画布 image 节点（与单智能体 chat_generation.py 保持一致）。
            # 此前多智能体路径漏掉此步骤，导致子智能体的图片只出现在对话文本中，
            # 无法在画布上呈现为节点。共享 media_canvas_bridge.flush_canvas_image_queue，
            # 内部使用独立 AsyncSessionLocal 会话以避免 autoflush 与 ctx.db 竞争。
            _has_queue = (
                tool_context is not None
                and getattr(tool_context, "theater_id", None)
                and getattr(tool_context, "canvas_image_queue", None)
            )
            if _has_queue:
                from services.media_canvas_bridge import flush_canvas_image_queue
                await flush_canvas_image_queue(tool_context, tool_context.theater_id)

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

        input_msg = UserMsg(name="User", content=user_content)
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
        """Get-or-create cached DialogAgent under per-key lock (防缓存击穿).

        P0-1: 支持 AgentState 持久化 — 从 L2 Redis 恢复 state，reply 后回写。
        """
        cache_key = f"{agent_config.id}_{provider.id}"

        cached = self._agent_cache.get(cache_key)
        if cached is not None:
            return cached

        async with self._cache_locks[cache_key]:
            # double-check after acquiring lock
            cached = self._agent_cache.get(cache_key)
            if cached is not None:
                return cached

            # P0-1: 尝试从 L2 恢复 AgentState
            state = await self._load_agent_state(cache_key)

            model = _create_llm_model(provider, agent_config.model)
            dialog_agent = DialogAgent(
                name=agent_config.name,
                sys_prompt=agent_config.system_prompt,
                model=model,
                skill_names=agent_config.tools or None,
                state=state,
            )
            self._agent_cache[cache_key] = dialog_agent
            return dialog_agent

    async def save_agent_state(self, agent_config: Agent, provider: LLMProvider, dialog_agent: DialogAgent) -> None:
        """P0-1: 将 AgentState 持久化到 L2 Redis，跨请求/跨重启保留上下文。"""
        cache_key = f"{agent_config.id}_{provider.id}"
        state_key = f"agent_state:{cache_key}"
        try:
            state_data = dialog_agent.state.model_dump() if hasattr(dialog_agent.state, 'model_dump') else None
            state_data and await _L2_CACHE.set(state_key, state_data, ttl=3600)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to persist AgentState for %s: %s", cache_key, exc)

    async def _load_agent_state(self, cache_key: str):
        """P0-1: 从 L2 Redis 恢复 AgentState；未命中时返回 None（框架自动创建新 state）。"""
        state_key = f"agent_state:{cache_key}"
        try:
            from agentscope.state import AgentState
            cached_state = await _L2_CACHE.get(state_key)
            return AgentState(**cached_state) if cached_state else None
        except Exception as exc:  # noqa: BLE001
            logger.debug("Could not restore AgentState for %s: %s", cache_key, exc)
            return None

    # ---------------------------------------------------------------------
    # P1-2: Per-subtask AgentState persistence
    # ---------------------------------------------------------------------
    #
    # 与 leader 级别的 (agent_id, provider_id) 级缓存分开，以 subtask_state_key
    # 为维度存储（推荐形式："{task_execution_id}:{subtask_id}"）。rework 时同 key
    # 会续用上次的上下文，实现 "worker 记得自己上次做了什么"。TTL 缩短到
    # 1800s，避免长期占用 Redis。

    async def _load_subtask_state(self, subtask_state_key: str):
        """P1-2: 加载 subtask 独立的 AgentState；未命中返回 None（首次执行）。"""
        state_key = f"agent_state:sub:{subtask_state_key}"
        try:
            from agentscope.state import AgentState
            cached_state = await _L2_CACHE.get(state_key)
            return AgentState(**cached_state) if cached_state else None
        except Exception as exc:  # noqa: BLE001
            logger.debug("Could not restore subtask AgentState for %s: %s", subtask_state_key, exc)
            return None

    async def _save_subtask_state(self, subtask_state_key: str, dialog_agent: DialogAgent) -> None:
        """P1-2: 将当前 dialog_agent 的 state 持久化到 subtask 独立的 L2 key。

        任何序列化/下发失败都只告警 —— subtask 主流程不能因为 state 落库异常失败。
        """
        state_key = f"agent_state:sub:{subtask_state_key}"
        try:
            state_data = (
                dialog_agent.state.model_dump()
                if hasattr(dialog_agent.state, "model_dump")
                else None
            )
            state_data and await _L2_CACHE.set(state_key, state_data, ttl=1800)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to persist subtask AgentState for %s: %s", subtask_state_key, exc)

    async def execute_for_subtask(
        self,
        agent_id: str,
        messages: List[Dict[str, str]],
        subtask_state_key: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> ExecutionResult:
        """P1-2: Execute agent with per-subtask AgentState persistence.

        与 ``execute()`` 的差异：
        - **不使用** ``_get_dialog_agent`` 缓存，每次 fresh 一个 DialogAgent 实例
          （否则多 subtask 并发会共享同一个 state 而互相污染）
        - state 存到 ``agent_state:sub:{subtask_state_key}`` 独立 key
        - reply 后自动 save state，为 rework/多轮子任务提供上下文连续性

        Args:
            agent_id: Sub-agent id
            messages: 只用 messages[-1] 作为本轮 user 输入（保留 list 参数兼容既有调用点）
            subtask_state_key: 推荐形式 "{task_execution_id}:{subtask_id}"
            context: 无语义；仅追加到 metadata，便于上层日志
        """
        agent_config = await self._load_agent(agent_id)
        provider = await self._load_provider(agent_config.provider_id)

        # P1-2: 加载 subtask 独立 state（首次为 None，框架自动创建新 state）
        state = await self._load_subtask_state(subtask_state_key)

        model = _create_llm_model(provider, agent_config.model)
        dialog_agent = DialogAgent(
            name=agent_config.name,
            sys_prompt=agent_config.system_prompt,
            model=model,
            # 不传 skill_names：非流式执行路径不支持工具调用（工具仅在 execute_streaming_with_tools 中由 ToolManager 处理）。
            # 传入 agent_config.tools 会被 AgentScope 作为内置 Skill 注册，导致 Gemini thought_signature 报错。
            skill_names=None,
            state=state,
        )

        input_content = messages[-1]["content"] if messages else ""
        input_msg = UserMsg(name="User", content=input_content)
        input_chars = sum(len(m.get("content", "")) for m in messages)

        logger.info(
            "Executing subtask agent '%s' (ID: %s, state_key=%s, resumed=%s)",
            agent_config.name, agent_id, subtask_state_key, state is not None,
        )
        response_msg = await dialog_agent.reply(input_msg)
        content_str = _normalize_content(response_msg.content)

        # P1-2: 保存回 L2 供下次 rework 读取
        await self._save_subtask_state(subtask_state_key, dialog_agent)

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
                "subtask_state_key": subtask_state_key,
                "state_resumed": state is not None,
                "context": context,
            },
        )

    def _create_model(self, provider: LLMProvider, model_name: str):
        """Backward-compat instance method; delegates to module-level factory."""
        return _create_llm_model(provider, model_name)

    def clear_cache(self):
        """Clear agent and model caches (admin endpoint)."""
        self._model_cache.clear()
        self._agent_cache.clear()
        self._cache_locks.clear()


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


async def _evict_model_pricing(key: str) -> None:
    """响应 model_pricing 频道失效事件，清理本进程 _PRICING_CACHE。

    key 格式："{provider_id}::{model}" 或 "{provider_id}::*"（通配）。
    """
    from services.billing import invalidate_pricing_cache

    parts = key.split("::", 1)
    provider_id = parts[0] if parts and parts[0] != "*" else None
    model = parts[1] if len(parts) > 1 and parts[1] != "*" else None
    invalidate_pricing_cache(provider_id, model)


_INVALIDATION_HANDLERS = {
    channel_invalidate("provider"): _evict_provider,
    channel_invalidate("agent"): _evict_agent,
    channel_invalidate("model_pricing"): _evict_model_pricing,
}


async def start_invalidation_listener() -> None:
    """后台任务：订阅失效频道，收到后清 L1/L2。未连 Redis 立刻返回。"""
    channels = list(_INVALIDATION_HANDLERS.keys())
    async for ch, payload in subscribe(*channels):
        handler = _INVALIDATION_HANDLERS.get(ch)
        key = isinstance(payload, dict) and payload.get("key")
        handler and key and await handler(key)
