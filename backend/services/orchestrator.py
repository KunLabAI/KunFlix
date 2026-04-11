"""
Dynamic Multi-Agent Orchestration System

Unified architecture: Leader agent analyzes tasks in a single LLM call,
dispatching simple tasks directly and decomposing complex tasks to sub-agents.
"""
from typing import Dict, Any, List, Optional, AsyncGenerator, Type
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func as sa_func
import asyncio
import json
import logging

from models import Agent, TaskExecution, SubTask, User, CreditTransaction
from services.agent_executor import AgentExecutor, ExecutionResult
from services.billing import calculate_credit_cost, deduct_credits_atomic, InsufficientCreditsError, BalanceFrozenError
from services.llm_stream import StreamResult
from services.tool_manager import ToolManager
from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)


# =============================================================================
# Harness: Constants & Output Validation
# =============================================================================

MAX_SUBTASK_RETRIES = 3          # 熔断上限：单子任务最多重试次数
MIN_VALID_OUTPUT_LENGTH = 2      # 输出最小有效长度（排除空白/无意义响应）


class OutputValidationError(Exception):
    """Agent 输出未通过结构化校验"""
    pass


class CircuitBreakerError(Exception):
    """子任务重试达到熔断上限"""
    def __init__(self, subtask_id: str, retries: int):
        self.subtask_id = subtask_id
        self.retries = retries
        super().__init__(f"Circuit breaker triggered: subtask {subtask_id} failed after {retries} retries")


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
# Data Classes
# =============================================================================

