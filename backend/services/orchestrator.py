"""
Dynamic Multi-Agent Orchestration System

Unified architecture: Leader agent analyzes tasks in a single LLM call,
dispatching simple tasks directly and decomposing complex tasks to sub-agents.

P0 硬伤修复（本文件）：
- P0-1 真正的取消语义：模块级 asyncio.Task 注册表 + CancelledError 全链路清理。
- P0-2 结构化输出：pydantic 强校验 + 修复循环，避免 JSON find/rfind 静默降级。
- P0-3 依赖引用：LLM 输出稳定 key（T1/T2…）而非数组 index。
- P0-4 评审策略分层：final_only（默认）/ per_subtask / threshold / disabled。
- P0-5 移除 (_ for _ in ()).throw(...) 反模式，改为普通 raise。
- P0-6 rework 提示词英文化。
"""
from typing import Dict, Any, List, Optional, AsyncGenerator, Type
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update as sa_update, func as sa_func
import asyncio
import json
import logging

from pydantic import BaseModel, Field as PydField, ValidationError, ConfigDict

from models import Agent, TaskExecution, SubTask, User, CreditTransaction
from services.agent_executor import AgentExecutor, ExecutionResult
from services.billing import calculate_credit_cost, InsufficientCreditsError, BalanceFrozenError, load_pricing
from services.billing_policy import BillingPolicy, get_default_billing_policy
from services.llm_stream import StreamResult
from database import AsyncSessionLocal, safe_flush, safe_commit
from services.tool_manager import ToolManager
from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)


# =============================================================================
# Harness: Constants & Output Validation
# =============================================================================

MAX_SUBTASK_RETRIES = 3          # 熔断上限：单子任务最多重试次数
MIN_VALID_OUTPUT_LENGTH = 2      # 输出最小有效长度（排除空白/无意义响应）
MAX_REWORK_ITERATIONS = 2        # 单子任务最大退回重做次数（Leader 评审不通过时）
QUALITY_THRESHOLD_SCORE = 6      # 评审分数阈值（>=6 通过）
ENABLE_DEPENDENCY_SUMMARY = True  # 是否启用依赖摘要（关闭则传原文）

# P0-2: pydantic 修复循环最大重试（一次失败即重试；再失败降级为简单任务）
MAX_ANALYSIS_REPAIR_ATTEMPTS = 2

# P0-4: 评审策略枚举 —— Agent.review_policy 与本地兜底共用
REVIEW_POLICY_DISABLED = "disabled"           # 完全不评审
REVIEW_POLICY_FINAL_ONLY = "final_only"        # 默认：仅 Leader 整合阶段做一次评审
REVIEW_POLICY_PER_SUBTASK = "per_subtask"      # 每个 subtask 单独评审（历史行为，成本高）
REVIEW_POLICY_THRESHOLD = "threshold_based"    # 复杂任务 (>=3 subtasks) 才逐条评审

_VALID_REVIEW_POLICIES: set[str] = {
    REVIEW_POLICY_DISABLED,
    REVIEW_POLICY_FINAL_ONLY,
    REVIEW_POLICY_PER_SUBTASK,
    REVIEW_POLICY_THRESHOLD,
}
DEFAULT_REVIEW_POLICY = REVIEW_POLICY_FINAL_ONLY
THRESHOLD_POLICY_MIN_SUBTASKS = 3  # threshold_based 触发逐条评审的下限


def resolve_review_policy(leader: Agent) -> str:
    """根据 leader.review_policy + enable_auto_review 兜底出实际生效的策略。

    优先级：
    - enable_auto_review == False → disabled
    - review_policy 有效 → 使用配置值
    - 否则 → DEFAULT_REVIEW_POLICY (final_only)
    """
    if getattr(leader, "enable_auto_review", True) is False:
        return REVIEW_POLICY_DISABLED
    configured = getattr(leader, "review_policy", None)
    return configured if configured in _VALID_REVIEW_POLICIES else DEFAULT_REVIEW_POLICY


class OutputValidationError(Exception):
    """Agent 输出未通过结构化校验"""
    pass


class CircuitBreakerError(Exception):
    """子任务重试达到熔断上限"""
    def __init__(self, subtask_id: str, retries: int):
        self.subtask_id = subtask_id
        self.retries = retries
        super().__init__(f"Circuit breaker triggered: subtask {subtask_id} failed after {retries} retries")


class AnalysisParseError(Exception):
    """Leader 分析输出多轮修复后仍无法解析"""
    pass


# 输出校验规则注册表 —— 映射表驱动，便于扩展
# 每条规则: (校验函数, 失败描述模板)
_OUTPUT_VALIDATORS = [
    (
        lambda content: len(content.strip()) >= MIN_VALID_OUTPUT_LENGTH,
        "Output too short or empty (length={length}, min={min})",
    ),
    (
        lambda content: not content.strip().startswith('{"error"'),
        "Output appears to be an error object",
    ),
]


def validate_output(content: str) -> tuple[bool, str]:
    """
    对 Agent 输出执行结构化校验。
    Returns: (is_valid, error_message)
    """
    for validator_fn, desc_template in _OUTPUT_VALIDATORS:
        passed = validator_fn(content)
        if not passed:
            msg = desc_template.format(
                length=len(content.strip()),
                min=MIN_VALID_OUTPUT_LENGTH,
            )
            return False, msg
    return True, ""


# =============================================================================
# P0-1: Cancellation Registry
# =============================================================================
#
# routers/orchestrate.py 在 execute_orchestration 消费生成器前把当前 request task
# 注册进来；DELETE /orchestrate/{id} 通过 task_execution_id 取回 task 并 cancel。
# DynamicOrchestrator.execute 内部捕获 CancelledError 做数据库状态清理与
# 语义化事件（task_cancelled）落库。

_TASK_REGISTRY: Dict[str, asyncio.Task] = {}
_REGISTRY_LOCK = asyncio.Lock()


async def register_task(task_execution_id: str, task: asyncio.Task) -> None:
    async with _REGISTRY_LOCK:
        _TASK_REGISTRY[task_execution_id] = task


async def unregister_task(task_execution_id: str) -> None:
    async with _REGISTRY_LOCK:
        _TASK_REGISTRY.pop(task_execution_id, None)


async def cancel_task(task_execution_id: str) -> bool:
    """请求取消一个运行中的 task_execution。

    Returns:
        True  — 找到对应 task 且已发起 cancel（可能尚未完成传播）
        False — 未注册 / 已完成 / 已被取消
    """
    async with _REGISTRY_LOCK:
        task = _TASK_REGISTRY.get(task_execution_id)
    if not task or task.done():
        return False
    task.cancel()
    return True


# =============================================================================
# P0-2 / P0-3: LLM Analysis Schema (pydantic)
# =============================================================================
#
# LLM 输出的 JSON 由 pydantic 强校验；失败时把 ValidationError 明细回喂给 LLM 做修复。
# subtasks[*].id 是稳定 key（如 T1/T2/T3），depends_on 引用 id 而非数组 index。

class _AnalysisSubtaskSchema(BaseModel):
    """LLM 输出的单个 subtask —— 使用稳定 key，避免 index 引用错乱"""
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")

    id: str = PydField(..., min_length=1, description="Stable key for this subtask, e.g., T1/T2/T3")
    agent_id: str = PydField(..., min_length=1, description="Member agent ID to execute this subtask")
    description: str = PydField(..., min_length=1)
    depends_on: List[str] = PydField(default_factory=list, description="List of subtask ids this depends on")


class _AnalysisSchema(BaseModel):
    """Leader 分析输出 —— pydantic 强校验，取代原先的 find/rfind 提取"""
    model_config = ConfigDict(extra="ignore")

    is_simple: bool
    direct_response: Optional[str] = None
    subtasks: Optional[List[_AnalysisSubtaskSchema]] = None
    review_criteria: Optional[str] = ""


def _extract_json_object(raw: str) -> str:
    """从 LLM 原文中截取首个 {...} JSON 对象；找不到时返回原文。"""
    stripped = (raw or "").strip()
    # 兼容 ```json ... ``` 包裹
    stripped.startswith("```") and (stripped := stripped.strip("`").lstrip("json").strip())
    start = stripped.find("{")
    end = stripped.rfind("}") + 1
    return stripped[start:end] if (start >= 0 and end > start) else stripped


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class SubTaskSpec:
    """Specification for a subtask from leader's decomposition.

    P0-3: ``key`` 是 LLM 输出的稳定标识（如 T1/T2），``depends_on`` 引用其他 subtask 的 key。
    ``order_index`` 由服务端按 subtasks 数组顺序赋值，仅用于持久化到 SubTask.order_index。
    """
    key: str = ""
    agent_id: str = ""
    description: str = ""
    depends_on: List[str] = field(default_factory=list)  # subtask keys, not array indices
    order_index: int = 0


