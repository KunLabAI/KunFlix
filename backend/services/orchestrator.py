"""
Dynamic Multi-Agent Orchestration System

Implements Pipeline, Plan, and Discussion collaboration strategies
with a registry pattern to avoid if-else branching.
"""
from typing import Dict, Any, List, Optional, AsyncGenerator, Callable, Type
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
from services.billing import calculate_credit_cost, deduct_credits_atomic, InsufficientCreditsError
from services.llm_stream import StreamResult

logger = logging.getLogger(__name__)


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
class TaskDecomposition:
    """Result of leader's task analysis"""
    coordination_mode: str  # pipeline, plan, discussion
    execution_mode: str     # sequential, parallel
    subtasks: List[SubTaskSpec] = field(default_factory=list)
    review_criteria: str = ""


@dataclass
class OrchestrationEvent:
    """Event for streaming progress updates"""
    event_type: str
    data: Dict[str, Any]

    def to_sse(self) -> str:
        """Format as Server-Sent Event"""
        return f"event: {self.event_type}\ndata: {json.dumps(self.data)}\n\n"


# =============================================================================
# Strategy Registry
# =============================================================================

_STRATEGY_REGISTRY: Dict[str, Type["CollaborationStrategy"]] = {}


def register_strategy(name: str):
    """Decorator to register a collaboration strategy"""
    def decorator(cls: Type["CollaborationStrategy"]):
        _STRATEGY_REGISTRY[name] = cls
        return cls
    return decorator