@dataclass
class SubTaskSpec:
    """Specification for a subtask from leader's decomposition"""
    agent_id: str
    description: str
    depends_on: List[str] = field(default_factory=list)
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
        await self.db.flush()
        return subtask

    async def execute_subtask(self, subtask: SubTask, input_content: str) -> ExecutionResult:
        """
        Execute a single subtask (non-streaming) with output validation and circuit breaker.
        Retries up to MAX_SUBTASK_RETRIES on failure or invalid output.
        """
        messages = list(self.history_messages) + [{"role": "user", "content": input_content}]
        last_error = None

        while subtask.retry_count < MAX_SUBTASK_RETRIES:
            subtask.status = "running"
            await self.db.flush()

            try:
                result = await self.executor.execute(
                    agent_id=subtask.agent_id,
                    messages=messages,
                    context={"subtask_id": subtask.id, "attempt": subtask.retry_count + 1}
                )

                # Harness: output validation
                is_valid, validation_msg = validate_output(result.content)
                is_valid or (_ for _ in ()).throw(OutputValidationError(validation_msg))

                subtask.status = "completed"
                subtask.output_data = {"content": result.content}
                subtask.input_tokens = result.input_tokens
                subtask.output_tokens = result.output_tokens
                subtask.completed_at = sa_func.now()

                agent = self.members.get(subtask.agent_id)
                subtask.credit_cost, _ = calculate_credit_cost(result, agent or self.leader)

                await self.db.flush()
                return result

            except Exception as e:
                subtask.retry_count += 1
                last_error = e
                logger.warning(
                    f"Subtask {subtask.id} attempt {subtask.retry_count}/{MAX_SUBTASK_RETRIES} failed: {e}"
                )
                await self.db.flush()

        # Circuit breaker: exhausted retries
        subtask.status = "failed"
        subtask.error_message = f"Circuit breaker: {last_error}"
        await self.db.flush()
        raise CircuitBreakerError(subtask.id, subtask.retry_count)

    async def execute_subtask_streaming(
        self, subtask: SubTask, input_content: str
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """
        Execute a subtask with streaming + tool support + output validation + circuit breaker.
        First attempt streams in real-time; retries fall back to non-streaming
        to avoid duplicate chunk events.
        """
        agent = self.members.get(subtask.agent_id) or self.leader
        agent_name = agent.name
        messages = list(self.history_messages) + [{"role": "user", "content": input_content}]

        # Build tool definitions for the sub-agent
        # Pre-populate loaded_tool_skills to bypass skill-gate (no load_skill flow in multi-agent)
        tool_manager = ToolManager()
        ctx = ToolContext(
            theater_id=self.theater_id, agent=agent, db=self.db,
            session_id=self.session_id, user_id=self.user_id, is_admin=self.is_admin,
            loaded_tool_skills=set(agent.tools or []),
        )
        tool_defs = await tool_manager.build_tool_defs(ctx)
        max_rounds = max(10, min(200, agent.max_tool_rounds or 100))

        # --- First attempt: streaming with tools ---
        subtask.status = "running"
        await self.db.flush()

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
                }
                (event_type == "chunk") and (last_result := result)
                handler = _event_map.get(event_type)
                handler and (yield handler())

            full_content = last_result.full_response if last_result else ""

            # Harness: validate streaming output
            is_valid, validation_msg = validate_output(full_content)
            is_valid or (_ for _ in ()).throw(OutputValidationError(validation_msg))

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
            subtask.credit_cost, _ = calculate_credit_cost(last_result, agent or self.leader)
            await self.db.flush()

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
            await self.db.flush()

        # --- Retry attempts: non-streaming fallback to avoid duplicate chunks ---
        while subtask.retry_count < MAX_SUBTASK_RETRIES:
            subtask.status = "running"
            await self.db.flush()

            yield OrchestrationEvent("subtask_retry", {
                "subtask_id": subtask.id,
                "attempt": subtask.retry_count + 1,
                "max_retries": MAX_SUBTASK_RETRIES,
            })

            try:
                result = await self.executor.execute(
                    agent_id=subtask.agent_id,
                    messages=messages,
                    context={"subtask_id": subtask.id, "attempt": subtask.retry_count + 1}
                )

                is_valid, validation_msg = validate_output(result.content)
                is_valid or (_ for _ in ()).throw(OutputValidationError(validation_msg))

                subtask.status = "completed"
                subtask.output_data = {"content": result.content}
                subtask.input_tokens = result.input_tokens
                subtask.output_tokens = result.output_tokens
                subtask.completed_at = sa_func.now()
                subtask.credit_cost, _ = calculate_credit_cost(result, agent or self.leader)
                await self.db.flush()

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
                await self.db.flush()

        # Circuit breaker: all retries exhausted
        subtask.status = "failed"
        subtask.error_message = f"Circuit breaker: max retries ({MAX_SUBTASK_RETRIES}) exhausted"
        await self.db.flush()

        subtask._streaming_result = ExecutionResult(content="", metadata={"error": subtask.error_message})

        yield OrchestrationEvent("subtask_failed", {
            "subtask_id": subtask.id,
            "error": subtask.error_message,
            "circuit_breaker": True,
            "retries": subtask.retry_count,
        })


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
        # Build dependency graph
        subtask_map: Dict[str, SubTask] = {}
        spec_map: Dict[str, SubTaskSpec] = {}
        index_to_subtask_id: Dict[str, str] = {}

        for i, spec in enumerate(analysis.subtasks):
            spec.order_index = i
            subtask = await self.create_subtask_record(spec)
            subtask_map[subtask.id] = subtask
            spec_map[subtask.id] = spec
            index_to_subtask_id[str(i)] = subtask.id
            agent = self.members.get(spec.agent_id, self.leader)
            yield OrchestrationEvent("subtask_created", {
                "subtask_id": subtask.id,
                "agent": agent.name,
                "description": spec.description,
                "depends_on": spec.depends_on
            })

        # Convert index-based depends_on to subtask IDs
        resolved_deps: Dict[str, list] = {}
        for sid, spec in spec_map.items():
            resolved_deps[sid] = [
                index_to_subtask_id[dep]
                for dep in spec.depends_on
                if dep in index_to_subtask_id
            ]

        # Execute in dependency order
        completed_outputs: Dict[str, str] = {}
        pending = list(subtask_map.keys())

        while pending:
            ready = [
                sid for sid in pending
                if all(dep in completed_outputs for dep in resolved_deps[sid])
            ]

            # Build (subtask, input) pairs for ready tasks
            ready_tasks = []
            for sid in ready:
                subtask = subtask_map[sid]
                dep_outputs = [completed_outputs[dep] for dep in resolved_deps[sid]]
                task_input = "\n\n".join(dep_outputs) or user_input
                ready_tasks.append((subtask, task_input))

            # Multiple ready tasks at same level: parallel (non-streaming)
            # Single ready task: streaming for real-time output
            _executors = {
                True: self._execute_batch,
                False: self._execute_single_streaming,
            }
            executor_fn = _executors[len(ready_tasks) > 1]
            async for event in executor_fn(ready_tasks, completed_outputs):
                yield event

            for sid in ready:
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
请以 JSON 格式输出分析结果：

简单任务示例：
{{
  "is_simple": true,
  "direct_response": "你的完整回答内容（高质量、完整的回复）",
  "subtasks": null,
  "review_criteria": null
}}

复杂任务示例：
{{
  "is_simple": false,
  "direct_response": null,
  "subtasks": [
    {{"agent_id": "成员智能体的ID", "description": "子任务描述", "depends_on": []}},
    {{"agent_id": "成员智能体的ID", "description": "子任务描述", "depends_on": [0]}}
  ],
  "review_criteria": "最终审查标准"
}}