@dataclass
class TaskAnalysis:
    """Result of leader's unified task analysis (simple/complex + optional decomposition)"""
    is_simple: bool
    direct_response: str = ""
    subtasks: List[SubTaskSpec] = field(default_factory=list)
    review_criteria: str = ""
    analysis_input_tokens: int = 0
    analysis_output_tokens: int = 0


@dataclass
class OrchestrationEvent:
    """Event for streaming progress updates"""
    event_type: str
    data: Dict[str, Any]

    def to_sse(self) -> str:
        """Format as Server-Sent Event"""
        return f"event: {self.event_type}\ndata: {json.dumps(self.data)}\n\n"


# =============================================================================
# Base Strategy
# =============================================================================

class CollaborationStrategy(ABC):
    """Abstract base class for collaboration strategies"""

    def __init__(
        self,
        db: AsyncSession,
        executor: AgentExecutor,
        task_execution: TaskExecution,
        leader: Agent,
        members: Dict[str, Agent],
        history_messages: Optional[List[Dict[str, str]]] = None,
        theater_id: Optional[str] = None,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        is_admin: bool = False,
    ):
        self.db = db
        self.executor = executor
        self.task_execution = task_execution
        self.leader = leader
        self.members = members  # agent_id -> Agent
        self.history_messages = history_messages or []
        self.theater_id = theater_id
        self.session_id = session_id
        self.user_id = user_id
        self.is_admin = is_admin
        # Lock to serialize DB flush in parallel subtask execution
        # (asyncio.gather shares one session; concurrent flush → "Session is already flushing")
        self._db_lock = asyncio.Lock()

    async def _flush(self) -> None:
        """Flush DB session with lock to prevent concurrent flush errors in parallel execution."""
        async with self._db_lock:
            await safe_flush(self.db)

    @abstractmethod
    async def execute(
        self,
        analysis: TaskAnalysis,
        user_input: str
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """Execute the collaboration strategy, yielding events"""
        pass

    async def create_subtask_record(
        self,
        spec: SubTaskSpec,
        parent_id: Optional[str] = None
    ) -> SubTask:
        """Create SubTask record in database"""
        subtask = SubTask(
            task_execution_id=self.task_execution.id,
            agent_id=spec.agent_id,
            parent_subtask_id=parent_id,
            description=spec.description,
            order_index=spec.order_index,
            status="pending"
        )
        self.db.add(subtask)
        await self._flush()
        return subtask

    async def execute_subtask(self, subtask: SubTask, input_content: str) -> ExecutionResult:
        """
        Execute a single subtask (non-streaming) with output validation and circuit breaker.
        Retries up to MAX_SUBTASK_RETRIES on failure or invalid output.

        上下文隔离：子 agent 仅接收任务描述，不传入对话历史。

        P1-2: 使用 ``execute_for_subtask`` 以 (task_execution_id, subtask_id) 为维度持久化
        AgentState，使 rework/重试之间 worker 保留上下文记忆。
        """
        messages = [{"role": "user", "content": input_content}]
        state_key = f"{self.task_execution.id}:{subtask.id}"
        last_error = None

        while subtask.retry_count < MAX_SUBTASK_RETRIES:
            subtask.status = "running"
            await self._flush()

            try:
                result = await self.executor.execute_for_subtask(
                    agent_id=subtask.agent_id,
                    messages=messages,
                    subtask_state_key=state_key,
                    context={"subtask_id": subtask.id, "attempt": subtask.retry_count + 1}
                )

                # Harness: output validation (P0-5: 普通 raise 取代生成器反模式)
                is_valid, validation_msg = validate_output(result.content)
                if not is_valid:
                    raise OutputValidationError(validation_msg)

                subtask.status = "completed"
                subtask.output_data = {"content": result.content}
                subtask.input_tokens = result.input_tokens
                subtask.output_tokens = result.output_tokens
                subtask.completed_at = sa_func.now()

                agent = self.members.get(subtask.agent_id)
                _target = agent or self.leader
                _rate_map = await load_pricing(getattr(_target, 'provider_id', None), getattr(_target, 'model', None), self.db)
                subtask.credit_cost, _ = calculate_credit_cost(result, _rate_map, agent=_target)

                await self._flush()
                return result

            except Exception as e:
                subtask.retry_count += 1
                last_error = e
                logger.warning(
                    f"Subtask {subtask.id} attempt {subtask.retry_count}/{MAX_SUBTASK_RETRIES} failed: {e}"
                )
                await self._flush()

        # Circuit breaker: exhausted retries
        subtask.status = "failed"
        subtask.error_message = f"Circuit breaker: {last_error}"
        await self._flush()
        raise CircuitBreakerError(subtask.id, subtask.retry_count)

    async def execute_subtask_streaming(
        self, subtask: SubTask, input_content: str
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """
        Execute a subtask with streaming + tool support + output validation + circuit breaker.
        First attempt streams in real-time; retries fall back to non-streaming
        to avoid duplicate chunk events.

        上下文隔离：子 agent 仅接收任务描述，不传入对话历史。
        """
        agent = self.members.get(subtask.agent_id) or self.leader
        agent_name = agent.name
        messages = [{"role": "user", "content": input_content}]

        # Build tool definitions for the sub-agent
        # Pre-populate loaded_tool_skills to bypass skill-gate (no load_skill flow in multi-agent)
        # P1-3: 以 sub-agent 自己的 permission_mode 构建 ToolContext（而非 leader），
        # 使得 EXPLORE 型的 worker 不能调用写入工具，即使 leader 是 BYPASS。
        tool_manager = ToolManager()
        ctx = ToolContext(
            theater_id=self.theater_id, agent=agent, db=self.db,
            session_id=self.session_id, user_id=self.user_id, is_admin=self.is_admin,
            loaded_tool_skills=set(agent.tools or []),
            permission_mode=(getattr(agent, "permission_mode", None) or "default"),
            sequential_tools=True,  # 多智能体子任务队列模式，避免并发工具调用竞争
        )
        tool_defs = await tool_manager.build_tool_defs(ctx)
        max_rounds = max(10, min(200, agent.max_tool_rounds or 100))

        # --- First attempt: streaming with tools ---
        subtask.status = "running"
        await self._flush()

        yield OrchestrationEvent("subtask_started", {
            "subtask_id": subtask.id,
            "agent_name": agent_name,
        })

        try:
            last_result: Optional[StreamResult] = None
            async for event_type, event_data, result in self.executor.execute_streaming_with_tools(
                agent_id=subtask.agent_id,
                messages=messages,
                tool_manager=tool_manager,
                tool_context=ctx,
                tools=tool_defs,
                max_tool_rounds=max_rounds,
                user_id=self.user_id,
            ):
                # Route events to OrchestrationEvents
                _event_map = {
                    "chunk": lambda: OrchestrationEvent("subtask_chunk", {
                        "subtask_id": subtask.id,
                        "chunk": event_data,
                    }),
                    "tool_call": lambda: OrchestrationEvent("subtask_tool_call", {
                        "subtask_id": subtask.id,
                        **event_data,
                    }),
                    "tool_result": lambda: OrchestrationEvent("subtask_tool_result", {
                        "subtask_id": subtask.id,
                        **event_data,
                    }),
                    "heartbeat": lambda: OrchestrationEvent("heartbeat", {}),
                }
                if event_type == "chunk":
                    last_result = result
                handler = _event_map.get(event_type)
                handler and (yield handler())

            full_content = last_result.full_response if last_result else ""

            # Harness: validate streaming output (P0-5)
            is_valid, validation_msg = validate_output(full_content)
            if not is_valid:
                raise OutputValidationError(validation_msg)

            # Success — record results
            subtask.status = "completed"
            subtask.output_data = {
                "content": full_content,
                "text_output_tokens": last_result.text_output_tokens,
                "image_output_tokens": last_result.image_output_tokens,
                "search_count": last_result.search_query_count,
            }
            subtask.input_tokens = last_result.input_tokens if last_result else 0
            subtask.output_tokens = last_result.output_tokens if last_result else 0
            subtask.completed_at = sa_func.now()
            _target = agent or self.leader
            _rate_map = await load_pricing(getattr(_target, 'provider_id', None), getattr(_target, 'model', None), self.db)
            subtask.credit_cost, _ = calculate_credit_cost(last_result, _rate_map, agent=_target)
            await self._flush()

            subtask._streaming_result = ExecutionResult(
                content=full_content,
                input_tokens=subtask.input_tokens,
                output_tokens=subtask.output_tokens,
                input_chars=len(input_content),
                output_chars=len(full_content),
                metadata={"agent_id": subtask.agent_id, "agent_name": agent_name}
            )

            yield OrchestrationEvent("subtask_completed", {
                "subtask_id": subtask.id,
                "agent_name": agent_name,
                "description": subtask.description,
                "status": "completed",
                "tokens": {"input": subtask.input_tokens, "output": subtask.output_tokens},
                "result": full_content,
            })
            return

        except Exception as e:
            subtask.retry_count += 1
            logger.warning(
                f"Subtask {subtask.id} streaming attempt 1/{MAX_SUBTASK_RETRIES} failed: {e}"
            )
            await self._flush()

        # --- Retry attempts: non-streaming fallback to avoid duplicate chunks ---
        while subtask.retry_count < MAX_SUBTASK_RETRIES:
            subtask.status = "running"
            await self._flush()

            yield OrchestrationEvent("subtask_retry", {
                "subtask_id": subtask.id,
                "attempt": subtask.retry_count + 1,
                "max_retries": MAX_SUBTASK_RETRIES,
            })

            try:
                # P1-2: retry 属于同一 subtask，使用相同 state_key 保留上下文
                result = await self.executor.execute_for_subtask(
                    agent_id=subtask.agent_id,
                    messages=messages,
                    subtask_state_key=f"{self.task_execution.id}:{subtask.id}",
                    context={"subtask_id": subtask.id, "attempt": subtask.retry_count + 1}
                )

                is_valid, validation_msg = validate_output(result.content)
                if not is_valid:
                    raise OutputValidationError(validation_msg)

                subtask.status = "completed"
                subtask.output_data = {"content": result.content}
                subtask.input_tokens = result.input_tokens
                subtask.output_tokens = result.output_tokens
                subtask.completed_at = sa_func.now()
                _target = agent or self.leader
                _rate_map = await load_pricing(getattr(_target, 'provider_id', None), getattr(_target, 'model', None), self.db)
                subtask.credit_cost, _ = calculate_credit_cost(result, _rate_map, agent=_target)
                await self._flush()

                subtask._streaming_result = ExecutionResult(
                    content=result.content,
                    input_tokens=result.input_tokens,
                    output_tokens=result.output_tokens,
                    input_chars=len(input_content),
                    output_chars=len(result.content),
                    metadata={"agent_id": subtask.agent_id, "agent_name": agent_name}
                )

                # Send full result as single chunk for frontend compatibility
                yield OrchestrationEvent("subtask_chunk", {
                    "subtask_id": subtask.id,
                    "chunk": result.content,
                })
                yield OrchestrationEvent("subtask_completed", {
                    "subtask_id": subtask.id,
                    "agent_name": agent_name,
                    "description": subtask.description,
                    "status": "completed",
                    "tokens": {"input": result.input_tokens, "output": result.output_tokens},
                    "result": result.content,
                    "retried": True,
                })
                return

            except Exception as e:
                subtask.retry_count += 1
                logger.warning(
                    f"Subtask {subtask.id} attempt {subtask.retry_count}/{MAX_SUBTASK_RETRIES} failed: {e}"
                )
                await self._flush()

        # Circuit breaker: all retries exhausted
        subtask.status = "failed"
        subtask.error_message = f"Circuit breaker: max retries ({MAX_SUBTASK_RETRIES}) exhausted"
        await self._flush()

        subtask._streaming_result = ExecutionResult(content="", metadata={"error": subtask.error_message})

        yield OrchestrationEvent("subtask_failed", {
            "subtask_id": subtask.id,
            "error": subtask.error_message,
            "circuit_breaker": True,
            "retries": subtask.retry_count,
        })

    # -------------------------------------------------------------------------
    # Leader 质量评审：对子任务结果做质量判断
    # -------------------------------------------------------------------------

    async def _evaluate_subtask_result(
        self,
        subtask_description: str,
        output_content: str,
        user_request: str,
    ) -> tuple[bool, str, int]:
        """Leader 评审子任务结果质量。

        Returns: (approved, feedback, score)
        """
        eval_prompt = f"""You are reviewing a subtask result. Evaluate whether the output satisfies the requirement.

## User's Original Request
{user_request}

## Subtask Description
{subtask_description}

## Subtask Output
{output_content[:3000]}

## Instructions
Evaluate the output quality. Respond in JSON format ONLY:
{{{{
  "approved": true/false,
  "score": 0-10,
  "feedback": "specific improvement suggestions if not approved, empty string if approved"
}}}}

Scoring criteria:
- 8-10: Excellent, fully meets requirements
- 6-7: Acceptable, meets core requirements
- 4-5: Partially meets requirements, needs improvement
- 0-3: Does not meet requirements, needs rework"""

        try:
            result = await self.executor.execute(
                agent_id=self.leader.id,
                messages=[{"role": "user", "content": eval_prompt}],
                context={"task": "evaluate_subtask"}
            )

            content = result.content.strip()
            start = content.find("{")
            end = content.rfind("}") + 1
            (start >= 0 and end > start) and (content := content[start:end])

            data = json.loads(content)
            approved = data.get("approved", True)
            score = int(data.get("score", 7))
            feedback = data.get("feedback", "")

            # 使用分数阈值作为最终判断
            approved = approved and score >= QUALITY_THRESHOLD_SCORE
            return approved, feedback, score

        except Exception as exc:
            logger.warning("Leader evaluation failed: %s; defaulting to approved", exc)
            return True, "", 7

    # -------------------------------------------------------------------------
    # 依赖摘要：Leader 控制前序任务输出传递给后续任务的内容
    # -------------------------------------------------------------------------

    async def _summarize_dependency_output(
        self,
        dependency_outputs: list[str],
        next_task_description: str,
    ) -> str:
        """Leader 对前序任务输出做摘要，提取后续任务真正需要的关键信息。"""
        if not ENABLE_DEPENDENCY_SUMMARY:
            return "\n\n".join(dependency_outputs)

        combined = "\n\n---\n\n".join(dependency_outputs)
        summary_prompt = f"""Extract ONLY the key information from the previous task outputs that is relevant and necessary for completing the next task.

## Previous Task Outputs
{combined[:4000]}

## Next Task to Complete
{next_task_description}

## Instructions
Provide a concise summary containing ONLY the facts, data, decisions, or context that the next task needs. Do not add opinions or suggestions. Be brief and factual."""

        try:
            result = await self.executor.execute(
                agent_id=self.leader.id,
                messages=[{"role": "user", "content": summary_prompt}],
                context={"task": "summarize_dependency"}
            )
            return result.content
        except Exception as exc:
            logger.warning("Dependency summarization failed: %s; passing raw output", exc)
            return "\n\n".join(dependency_outputs)


# =============================================================================
# Unified Strategy (dependency-based execution)
# =============================================================================

class UnifiedStrategy(CollaborationStrategy):
    """
    Unified execution strategy with dependency-based scheduling.
    Tasks at the same dependency level with no interdependencies
    execute concurrently; sequential tasks stream in real-time.
    """

    async def execute(
        self,
        analysis: TaskAnalysis,
        user_input: str
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        # P0-4: 根据 Leader 配置确定评审策略（默认 final_only）
        policy = resolve_review_policy(self.leader)

        # Build dependency graph (P0-3: 依赖用稳定 key，而非数组 index)
        subtask_map: Dict[str, SubTask] = {}
        spec_map: Dict[str, SubTaskSpec] = {}
        key_to_subtask_id: Dict[str, str] = {}

        for i, spec in enumerate(analysis.subtasks):
            spec.order_index = i
            # 兜底：旧数据或 LLM 没输出 key 时，使用 T{i+1} 作为自动 key
            spec.key = spec.key or f"T{i + 1}"
            subtask = await self.create_subtask_record(spec)
            subtask_map[subtask.id] = subtask
            spec_map[subtask.id] = spec
            key_to_subtask_id[spec.key] = subtask.id
            agent = self.members.get(spec.agent_id, self.leader)
            yield OrchestrationEvent("subtask_created", {
                "subtask_id": subtask.id,
                "key": spec.key,
                "agent": agent.name,
                "description": spec.description,
                "depends_on": spec.depends_on,
            })

        # Resolve key-based depends_on → subtask IDs（未知 key 静默丢弃，避免脉断图）
        resolved_deps: Dict[str, list] = {}
        for sid, spec in spec_map.items():
            resolved_deps[sid] = [
                key_to_subtask_id[dep_key]
                for dep_key in spec.depends_on
                if dep_key in key_to_subtask_id
            ]

        # Execute in dependency order with Leader quality evaluation
        completed_outputs: Dict[str, str] = {}
        pending = list(subtask_map.keys())

        # P0-4: threshold_based 根据 subtask 总数拐到 per_subtask 或 disabled
        review_per_subtask = (
            policy == REVIEW_POLICY_PER_SUBTASK
            or (policy == REVIEW_POLICY_THRESHOLD and len(analysis.subtasks) >= THRESHOLD_POLICY_MIN_SUBTASKS)
        )

        while pending:
            ready = [
                sid for sid in pending
                if all(dep in completed_outputs for dep in resolved_deps[sid])
            ]

            # Build (subtask, input) pairs for ready tasks
            ready_tasks = []
            for sid in ready:
                subtask = subtask_map[sid]
                spec = spec_map[sid]
                dep_outputs = [completed_outputs[dep] for dep in resolved_deps[sid]]

                # 依赖传递由 Leader 控制：摘要而非原文；无依赖时直接用任务描述
                task_input = spec.description
                if dep_outputs:
                    summarized = await self._summarize_dependency_output(
                        dep_outputs, spec.description
                    )
                    task_input = f"## Background Context\n{summarized}\n\n## Your Task\n{spec.description}"

                ready_tasks.append((subtask, task_input))

            # 统一使用流式+工具路径执行子任务（顺序），确保所有子任务均可调用工具
            # 此前的 batch 并行模式会导致子智能体丢失工具能力（generate_image 等）
            batch_results: Dict[str, str] = {}
            async for event in self._execute_single_streaming(ready_tasks, batch_results):
                yield event

            # P0-4: 仅在 per_subtask / threshold(命中) 时才逐条评审
            # final_only / disabled 跳过本循环，直接採纳 batch_results
            for sid in ready:
                subtask = subtask_map[sid]
                spec = spec_map[sid]
                output = batch_results.get(sid, "")

                # 无输出（失败）→ 跳过评审
                if not output:
                    pending.remove(sid)
                    continue

                # 非逐条评审策略→ 直接採纳，无 rework
                if not review_per_subtask:
                    completed_outputs[sid] = output
                    pending.remove(sid)
                    continue

                # 评审循环（仅 per_subtask / threshold 命中）
                rework_count = 0
                current_output = output
                while rework_count < MAX_REWORK_ITERATIONS:
                    agent = self.members.get(subtask.agent_id) or self.leader
                    yield OrchestrationEvent("subtask_evaluating", {
                        "subtask_id": sid,
                        "agent_name": agent.name,
                    })

                    approved, feedback, score = await self._evaluate_subtask_result(
                        subtask_description=spec.description,
                        output_content=current_output,
                        user_request=user_input,
                    )

                    if approved:
                        yield OrchestrationEvent("subtask_approved", {
                            "subtask_id": sid,
                            "score": score,
                        })
                        break

                    # 评审不通过 → 退回重做
                    rework_count += 1
                    yield OrchestrationEvent("subtask_rework", {
                        "subtask_id": sid,
                        "feedback": feedback,
                        "attempt": rework_count,
                        "score": score,
                    })

                    # P0-6: 退回提示词英文化，与项目其他 prompt 保持一致
                    rework_content = (
                        f"## Original Task\n{spec.description}\n\n"
                        f"## Your Previous Output\n{current_output[:3000]}\n\n"
                        f"## Reviewer Feedback\n{feedback}\n\n"
                        f"Please revise your work to address the feedback above and deliver a complete, improved result."
                    )
                    rework_messages = [{"role": "user", "content": rework_content}]

                    # 执行重做
                    # P1-2: rework 仍属于同一 subtask，使用相同 state_key —— worker 将自然看到自己上次的对话历史
                    try:
                        rework_result = await self.executor.execute_for_subtask(
                            agent_id=subtask.agent_id,
                            messages=rework_messages,
                            subtask_state_key=f"{self.task_execution.id}:{subtask.id}",
                            context={"subtask_id": sid, "rework": rework_count}
                        )
                        current_output = rework_result.content

                        # 发送重做结果给前端
                        yield OrchestrationEvent("subtask_chunk", {
                            "subtask_id": sid,
                            "chunk": current_output,
                        })
                    except Exception as rework_exc:
                        logger.warning("Rework attempt %d for subtask %s failed: %s", rework_count, sid, rework_exc)
                        break

                # 将最终输出记录为已完成
                completed_outputs[sid] = current_output
                pending.remove(sid)

        yield OrchestrationEvent("subtasks_completed", {
            "completed_count": len(completed_outputs)
        })

    async def _execute_batch(
        self,
        ready_tasks: List[tuple],
        completed_outputs: Dict[str, str]
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """
        Execute multiple ready tasks in parallel (non-streaming).
        Each execute_subtask() internally handles retries + circuit breaker.
        """
        # Emit started events
        for subtask, _ in ready_tasks:
            agent = self.members.get(subtask.agent_id)
            agent_name = agent.name if agent else self.leader.name
            yield OrchestrationEvent("subtask_started", {
                "subtask_id": subtask.id,
                "agent_name": agent_name,
            })

        # Parallel execution (retries happen inside execute_subtask)
        results = await asyncio.gather(*[
            self.execute_subtask(subtask, task_input)
            for subtask, task_input in ready_tasks
        ], return_exceptions=True)

        for (subtask, _), result in zip(ready_tasks, results):
            agent = self.members.get(subtask.agent_id)
            agent_name = agent.name if agent else self.leader.name

            is_error = isinstance(result, BaseException)
            is_circuit_break = isinstance(result, CircuitBreakerError)

            _event_builders = {
                True: lambda: OrchestrationEvent("subtask_failed", {
                    "subtask_id": subtask.id,
                    "error": str(result),
                    "circuit_breaker": is_circuit_break,
                    "retries": subtask.retry_count,
                }),
                False: lambda: OrchestrationEvent("subtask_completed", {
                    "subtask_id": subtask.id,
                    "agent_name": agent_name,
                    "description": subtask.description,
                    "status": "completed",
                    "tokens": {"input": result.input_tokens, "output": result.output_tokens},
                    "result": result.content,
                    "retried": subtask.retry_count > 0,
                }),
            }
            yield _event_builders[is_error]()
            is_error or completed_outputs.__setitem__(subtask.id, result.content)

    async def _execute_single_streaming(
        self,
        ready_tasks: List[tuple],
        completed_outputs: Dict[str, str]
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """
        Execute a single task with streaming.
        Retries and circuit breaker are handled inside execute_subtask_streaming.
        """
        for subtask, task_input in ready_tasks:
            async for event in self.execute_subtask_streaming(subtask, task_input):
                yield event
            result = getattr(subtask, "_streaming_result", None)
            # Only populate completed_outputs when subtask actually succeeded
            (result and result.content) and completed_outputs.__setitem__(subtask.id, result.content)


# =============================================================================
# Task Analysis Prompt
# =============================================================================

TASK_ANALYSIS_INSTRUCTION = """你是一个智能任务协调者。请分析用户的需求，判断这是一个简单任务还是复杂任务，然后给出相应的处理方案。

## 你的团队成员
{member_agents_list}
{history_context}
## 判断标准
- **简单任务**：问候、闲聊、事实性问答、单一领域的简单问题、不需要多个专业角色协作的任务
- **复杂任务**：需要多个步骤、多个专业角色协作、跨领域分析、内容创作（如写故事+设计角色+绘制分镜）等
- **重要**：当用户的需求明确属于某个团队成员的专长领域（如图像生成、视觉设计等），应该分派给该成员执行，视为复杂任务

## 输出格式
请以 JSON 格式输出分析结果（严格 JSON，不要 markdown 包裹，不要任何翻译或备注）。

### 简单任务示例
{{
  "is_simple": true,
  "direct_response": "你的完整回答内容（高质量、完整的回复）",
  "subtasks": null,
  "review_criteria": null
}}

### 复杂任务示例（重点：depends_on 引用其他子任务的 id，不是数组下标）
{{
  "is_simple": false,
  "direct_response": null,
  "subtasks": [
    {{"id": "T1", "agent_id": "成员智能体的ID", "description": "子任务描述", "depends_on": []}},
    {{"id": "T2", "agent_id": "成员智能体的ID", "description": "子任务描述", "depends_on": ["T1"]}},
    {{"id": "T3", "agent_id": "成员智能体的ID", "description": "子任务描述", "depends_on": ["T1", "T2"]}}
  ],
  "review_criteria": "最终审查标准"
}}

## 字段要求
- 简单任务时，direct_response 必须是完整、高质量的回复，将直接发送给用户
- 复杂任务的子任务必须分配给上面列出的团队成员（使用其ID）
- 每个子任务 **必须** 包含一个稳定的 `id` 字段（建议格式：T1 / T2 / T3，同一任务内不能重复）
- `depends_on` 写入依赖的其他子任务的 **id**（字符串数组），而不是数组下标。无依赖时使用空数组 `[]`
- 你是协调者，复杂任务不要将子任务分配给自己
- 子任务数量不超过 {max_subtasks} 个

## 用户需求
{user_request}"""


# =============================================================================
# Dynamic Orchestrator
# =============================================================================

class DynamicOrchestrator:
    """
    Main orchestration engine.
    Analyzes tasks via leader agent, dispatches simple/complex paths via handler map.

    P1-6: 计费下沉为 ``BillingPolicy``，默认使用 ``KunFlixBillingPolicy``。
    单测时可传入 fake policy 验证扣费行为，无需拉起真实 DB 记账。
    """

    def __init__(
        self,
        db: AsyncSession,
        billing_policy: Optional[BillingPolicy] = None,
    ):
        self.db = db
        self.executor = AgentExecutor(db)
        self.billing_policy: BillingPolicy = billing_policy or get_default_billing_policy()

    async def analyze_task(
        self,
        leader_agent_id: str,
        task_description: str,
        history_messages: Optional[List[Dict[str, str]]] = None,
    ) -> TaskAnalysis:
        """Analyze a task without executing it. Returns classification for routing."""
        leader, members = await self._load_leader_and_members(leader_agent_id)
        return await self._analyze_task(leader, members, task_description, history_messages)

    async def execute(
        self,
        task_description: str,
        user_id: str,
        leader_agent_id: str,
        session_id: Optional[str] = None,
        theater_id: Optional[str] = None,
        max_iterations: int = 3,
        enable_review: bool = True,
        history_messages: Optional[List[Dict[str, str]]] = None,
        pre_analysis: Optional[TaskAnalysis] = None,
        is_admin: bool = False,
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """
        Execute a multi-agent task.
        Yields OrchestrationEvent for streaming progress.

        P0-1: 本方法在开始时将 asyncio.current_task() 注册到 _TASK_REGISTRY，
        以便 DELETE /orchestrate/{id} 端点能真正 cancel 正在运行的协程。
        内部捕获 asyncio.CancelledError 后把 pending/running 子任务标为 cancelled，
        并 yield ``task_cancelled`` 事件。finally 块确保反注册。
        """
        # Store context for tool injection in subtasks
        self._theater_id = theater_id
        self._session_id = session_id
        self._user_id = user_id
        self._is_admin = is_admin

        # 1. Load leader and members
        leader, members = await self._load_leader_and_members(leader_agent_id)

        # 1.5 余额预检查（服务层二次防护）
        # P1-6: 通过 BillingPolicy 调用，保持与既有 check_balance_sufficient 同语义
        try:
            balance_ok = await self.billing_policy.check_estimated_cost(user_id, 0, self.db)
            if not balance_ok:
                yield OrchestrationEvent("task_failed", {"error": "Insufficient credits", "message": "积分余额不足"})
                return
        except BalanceFrozenError:
            yield OrchestrationEvent("task_failed", {"error": "Balance frozen", "message": "账户资金已冻结"})
            return

        # 2. Create TaskExecution record
        task_execution = TaskExecution(
            leader_agent_id=leader_agent_id,
            user_id=user_id,
            session_id=session_id,
            task_description=task_description,
            coordination_mode="unified",
            status="running"
        )
        self.db.add(task_execution)
        await self.db.flush()

        # P0-1: 注册当前 task 到取消注册表（current_task 为 StreamingResponse 内部任务）
        current = asyncio.current_task()
        current and await register_task(task_execution.id, current)

        yield OrchestrationEvent("task_start", {
            "task_execution_id": task_execution.id,
            "leader": leader.name,
            "member_count": len(members)
        })

        try:
            # P1-4: team_tools 编排模式 —— 跳过 analyze，直接 leader ReAct 工具循环
            use_team_tools = (
                getattr(leader, "orchestration_style", None) == "team_tools"
                and (getattr(leader, "sub_agent_template_types", None) or [])
            )

            if use_team_tools:
                yield OrchestrationEvent("task_analyzed", {
                    "is_simple": False,
                    "subtask_count": 0,
                    "orchestration_style": "team_tools",
                })
                final_result = None
                async for event in self._handle_team_tools_task(
                    task_execution=task_execution,
                    leader=leader,
                    task_description=task_description,
                    history_messages=history_messages,
                ):
                    (event.event_type == "task_result") and (final_result := event.data.get("result"))
                    (event.event_type != "task_result") and (yield event)

                # team_tools 路径的 finalize（简化版，无 analysis token 统计）
                analysis = TaskAnalysis(is_simple=False)
            else:
                # legacy_json 路径（原有行为不变）
                # 3. Leader analyzes task (use pre-computed analysis if provided)
                analysis = pre_analysis or await self._analyze_task(leader, members, task_description)

                yield OrchestrationEvent("task_analyzed", {
                    "is_simple": analysis.is_simple,
                    "subtask_count": len(analysis.subtasks)
                })

                # 4. Dispatch via handler map
                _handlers = {
                    True: self._handle_simple_task,
                    False: self._handle_complex_task,
                }
                handler = _handlers[analysis.is_simple]
                final_result = None
                async for event in handler(
                    analysis=analysis,
                    task_execution=task_execution,
                    leader=leader,
                    members=members,
                    task_description=task_description,
                    enable_review=enable_review,
                    history_messages=history_messages,
                ):
                    # Capture final result from the handler
                    (event.event_type == "task_result") and (final_result := event.data.get("result"))
                    # Only yield non-internal events
                    (event.event_type != "task_result") and (yield event)

            # 5. Finalize
            await self._finalize(task_execution, user_id, final_result, analysis)

            yield OrchestrationEvent("task_completed", {
                "task_execution_id": task_execution.id,
                "status": "completed",
                "total_input_tokens": task_execution.total_input_tokens,
                "total_output_tokens": task_execution.total_output_tokens,
                "total_credit_cost": task_execution.total_credit_cost,
                "billing_status": (task_execution.execution_metadata or {}).get("billing_status", "success"),
                "result": final_result,
                "context_usage": {
                    "used_tokens": (task_execution.total_input_tokens or 0) + (task_execution.total_output_tokens or 0),
                    "context_window": leader.context_window,
                },
            })

        except asyncio.CancelledError:
            # P0-1: 取消路径 —— 清理 pending/running 子任务 + 标记 task_execution
            # cleanup 用 shield 包裹，避免 cancel 传播中断 DB 事务
            logger.info("Task %s cancelled by client/admin", task_execution.id)
            try:
                await asyncio.shield(self._handle_cancellation(task_execution, user_id))
            except Exception as cleanup_exc:  # noqa: BLE001
                logger.error("Cancellation cleanup failed for %s: %s", task_execution.id, cleanup_exc)
            # yield 可能因客户端断连进一步抛错，充分防御
            try:
                yield OrchestrationEvent("task_cancelled", {
                    "task_execution_id": task_execution.id,
                    "status": "cancelled",
                })
            except (asyncio.CancelledError, RuntimeError, GeneratorExit):
                pass
            # 不再 re-raise：生成器自然结束
            return

        except Exception as e:
            logger.exception(f"Orchestration failed: {e}")
            task_execution.status = "failed"
            task_execution.execution_metadata = {
                **(task_execution.execution_metadata or {}),
                "error": str(e)
            }
            try:
                await asyncio.shield(safe_commit(self.db))
            except Exception as commit_exc:  # noqa: BLE001
                logger.warning("Commit after orchestration failure failed: %s", commit_exc)

            yield OrchestrationEvent("task_failed", {
                "task_execution_id": task_execution.id,
                "error": str(e)
            })

        finally:
            # P0-1: 无论正常结束/异常/取消，都反注册，避免泄漏
            try:
                await asyncio.shield(unregister_task(task_execution.id))
            except Exception as unreg_exc:  # noqa: BLE001
                logger.debug("unregister_task suppressed: %s", unreg_exc)

    async def _handle_cancellation(
        self,
        task_execution: TaskExecution,
        user_id: str,
    ) -> None:
        """P0-1: 取消路径的数据库清理。
    
        - task_execution.status → cancelled
        - execution_metadata 记录取消时间与 billing_status
        - 将 pending/running 子任务批量改为 cancelled
        - 根据已完成的子任务正常计费（幂等键确保重复取消不会重复扣费）
    
        使用独立 session：当 self.db 因 SQLite lock 等错误被 rollback 后，
        其 transaction 已处于 closed 状态，直接使用会抛 ResourceClosedError。
        新开 session 可确保取消清理不依赖主路径 session 的健康度。
        """
        async with AsyncSessionLocal() as cleanup_db:
            # 1. 重新加载 task_execution（当前传入的实例属于已回滚 session，无法直接写回）
            _te_result = await cleanup_db.execute(
                select(TaskExecution).filter(TaskExecution.id == task_execution.id)
            )
            te = _te_result.scalars().first()
            if not te:
                logger.warning("Cancellation cleanup: task_execution %s not found", task_execution.id)
                return
    
            te.status = "cancelled"
            te.completed_at = sa_func.now()
            te.execution_metadata = {
                **(te.execution_metadata or {}),
                "cancelled": True,
            }
    
            # 2. 批量将 pending/running 的 subtask 标为 cancelled
            await cleanup_db.execute(
                sa_update(SubTask)
                .where(
                    SubTask.task_execution_id == te.id,
                    SubTask.status.in_(["pending", "running"]),
                )
                .values(status="cancelled", completed_at=sa_func.now())
            )
    
            # 3. 按已完成的 subtask 正常计费（保持幂等键 orchestrate:{id}）
            result = await cleanup_db.execute(
                select(SubTask).filter(SubTask.task_execution_id == te.id)
            )
            subtasks = result.scalars().all()
            completed_cost = sum(
                st.credit_cost or 0 for st in subtasks if st.status == "completed"
            )
            te.total_credit_cost = completed_cost
            te.total_input_tokens = sum(
                st.input_tokens or 0 for st in subtasks if st.status == "completed"
            )
            te.total_output_tokens = sum(
                st.output_tokens or 0 for st in subtasks if st.status == "completed"
            )
    
            billing_status = "cancelled"
            if completed_cost > 0:
                try:
                    # P1-6: 通过 BillingPolicy；幂等键与正常完成路径一致，确保重复取消不会重复扣费
                    await self.billing_policy.charge(
                        user_id=user_id,
                        cost=completed_cost,
                        session=cleanup_db,
                        metadata={
                            "task_execution_id": te.id,
                            "reason": "cancelled_partial",
                            "description": f"Cancelled multi-agent task (partial charge): {te.task_description[:100]}",
                        },
                        transaction_type="deduction",
                        idempotency_key=f"orchestrate:{te.id}",
                    )
                    billing_status = "partial"
                except InsufficientCreditsError:
                    billing_status = "insufficient"
                except BalanceFrozenError:
                    billing_status = "frozen"
                except Exception as exc:  # noqa: BLE001
                    billing_status = "error"
                    logger.error("Cancel-path billing failed: %s", exc)
    
            te.execution_metadata = {
                **(te.execution_metadata or {}),
                "billing_status": billing_status,
            }
            await safe_commit(cleanup_db)
    
            # 回写到传入的实例（仅供后续 yield 事件取数用；不影响 DB）
            task_execution.status = te.status
            task_execution.completed_at = te.completed_at
            task_execution.execution_metadata = te.execution_metadata
            task_execution.total_credit_cost = te.total_credit_cost
            task_execution.total_input_tokens = te.total_input_tokens
            task_execution.total_output_tokens = te.total_output_tokens

    # =========================================================================
    # P1-4: team_tools 编排路径
    # =========================================================================

    async def _handle_team_tools_task(
        self,
        task_execution: TaskExecution,
        leader: Agent,
        task_description: str,
        history_messages: Optional[List[Dict[str, str]]] = None,
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """P1-4: 新编排路径 —— Leader 通过 team 工具的 ReAct 循环增量协调 worker。

        Leader 使用 execute_streaming_with_tools 进入工具调用循环；
        每当 leader 调用 team_create / worker_spawn / worker_say / worker_dismiss / team_end 时，
        TeamToolExecutor 内联执行并返回结果；同时 yield TeamEventType 事件到前端。

        team_end 被调用后返回 final_result。
        """
        from services.team_tools import TEAM_TOOL_DEFS, TEAM_TOOL_NAMES, TeamToolExecutor

        available_types = getattr(leader, "sub_agent_template_types", None) or []

        team_executor = TeamToolExecutor(
            db=self.db,
            executor=self.executor,
            task_execution=task_execution,
            leader_name=leader.name,
            leader_agent_id=leader.id,
            available_template_types=available_types,
        )

        # 构建 messages（可携带历史）
        messages: List[Dict[str, str]] = []
        if leader.system_prompt:
            messages.append({"role": "system", "content": leader.system_prompt})
        for m in (history_messages or []):
            messages.append(m)
        messages.append({"role": "user", "content": task_description})

        # 组装 team 工具 + 描述可用蓝图的系统提示补充
        tools_system_note = (
            "\n\n## Available blueprints for worker_spawn:\n"
            + "\n".join(f"- {t}" for t in available_types)
            + "\n\nUse team_create first, then worker_spawn to assign tasks to workers."
            " Call team_end when all work is complete."
        )
        messages[0] and messages[0].get("role") == "system" and messages[0].__setitem__(
            "content", messages[0]["content"] + tools_system_note
        )

        # 进入 tool-call loop
        import json as _json

        async for event_type, event_data, result in self.executor.execute_streaming_with_tools(
            agent_id=leader.id,
            messages=messages,
            tool_manager=None,  # 不使用普通 ToolManager，用自定义 dispatch
            tool_context=None,
            tools=TEAM_TOOL_DEFS,
            max_tool_rounds=20,
            user_id=self._user_id,
        ):
            if event_type == "chunk":
                yield OrchestrationEvent("text", {"chunk": event_data})
            elif event_type == "tool_call":
                tc_name = event_data.get("tool_name", "")
                tc_args = event_data.get("arguments", {})
                # 拦截 team 工具调用 → 内联执行
                if tc_name in TEAM_TOOL_NAMES:
                    tool_result_str, events = await team_executor.execute(tc_name, tc_args)
                    for ev in events:
                        yield ev
                    # team_end 触发后结束
                    if team_executor.ctx.ended:
                        yield OrchestrationEvent("task_result", {"result": team_executor.ctx.final_result or ""})
                        return
                else:
                    yield OrchestrationEvent("subtask_tool_call", event_data)
            elif event_type == "tool_result":
                yield OrchestrationEvent("subtask_tool_result", event_data)
            elif event_type == "heartbeat":
                yield OrchestrationEvent("heartbeat", {})

        # 如果 leader 没有调用 team_end 就结束了（流结束 / max_tool_rounds 耗尽）
        # 用最后一个 worker 的输出或空字符串作为 final_result
        fallback_result = team_executor.ctx.final_result or ""
        if not fallback_result:
            # 尝试拿最后一个 worker 的输出
            workers = list(team_executor.ctx.workers.values())
            fallback_result = workers[-1].last_output if workers else ""
        yield OrchestrationEvent("task_result", {"result": fallback_result})

    async def _handle_simple_task(
        self,
        analysis: TaskAnalysis,
        task_execution: TaskExecution,
        leader: Agent,
        members: Dict[str, Agent],
        task_description: str,
        enable_review: bool,
        history_messages: Optional[List[Dict[str, str]]],
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """Handle simple tasks: stream leader's direct response"""
        response = analysis.direct_response

        # Stream the pre-generated response in chunks
        chunk_size = 50
        for i in range(0, len(response), chunk_size):
            chunk = response[i:i + chunk_size]
            yield OrchestrationEvent("text", {"chunk": chunk})
            await asyncio.sleep(0)

        # Emit internal event to pass result to execute()
        yield OrchestrationEvent("task_result", {"result": response})

    async def _handle_complex_task(
        self,
        analysis: TaskAnalysis,
        task_execution: TaskExecution,
        leader: Agent,
        members: Dict[str, Agent],
        task_description: str,
        enable_review: bool,
        history_messages: Optional[List[Dict[str, str]]],
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """Handle complex tasks: execute subtasks via UnifiedStrategy, optional review"""
        strategy = UnifiedStrategy(
            db=self.db,
            executor=self.executor,
            task_execution=task_execution,
            leader=leader,
            members=members,
            history_messages=history_messages or [],
            theater_id=self._theater_id,
            session_id=self._session_id,
            user_id=self._user_id,
            is_admin=self._is_admin,
        )

        async for event in strategy.execute(analysis, task_description):
            yield event

        # P0-4: 基于 review_policy 判断是否需要最终整合评审
        # disabled → 不做最终整合，直接用最后一个 subtask 输出
        # 其他 → leader 整合输出（即使是 final_only，Leader review 也是必需的）
        review_enabled = enable_review and resolve_review_policy(leader) != REVIEW_POLICY_DISABLED
        final_result_from_review = None

        async for event in self._maybe_leader_review(
            review_enabled, leader, task_execution, analysis
        ):
            (event.event_type == "task_result") and (final_result_from_review := event.data.get("result"))
            (event.event_type != "task_result") and (yield event)

        # Use review result or last subtask output
        final_result = final_result_from_review or await self._get_last_subtask_output(task_execution.id)

        yield OrchestrationEvent("task_result", {"result": final_result})

    async def _maybe_leader_review(
        self,
        enabled: bool,
        leader: Agent,
        task_execution: TaskExecution,
        analysis: TaskAnalysis
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """Conditionally run leader review, yielding events"""
        _review_handlers = {
            True: self._do_leader_review,
            False: self._skip_review,
        }
        async for event in _review_handlers[enabled](leader, task_execution, analysis):
            yield event

    async def _do_leader_review(
        self,
        leader: Agent,
        task_execution: TaskExecution,
        analysis: TaskAnalysis
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """Execute leader review with streaming output"""
        yield OrchestrationEvent("review_start", {"reviewer": leader.name})

        # Build review prompt (inlined from _leader_review for streaming)
        result = await self.db.execute(
            select(SubTask)
            .filter(SubTask.task_execution_id == task_execution.id)
            .order_by(SubTask.order_index)
        )
        subtasks = result.scalars().all()

        outputs_text = "\n\n".join([
            f"### {i+1}. {st.description}\n{(st.output_data or {}).get('content', 'No output')}"
            for i, st in enumerate(subtasks)
        ])

        review_prompt = f"""Review the following task outputs and provide a final integrated summary.

Original task: {task_execution.task_description}

Review criteria: {analysis.review_criteria}

Subtask outputs:
{outputs_text}

Provide a cohesive final result that integrates all outputs:"""

        # Stream review via execute_streaming (real-time chunks to frontend)
        review_result = ""
        async for chunk, _sr in self.executor.execute_streaming(
            agent_id=leader.id,
            messages=[{"role": "user", "content": review_prompt}],
            system_prompt_override="You are reviewing and integrating outputs from multiple agents. Provide a cohesive final result.",
            user_id=self._user_id,
        ):
            review_result += chunk
            yield OrchestrationEvent("subtask_chunk", {
                "subtask_id": "__review__",
                "chunk": chunk,
            })

        yield OrchestrationEvent("review_completed", {
            "approved": True,
            "summary_preview": review_result[:300] if review_result else ""
        })
        yield OrchestrationEvent("task_result", {"result": review_result})

    async def _skip_review(
        self,
        leader: Agent,
        task_execution: TaskExecution,
        analysis: TaskAnalysis
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """No-op: skip review"""
        return
        yield  # Make it an async generator

    async def _load_leader_and_members(
        self,
        leader_agent_id: str
    ) -> tuple[Agent, Dict[str, Agent]]:
        """Load leader agent and its configured member agents"""
        result = await self.db.execute(select(Agent).filter(Agent.id == leader_agent_id))
        leader = result.scalars().first()
        if not leader:
            raise ValueError(f"Leader agent not found: {leader_agent_id}")
        if not leader.is_leader:
            raise ValueError(f"Agent {leader.name} is not configured as a leader")

        member_ids = leader.member_agent_ids or []
        members: Dict[str, Agent] = {}

        member_ids and (
            members.update({
                agent.id: agent
                for agent in (await self.db.execute(select(Agent).filter(Agent.id.in_(member_ids)))).scalars().all()
            })
        )

        return leader, members

    async def _analyze_task(
        self,
        leader: Agent,
        members: Dict[str, Agent],
        task_description: str,
        history_messages: Optional[List[Dict[str, str]]] = None,
    ) -> TaskAnalysis:
        """Single LLM call: classify simple/complex + optional decomposition.

        P0-2: 使用 pydantic 强校验 + 修复循环（MAX_ANALYSIS_REPAIR_ATTEMPTS 次）。
        - 首次 LLM 输出需满足 _AnalysisSchema；
        - ValidationError 时把错误回喂给 LLM 要求修复重发；
        - 多轮失败后降级为简单任务（以原文作为 direct_response）。

        P0-3: subtask.key 从 LLM 输出的 id 字段取；depends_on 引用 key。
        无 id 时服务端自动补 T{i+1}（UnifiedStrategy.execute 内完成）。
        """
        member_list = "\n".join([
            f"- {agent.name} (ID: {agent.id}): {agent.description or '无描述'}"
            for agent in members.values()
        ])

        # Build conversation history summary for context
        history_context = ""
        raw_history = history_messages or []
        raw_history and (history_context := "\n## 对话历史\n以下是之前的对话记录，请结合上下文判断当前用户需求：\n" + "\n".join(
            f"{'用户' if m.get('role') == 'user' else '助手'}: {str(m.get('content', ''))[:500]}"
            for m in raw_history[-10:]  # Last 10 messages for context, truncated
        ) + "\n")

        user_content = TASK_ANALYSIS_INSTRUCTION.format(
            member_agents_list=member_list or "暂无配置成员智能体。",
            max_subtasks=leader.max_subtasks or 10,
            user_request=task_description,
            history_context=history_context,
        )

        # 首次请求
        result = await self.executor.execute(
            agent_id=leader.id,
            messages=[{"role": "user", "content": user_content}],
            context={"task": "analyze"}
        )
        total_input_tokens = result.input_tokens
        total_output_tokens = result.output_tokens
        raw_content = result.content

        # P0-2: pydantic 修复循环
        parsed: Optional[_AnalysisSchema] = None
        last_error: str = ""
        for attempt in range(MAX_ANALYSIS_REPAIR_ATTEMPTS + 1):
            try:
                json_str = _extract_json_object(raw_content)
                data = json.loads(json_str)
                parsed = _AnalysisSchema.model_validate(data)
                break
            except (json.JSONDecodeError, ValidationError, ValueError) as exc:
                last_error = str(exc)
                logger.warning(
                    "Analysis parse attempt %d/%d failed: %s",
                    attempt + 1, MAX_ANALYSIS_REPAIR_ATTEMPTS + 1, last_error,
                )
                # 已是最后一次 → 不再重发
                if attempt >= MAX_ANALYSIS_REPAIR_ATTEMPTS:
                    break
                # 把错误回喂给 LLM 要求重新输出（修复）
                repair_prompt = (
                    "Your previous response could not be parsed. "
                    f"Error: {last_error[:500]}\n\n"
                    "Please re-emit the analysis strictly following the JSON schema described earlier. "
                    "Output JSON only, no prose, no code fences.\n\n"
                    f"Original request:\n{task_description}"
                )
                repair_result = await self.executor.execute(
                    agent_id=leader.id,
                    messages=[{"role": "user", "content": repair_prompt}],
                    context={"task": "analyze_repair", "attempt": attempt + 1},
                )
                total_input_tokens += repair_result.input_tokens
                total_output_tokens += repair_result.output_tokens
                raw_content = repair_result.content

        # 修复失败 → 降级为简单任务（将首次原文作为 direct_response）
        if parsed is None:
            logger.warning(
                "Analysis parse exhausted %d attempts; falling back to simple task. Last error: %s",
                MAX_ANALYSIS_REPAIR_ATTEMPTS + 1, last_error,
            )
            return TaskAnalysis(
                is_simple=True,
                direct_response=result.content,
                analysis_input_tokens=total_input_tokens,
                analysis_output_tokens=total_output_tokens,
            )

        # Simple task 直接返回
        if parsed.is_simple:
            return TaskAnalysis(
                is_simple=True,
                direct_response=parsed.direct_response or "",
                analysis_input_tokens=total_input_tokens,
                analysis_output_tokens=total_output_tokens,
            )

        # Complex task: resolve agent_ids + 构建 SubTaskSpec
        valid_ids = set(members.keys())
        fallback_id = next(iter(valid_ids), leader.id)

        def _resolve_agent_id(raw_id: str) -> str:
            """Match LLM output agent_id to actual known member agent ID."""
            match = next((vid for vid in valid_ids if vid == raw_id), None)
            match = match or next(
                (vid for vid in valid_ids if vid[:8] in raw_id or raw_id[:8] in vid),
                None,
            )
            return match or fallback_id

        raw_subtasks = parsed.subtasks or []
        # 先建立合法 key 集（去重）；后续 depends_on 只保留命中 key
        valid_keys: set[str] = set()
        subtask_specs: list[SubTaskSpec] = []
        for st in raw_subtasks:
            key = st.id or f"T{len(subtask_specs) + 1}"
            # 保证 key 在当前列表里唯一，重复时自动附后缀
            key in valid_keys and (key := f"{key}_{len(subtask_specs) + 1}")
            valid_keys.add(key)
            subtask_specs.append(SubTaskSpec(
                key=key,
                agent_id=_resolve_agent_id(st.agent_id),
                description=st.description,
                depends_on=list(st.depends_on or []),
            ))

        # 依赖校验：只保留指向已知 key 的依赖；同时防止自环
        for spec in subtask_specs:
            spec.depends_on = [
                dep for dep in spec.depends_on
                if dep in valid_keys and dep != spec.key
            ]

        return TaskAnalysis(
            is_simple=False,
            subtasks=subtask_specs,
            review_criteria=parsed.review_criteria or "",
            analysis_input_tokens=total_input_tokens,
            analysis_output_tokens=total_output_tokens,
        )

    async def _leader_review(
        self,
        leader: Agent,
        task_execution: TaskExecution,
        analysis: TaskAnalysis
    ) -> str:
        """Leader reviews all subtask results and provides final summary"""
        result = await self.db.execute(
            select(SubTask)
            .filter(SubTask.task_execution_id == task_execution.id)
            .order_by(SubTask.order_index)
        )
        subtasks = result.scalars().all()

        outputs_text = "\n\n".join([
            f"### {i+1}. {st.description}\n{(st.output_data or {}).get('content', 'No output')}"
            for i, st in enumerate(subtasks)
        ])

        review_prompt = f"""Review the following task outputs and provide a final integrated summary.

Original task: {task_execution.task_description}

Review criteria: {analysis.review_criteria}

Subtask outputs:
{outputs_text}

Provide a cohesive final result that integrates all outputs:"""

        result = await self.executor.execute_with_system_prompt(
            agent_id=leader.id,
            user_content=review_prompt,
            system_prompt_override="You are reviewing and integrating outputs from multiple agents. Provide a cohesive final result."
        )

        return result.content

    async def _get_last_subtask_output(self, task_execution_id: str) -> Optional[str]:
        """Get the last completed subtask's output content"""
        result = await self.db.execute(
            select(SubTask)
            .filter(SubTask.task_execution_id == task_execution_id, SubTask.status == "completed")
            .order_by(SubTask.order_index.desc())
            .limit(1)
        )
        subtask = result.scalars().first()
        output_data = getattr(subtask, "output_data", None) or {}
        return output_data.get("content")

    async def _finalize(
        self,
        task_execution: TaskExecution,
        user_id: str,
        final_result: Optional[str],
        analysis: TaskAnalysis
    ):
        """Finalize task execution, calculate totals, and charge credits"""
        # Sum up all subtask tokens and costs
        result = await self.db.execute(
            select(SubTask).filter(SubTask.task_execution_id == task_execution.id)
        )
        subtasks = result.scalars().all()

        subtask_input = sum(st.input_tokens or 0 for st in subtasks)
        subtask_output = sum(st.output_tokens or 0 for st in subtasks)
        subtask_cost = sum(st.credit_cost or 0 for st in subtasks)

        # Include analysis call tokens and cost
        total_input = subtask_input + analysis.analysis_input_tokens
        total_output = subtask_output + analysis.analysis_output_tokens

        # Calculate analysis call cost using leader's pricing
        leader_result = await self.db.execute(
            select(Agent).filter(Agent.id == task_execution.leader_agent_id)
        )
        leader = leader_result.scalars().first()

        analysis_cost = 0.0
        if leader:
            _leader_rates = await load_pricing(getattr(leader, 'provider_id', None), getattr(leader, 'model', None), self.db)
            analysis_cost = (
                (analysis.analysis_input_tokens / 1_000_000) * float(_leader_rates.get("input", 0) or 0)
                + (analysis.analysis_output_tokens / 1_000_000) * float(_leader_rates.get("text_output", 0) or 0)
            )

        total_cost = subtask_cost + analysis_cost

        task_execution.total_input_tokens = total_input
        task_execution.total_output_tokens = total_output
        task_execution.total_credit_cost = total_cost
        task_execution.status = "completed"
        task_execution.completed_at = sa_func.now()
        task_execution.result = {"final_result": final_result} if final_result else None

        # Deduct credits from user
        billing_status = "success"
        total_cost > 0 and await self._deduct_credits(
            task_execution, user_id, total_cost, subtasks, analysis
        ) or None

        # Read back billing_status (may have been set by _deduct_credits)
        billing_status = (task_execution.execution_metadata or {}).get("billing_status", "success")

        task_execution.execution_metadata = {
            **(task_execution.execution_metadata or {}),
            "billing_status": billing_status,
            "is_simple": analysis.is_simple,
            "leader_analysis_tokens": {
                "input": analysis.analysis_input_tokens,
                "output": analysis.analysis_output_tokens,
            },
            "leader_analysis_cost": round(analysis_cost, 6),
        }

        await safe_commit(self.db)

    async def _deduct_credits(
        self,
        task_execution: TaskExecution,
        user_id: str,
        total_cost: float,
        subtasks: list,
        analysis: TaskAnalysis
    ):
        """Attempt to deduct credits, updating task_execution metadata on failure.

        P1-6: 通过 BillingPolicy 调用；幂等键 ``orchestrate:{id}`` 与 cancel 路径共享，
        确保一个 task_execution 最多产生一条 CreditTransaction。
        """
        billing_status = "success"
        try:
            await self.billing_policy.charge(
                user_id=user_id,
                cost=total_cost,
                session=self.db,
                metadata={
                    "task_execution_id": task_execution.id,
                    "subtask_count": len(subtasks),
                    "is_simple": analysis.is_simple,
                    "total_image_output_tokens": sum(
                        (st.output_data or {}).get("image_output_tokens", 0) for st in subtasks
                    ),
                    "total_search_count": sum(
                        (st.output_data or {}).get("search_count", 0) for st in subtasks
                    ),
                    "description": f"Multi-agent task: {task_execution.task_description[:100]}"
                },
                transaction_type="deduction",
                idempotency_key=f"orchestrate:{task_execution.id}",
            )
        except InsufficientCreditsError:
            billing_status = "insufficient"
            logger.warning(f"Credits depleted for user {user_id}. Cost: {total_cost}")
        except BalanceFrozenError:
            billing_status = "frozen"
            logger.warning(f"Balance frozen for user {user_id}")
        except Exception as e:
            billing_status = "error"
            logger.error(f"Failed to deduct credits in orchestrator: {e}")

        task_execution.execution_metadata = {
            **(task_execution.execution_metadata or {}),
            "billing_status": billing_status,
        }