def get_strategy(name: str) -> Type["CollaborationStrategy"]:
    """Get strategy class by name, defaults to pipeline"""
    return _STRATEGY_REGISTRY.get(name, _STRATEGY_REGISTRY.get("pipeline"))


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
        history_messages: Optional[List[Dict[str, str]]] = None
    ):
        self.db = db
        self.executor = executor
        self.task_execution = task_execution
        self.leader = leader
        self.members = members  # agent_id -> Agent
        self.history_messages = history_messages or []

    @abstractmethod
    async def execute(
        self,
        decomposition: TaskDecomposition,
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
        """Execute a single subtask (non-streaming) and update its record"""
        subtask.status = "running"
        await self.db.flush()

        # 构建消息列表：历史消息 + 当前任务
        messages = list(self.history_messages) + [{"role": "user", "content": input_content}]

        try:
            result = await self.executor.execute(
                agent_id=subtask.agent_id,
                messages=messages,
                context={"subtask_id": subtask.id}
            )

            subtask.status = "completed"
            subtask.output_data = {"content": result.content}
            subtask.input_tokens = result.input_tokens
            subtask.output_tokens = result.output_tokens
            subtask.completed_at = sa_func.now()

            # Calculate credit cost (ExecutionResult 兼容：billing 自动回退)
            agent = self.members.get(subtask.agent_id)
            subtask.credit_cost, _ = calculate_credit_cost(result, agent or self.leader)

            await self.db.flush()
            return result

        except Exception as e:
            subtask.status = "failed"
            subtask.error_message = str(e)
            subtask.retry_count += 1
            await self.db.flush()
            raise

    async def execute_subtask_streaming(
        self, subtask: SubTask, input_content: str
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """
        Execute a subtask with streaming, yielding chunk events in real-time.
        After streaming completes, yields a subtask_completed event.
        Stores ExecutionResult on subtask._streaming_result for caller access.
        """
        subtask.status = "running"
        await self.db.flush()

        agent = self.members.get(subtask.agent_id)
        agent_name = agent.name if agent else self.leader.name

        yield OrchestrationEvent("subtask_started", {
            "subtask_id": subtask.id,
            "agent_name": agent_name,
        })

        # 构建消息列表：历史消息 + 当前任务
        messages = list(self.history_messages) + [{"role": "user", "content": input_content}]

        try:
            last_result: Optional[StreamResult] = None
            async for chunk, result in self.executor.execute_streaming(
                agent_id=subtask.agent_id,
                messages=messages,
                context={"subtask_id": subtask.id}
            ):
                last_result = result
                yield OrchestrationEvent("subtask_chunk", {
                    "subtask_id": subtask.id,
                    "chunk": chunk,
                })

            # Finalize subtask record
            full_content = last_result.full_response if last_result else ""
            input_tokens = last_result.input_tokens if last_result else 0
            output_tokens = last_result.output_tokens if last_result else 0

            subtask.status = "completed"
            subtask.output_data = {
                "content": full_content,
                "text_output_tokens": last_result.text_output_tokens,
                "image_output_tokens": last_result.image_output_tokens,
                "search_count": last_result.search_query_count,
            }
            subtask.input_tokens = input_tokens
            subtask.output_tokens = output_tokens
            subtask.completed_at = sa_func.now()

            subtask.credit_cost, _ = calculate_credit_cost(last_result, agent or self.leader)
            await self.db.flush()

            # Store result for caller to read after generator exhaustion
            subtask._streaming_result = ExecutionResult(
                content=full_content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                input_chars=len(input_content),
                output_chars=len(full_content),
                metadata={"agent_id": subtask.agent_id, "agent_name": agent_name}
            )

            yield OrchestrationEvent("subtask_completed", {
                "subtask_id": subtask.id,
                "agent_name": agent_name,
                "description": subtask.description,
                "status": "completed",
                "tokens": {"input": input_tokens, "output": output_tokens},
                "result": full_content,
            })

        except Exception as e:
            subtask.status = "failed"
            subtask.error_message = str(e)
            subtask.retry_count += 1
            await self.db.flush()

            subtask._streaming_result = ExecutionResult(content="", metadata={"error": str(e)})

            yield OrchestrationEvent("subtask_failed", {
                "subtask_id": subtask.id,
                "error": str(e),
            })


# =============================================================================
# Pipeline Strategy
# =============================================================================

@register_strategy("pipeline")
class PipelineStrategy(CollaborationStrategy):
    """
    Pipeline execution strategy.
    Supports sequential (chain) and parallel (fanout) modes.
    """

    async def execute(
        self,
        decomposition: TaskDecomposition,
        user_input: str
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        is_parallel = decomposition.execution_mode == "parallel"

        # Create all subtask records
        subtasks: List[SubTask] = []
        for spec in decomposition.subtasks:
            subtask = await self.create_subtask_record(spec)
            subtasks.append(subtask)
            agent = self.members.get(spec.agent_id, self.leader)
            yield OrchestrationEvent("subtask_created", {
                "subtask_id": subtask.id,
                "agent": agent.name,
                "description": spec.description,
                "mode": "parallel" if is_parallel else "sequential"
            })

        results: List[ExecutionResult] = []

        # Execute based on mode (parallel keeps non-streaming; sequential uses streaming)
        if is_parallel:
            results = await self._execute_parallel(subtasks, user_input)
            for subtask, result in zip(subtasks, results):
                yield OrchestrationEvent("subtask_completed", {
                    "subtask_id": subtask.id,
                    "agent_name": self.members.get(subtask.agent_id, self.leader).name,
                    "description": subtask.description,
                    "status": subtask.status,
                    "tokens": {"input": result.input_tokens, "output": result.output_tokens},
                    "result": result.content
                })
        else:
            current_input = user_input
            for subtask in subtasks:
                async for event in self.execute_subtask_streaming(subtask, current_input):
                    yield event
                result = getattr(subtask, "_streaming_result", None)
                current_input = result.content if result else current_input

        yield OrchestrationEvent("pipeline_completed", {
            "total_subtasks": len(subtasks),
            "results_count": len(subtasks)
        })

    async def _execute_parallel(
        self,
        subtasks: List[SubTask],
        user_input: str
    ) -> List[ExecutionResult]:
        """Execute all subtasks in parallel using asyncio.gather"""
        tasks = [
            self.execute_subtask(subtask, user_input)
            for subtask in subtasks
        ]
        return await asyncio.gather(*tasks, return_exceptions=False)


# =============================================================================
# Plan Strategy
# =============================================================================

@register_strategy("plan")
class PlanStrategy(CollaborationStrategy):
    """
    Plan-based execution strategy.
    Supports task dependencies and dynamic plan adjustment.
    """

    async def execute(
        self,
        decomposition: TaskDecomposition,
        user_input: str
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        # Build dependency graph
        subtask_map: Dict[str, SubTask] = {}
        spec_map: Dict[str, SubTaskSpec] = {}
        index_to_subtask_id: Dict[str, str] = {}

        for i, spec in enumerate(decomposition.subtasks):
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

        yield OrchestrationEvent("plan_created", {
            "total_subtasks": len(subtask_map),
            "review_criteria": decomposition.review_criteria
        })

        # Execute in dependency order
        completed_outputs: Dict[str, str] = {}
        pending = list(subtask_map.keys())

        while pending:
            # Find tasks with all dependencies satisfied
            ready = [
                sid for sid in pending
                if all(dep in completed_outputs for dep in resolved_deps[sid])
            ]

            # Execute ready tasks (can be parallel within same level)
            ready_tasks = []
            for sid in ready:
                subtask = subtask_map[sid]
                # Build input from dependencies or user input
                dep_outputs = [completed_outputs[dep] for dep in resolved_deps[sid]]
                task_input = "\n\n".join(dep_outputs) if dep_outputs else user_input
                ready_tasks.append((subtask, task_input))

            # Execute ready tasks sequentially with streaming
            for subtask, task_input in ready_tasks:
                try:
                    async for event in self.execute_subtask_streaming(subtask, task_input):
                        yield event
                    result = getattr(subtask, "_streaming_result", None)
                    completed_outputs[subtask.id] = result.content if result else ""
                except Exception as e:
                    yield OrchestrationEvent("subtask_failed", {
                        "subtask_id": subtask.id,
                        "error": str(e)
                    })
                pending.remove(subtask.id)

        yield OrchestrationEvent("plan_completed", {
            "completed_count": len(completed_outputs)
        })


# =============================================================================
# Discussion Strategy
# =============================================================================

@register_strategy("discussion")
class DiscussionStrategy(CollaborationStrategy):
    """
    Multi-round discussion strategy.
    Leader moderates discussion among member agents.
    """

    MAX_ROUNDS = 5

    async def execute(
        self,
        decomposition: TaskDecomposition,
        user_input: str
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        participants = [self.members[spec.agent_id] for spec in decomposition.subtasks if spec.agent_id in self.members]

        yield OrchestrationEvent("discussion_started", {
            "topic": user_input,
            "participants": [p.name for p in participants],
            "max_rounds": self.MAX_ROUNDS
        })

        discussion_history: List[Dict[str, str]] = []
        current_topic = user_input

        for round_num in range(1, self.MAX_ROUNDS + 1):
            yield OrchestrationEvent("round_started", {"round": round_num})

            round_responses: List[Dict[str, Any]] = []

            # Each participant responds
            for agent in participants:
                prompt = self._build_discussion_prompt(current_topic, discussion_history, agent.name)

                result = await self.executor.execute_with_system_prompt(
                    agent_id=agent.id,
                    user_content=prompt,
                    system_prompt_override=f"{agent.system_prompt}\n\nYou are participating in a group discussion. Provide your perspective concisely."
                )

                response_entry = {
                    "agent": agent.name,
                    "agent_id": agent.id,
                    "content": result.content,
                    "round": round_num
                }
                discussion_history.append(response_entry)
                round_responses.append(response_entry)

                yield OrchestrationEvent("agent_spoke", {
                    "agent": agent.name,
                    "round": round_num,
                    "content_preview": result.content[:200] + "..." if len(result.content) > 200 else result.content,
                    "tokens": {"input": result.input_tokens, "output": result.output_tokens}
                })

            # Leader evaluates if discussion should continue
            should_continue = await self._leader_should_continue(
                user_input,
                discussion_history,
                decomposition.review_criteria
            )

            yield OrchestrationEvent("round_completed", {
                "round": round_num,
                "responses_count": len(round_responses),
                "continue": should_continue
            })

            if not should_continue:
                break

        yield OrchestrationEvent("discussion_completed", {
            "total_rounds": round_num,
            "total_responses": len(discussion_history)
        })

    def _build_discussion_prompt(
        self,
        topic: str,
        history: List[Dict[str, str]],
        current_agent: str
    ) -> str:
        """Build prompt for agent's turn in discussion"""
        history_text = ""
        if history:
            history_text = "\n\nPrevious discussion:\n"
            for entry in history[-6:]:  # Last 6 entries for context
                history_text += f"- {entry['agent']}: {entry['content'][:300]}...\n" if len(entry['content']) > 300 else f"- {entry['agent']}: {entry['content']}\n"

        return f"""Topic: {topic}
{history_text}
As {current_agent}, provide your perspective on this topic. Be concise and constructive."""

    async def _leader_should_continue(
        self,
        original_topic: str,
        history: List[Dict[str, str]],
        review_criteria: str
    ) -> bool:
        """Ask leader if discussion should continue"""
        evaluation_prompt = f"""Original topic: {original_topic}

Discussion so far ({len(history)} messages):
{chr(10).join(f"- {h['agent']}: {h['content'][:200]}" for h in history[-4:])}

Review criteria: {review_criteria}

Has the discussion reached a satisfactory conclusion? Answer only 'YES' or 'NO'."""

        result = await self.executor.execute_with_system_prompt(
            agent_id=self.leader.id,
            user_content=evaluation_prompt,
            system_prompt_override="You are evaluating a group discussion. Determine if enough perspectives have been gathered."
        )

        return "NO" in result.content.upper()


# =============================================================================
# Dynamic Orchestrator
# =============================================================================

TASK_DECOMPOSITION_INSTRUCTION = """请根据用户的需求，将任务分解并分配给你的团队成员执行。

你的团队成员如下：
{member_agents_list}

请以 JSON 格式输出任务分解方案：
{{
  "coordination_mode": "plan",
  "execution_mode": "sequential",
  "subtasks": [
    {{"agent_id": "成员智能体的ID", "description": "子任务描述", "depends_on": []}},
    ...
  ],
  "review_criteria": "最终审查标准"
}}

注意：
- 每个子任务必须分配给上面列出的团队成员（使用其ID）
- depends_on 中填写该子任务依赖的其他成员智能体ID
- 你是协调者，不要将任务分配给自己

用户需求：{user_request}"""


class DynamicOrchestrator:
    """
    Main orchestration engine.
    Coordinates leader agent to decompose tasks and execute via strategies.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.executor = AgentExecutor(db)

    async def execute(
        self,
        task_description: str,
        user_id: str,
        leader_agent_id: str,
        session_id: Optional[str] = None,
        theater_id: Optional[str] = None,
        coordination_mode: str = "auto",
        max_iterations: int = 3,
        enable_review: bool = True,
        history_messages: Optional[List[Dict[str, str]]] = None
    ) -> AsyncGenerator[OrchestrationEvent, None]:
        """
        Execute a multi-agent task.
        
        Yields OrchestrationEvent for streaming progress.
        """
        # 1. Load leader and members
        leader, members = await self._load_leader_and_members(leader_agent_id)

        # 2. Create TaskExecution record
        task_execution = TaskExecution(
            leader_agent_id=leader_agent_id,
            user_id=user_id,
            session_id=session_id,
            task_description=task_description,
            coordination_mode=coordination_mode,
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
            # 3. Leader decomposes task
            decomposition = await self._ask_leader_to_decompose(
                leader, members, task_description, coordination_mode
            )

            yield OrchestrationEvent("task_decomposed", {
                "coordination_mode": decomposition.coordination_mode,
                "execution_mode": decomposition.execution_mode,
                "subtask_count": len(decomposition.subtasks)
            })

            # 4. Get and execute strategy
            strategy_class = get_strategy(decomposition.coordination_mode)
            strategy = strategy_class(
                db=self.db,
                executor=self.executor,
                task_execution=task_execution,
                leader=leader,
                members=members,
                history_messages=history_messages or []
            )

            async for event in strategy.execute(decomposition, task_description):
                yield event

            # 5. Leader review (optional)
            final_result = None
            if enable_review and leader.enable_auto_review:
                yield OrchestrationEvent("review_start", {"reviewer": leader.name})
                final_result = await self._leader_review(leader, task_execution, decomposition)
                yield OrchestrationEvent("review_completed", {
                    "approved": True,
                    "summary_preview": final_result[:300] if final_result else ""
                })

            # If no review, use the last completed subtask's output as final result
            final_result = final_result or await self._get_last_subtask_output(task_execution.id)

            # 6. Finalize
            await self._finalize(task_execution, user_id, final_result)

            yield OrchestrationEvent("task_completed", {
                "task_execution_id": task_execution.id,
                "status": "completed",
                "total_input_tokens": task_execution.total_input_tokens,
                "total_output_tokens": task_execution.total_output_tokens,
                "total_credit_cost": task_execution.total_credit_cost,
                "result": final_result
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

    async def _load_leader_and_members(
        self,
        leader_agent_id: str
    ) -> tuple[Agent, Dict[str, Agent]]:
        """Load leader agent and its configured member agents"""
        # Load leader
        result = await self.db.execute(select(Agent).filter(Agent.id == leader_agent_id))
        leader = result.scalars().first()
        if not leader:
            raise ValueError(f"Leader agent not found: {leader_agent_id}")
        if not leader.is_leader:
            raise ValueError(f"Agent {leader.name} is not configured as a leader")

        # Load members
        member_ids = leader.member_agent_ids or []
        members: Dict[str, Agent] = {}

        if member_ids:
            result = await self.db.execute(select(Agent).filter(Agent.id.in_(member_ids)))
            for agent in result.scalars().all():
                members[agent.id] = agent

        return leader, members

    async def _ask_leader_to_decompose(
        self,
        leader: Agent,
        members: Dict[str, Agent],
        task_description: str,
        coordination_mode: str
    ) -> TaskDecomposition:
        """Ask leader to analyze and decompose the task using its own system prompt"""
        # Build member list for prompt
        member_list = "\n".join([
            f"- {agent.name} (ID: {agent.id}): {agent.description or '无描述'}"
            for agent in members.values()
        ])

        user_content = TASK_DECOMPOSITION_INSTRUCTION.format(
            member_agents_list=member_list or "暂无配置成员智能体。",
            user_request=task_description
        )

        # Use leader's own system prompt (configured by user), not a hardcoded override
        result = await self.executor.execute(
            agent_id=leader.id,
            messages=[{"role": "user", "content": user_content}],
            context={"task": "decompose"}
        )

        # Parse JSON response
        try:
            # Try to extract JSON from response
            content = result.content.strip()
            # Handle markdown code blocks
            if "```" in content:
                start = content.find("{")
                end = content.rfind("}") + 1
                content = content[start:end]

            data = json.loads(content)
            
            # Validate agent_ids - only allow member agents, not the leader
            valid_ids = set(members.keys())
            fallback_id = next(iter(valid_ids)) if valid_ids else leader.id
            
            def _resolve_agent_id(raw_id: str) -> str:
                """Match LLM output agent_id to actual known member agent ID."""
                # Direct match
                match = next((vid for vid in valid_ids if vid == raw_id), None)
                # Fuzzy fallback: LLM may corrupt UUID characters
                match = match or next((vid for vid in valid_ids if vid[:8] in raw_id or raw_id[:8] in vid), None)
                return match or fallback_id

            subtask_specs = [
                SubTaskSpec(
                    agent_id=_resolve_agent_id(st.get("agent_id", leader.id)),
                    description=st.get("description", ""),
                    depends_on=st.get("depends_on", [])
                )
                for st in data.get("subtasks", [])
            ]
            
            # Convert depends_on from agent IDs to spec indices
            # LLM outputs agent IDs in depends_on, but plan strategy needs subtask-level references
            agent_id_to_index: Dict[str, int] = {}
            for i, spec in enumerate(subtask_specs):
                agent_id_to_index[spec.agent_id] = i
            
            for spec in subtask_specs:
                spec.depends_on = [
                    str(agent_id_to_index[_resolve_agent_id(dep)])
                    for dep in spec.depends_on
                    if _resolve_agent_id(dep) in agent_id_to_index
                ]
            
            return TaskDecomposition(
                coordination_mode=data.get("coordination_mode", "pipeline"),
                execution_mode=data.get("execution_mode", "sequential"),
                subtasks=subtask_specs,
                review_criteria=data.get("review_criteria", "")
            )
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse leader's decomposition: {e}")
            # Fallback: single task for leader
            return TaskDecomposition(
                coordination_mode=coordination_mode if coordination_mode != "auto" else "pipeline",
                execution_mode="sequential",
                subtasks=[SubTaskSpec(agent_id=leader.id, description=task_description)],
                review_criteria="Verify task completion"
            )

    async def _leader_review(
        self,
        leader: Agent,
        task_execution: TaskExecution,
        decomposition: TaskDecomposition
    ) -> str:
        """Leader reviews all subtask results and provides final summary"""
        # Gather all subtask outputs
        result = await self.db.execute(
            select(SubTask)
            .filter(SubTask.task_execution_id == task_execution.id)
            .order_by(SubTask.order_index)
        )
        subtasks = result.scalars().all()

        outputs_text = "\n\n".join([
            f"### {i+1}. {st.description}\n{st.output_data.get('content', 'No output') if st.output_data else 'No output'}"
            for i, st in enumerate(subtasks)
        ])

        review_prompt = f"""Review the following task outputs and provide a final integrated summary.

Original task: {task_execution.task_description}

Review criteria: {decomposition.review_criteria}

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
        final_result: Optional[str]
    ):
        """Finalize task execution, calculate totals, and charge credits"""
        # Sum up all subtask tokens and costs
        result = await self.db.execute(
            select(SubTask).filter(SubTask.task_execution_id == task_execution.id)
        )
        subtasks = result.scalars().all()

        total_input = sum(st.input_tokens or 0 for st in subtasks)
        total_output = sum(st.output_tokens or 0 for st in subtasks)
        total_cost = sum(st.credit_cost or 0 for st in subtasks)

        task_execution.total_input_tokens = total_input
        task_execution.total_output_tokens = total_output
        task_execution.total_credit_cost = total_cost
        task_execution.status = "completed"
        task_execution.completed_at = sa_func.now()
        task_execution.result = {"final_result": final_result} if final_result else None

        # Deduct credits from user
        if total_cost > 0:
            try:
                # 使用原子扣费
                await deduct_credits_atomic(
                    user_id=user_id,
                    cost=total_cost,
                    session=self.db,
                    metadata={
                        "task_execution_id": task_execution.id,
                        "subtask_count": len(subtasks),
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
                logger.error(f"Insufficient credits for user {user_id} in orchestrator finalize. Cost: {total_cost}")
                # 记录失败状态，或者允许透支（取决于业务策略）
                # 这里我们记录错误，但无法回滚已经完成的任务消耗
                pass
            except Exception as e:
                logger.error(f"Failed to deduct credits in orchestrator: {e}")

        await self.db.commit()