## 注意事项
- 简单任务时，direct_response 必须是完整、高质量的回复，将直接发送给用户
- 复杂任务的子任务必须分配给上面列出的团队成员（使用其ID）
- depends_on 中填写该子任务依赖的其他子任务的索引号（从0开始）
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
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.executor = AgentExecutor(db)

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
        """
        # Store context for tool injection in subtasks
        self._theater_id = theater_id
        self._session_id = session_id
        self._user_id = user_id
        self._is_admin = is_admin

        # 1. Load leader and members
        leader, members = await self._load_leader_and_members(leader_agent_id)

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

        yield OrchestrationEvent("task_start", {
            "task_execution_id": task_execution.id,
            "leader": leader.name,
            "member_count": len(members)
        })

        try:
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

        except Exception as e:
            logger.exception(f"Orchestration failed: {e}")
            task_execution.status = "failed"
            task_execution.execution_metadata = {
                **(task_execution.execution_metadata or {}),
                "error": str(e)
            }
            await self.db.commit()

            yield OrchestrationEvent("task_failed", {
                "task_execution_id": task_execution.id,
                "error": str(e)
            })

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

        # Leader review (optional)
        final_result = None
        review_enabled = enable_review and leader.enable_auto_review
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
        """Single LLM call: classify simple/complex + optional decomposition"""
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

        result = await self.executor.execute(
            agent_id=leader.id,
            messages=[{"role": "user", "content": user_content}],
            context={"task": "analyze"}
        )

        analysis_tokens = {
            "input": result.input_tokens,
            "output": result.output_tokens,
        }

        # Parse JSON response
        try:
            content = result.content.strip()
            # Handle markdown code blocks
            start = content.find("{")
            end = content.rfind("}") + 1
            (start >= 0 and end > start) and (content := content[start:end])

            data = json.loads(content)

            is_simple = data.get("is_simple", True)

            # Simple task: return direct response
            direct_response = data.get("direct_response") or ""
            simple_analysis = TaskAnalysis(
                is_simple=True,
                direct_response=direct_response,
                analysis_input_tokens=analysis_tokens["input"],
                analysis_output_tokens=analysis_tokens["output"],
            )

            # Complex task: parse subtasks
            raw_subtasks = data.get("subtasks") or []
            valid_ids = set(members.keys())
            fallback_id = next(iter(valid_ids), leader.id)

            def _resolve_agent_id(raw_id: str) -> str:
                """Match LLM output agent_id to actual known member agent ID."""
                match = next((vid for vid in valid_ids if vid == raw_id), None)
                match = match or next((vid for vid in valid_ids if vid[:8] in raw_id or raw_id[:8] in vid), None)
                return match or fallback_id

            subtask_specs = [
                SubTaskSpec(
                    agent_id=_resolve_agent_id(st.get("agent_id", fallback_id)),
                    description=st.get("description", ""),
                    depends_on=[str(d) for d in (st.get("depends_on") or [])]
                )
                for st in raw_subtasks
            ]

            # Validate depends_on indices
            max_index = len(subtask_specs) - 1
            for spec in subtask_specs:
                spec.depends_on = [d for d in spec.depends_on if d.isdigit() and int(d) <= max_index]

            complex_analysis = TaskAnalysis(
                is_simple=False,
                subtasks=subtask_specs,
                review_criteria=data.get("review_criteria", ""),
                analysis_input_tokens=analysis_tokens["input"],
                analysis_output_tokens=analysis_tokens["output"],
            )

            return simple_analysis if is_simple else complex_analysis

        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"Failed to parse leader's analysis: {e}")
            # Fallback: treat as simple task with raw response
            return TaskAnalysis(
                is_simple=True,
                direct_response=result.content,
                analysis_input_tokens=analysis_tokens["input"],
                analysis_output_tokens=analysis_tokens["output"],
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
        leader and (analysis_cost := (
            (analysis.analysis_input_tokens / 1_000_000) * (leader.input_credit_per_1m or 0)
            + (analysis.analysis_output_tokens / 1_000_000) * (leader.output_credit_per_1m or 0)
        ))

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

        await self.db.commit()

    async def _deduct_credits(
        self,
        task_execution: TaskExecution,
        user_id: str,
        total_cost: float,
        subtasks: list,
        analysis: TaskAnalysis
    ):
        """Attempt to deduct credits, updating task_execution metadata on failure"""
        billing_status = "success"
        try:
            await deduct_credits_atomic(
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
                transaction_type="deduction"
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
