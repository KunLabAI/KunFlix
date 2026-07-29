"""P1-4: Team 内置工具 —— 5 个 OpenAI function-calling schema + 执行逻辑。

当 Agent.orchestration_style == 'team_tools' 时，leader 的 ReAct 循环
会获得这 5 个工具。leader 通过 tool-call 增量组建团队、派生 worker、
交换消息、解散。

工具执行逻辑全部**内联**在本模块（单进程同步调用 execute_for_subtask）。
分布式消息总线 / inbox 投递属于 P2 范围。
"""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import SubAgentTemplate, SubTask, TaskExecution
from services.agent_executor import AgentExecutor
from services.team_events import TeamEventType, team_event

logger = logging.getLogger(__name__)


# =============================================================================
# Tool Definitions (OpenAI function-calling format)
# =============================================================================

TEAM_TOOL_DEFS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "team_create",
            "description": "Initialize a team context. Call this first before spawning workers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Short team name for this collaboration."},
                    "description": {"type": "string", "description": "Goal / purpose of the team."},
                },
                "required": ["name", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "worker_spawn",
            "description": "Spawn a new worker from a SubAgentTemplate blueprint and assign it a task.",
            "parameters": {
                "type": "object",
                "properties": {
                    "template_type": {
                        "type": "string",
                        "description": "The blueprint type to use (e.g., 'researcher', 'writer', 'reviewer').",
                    },
                    "member_name": {"type": "string", "description": "Display name for this worker."},
                    "member_description": {"type": "string", "description": "Role description for this worker."},
                    "task": {"type": "string", "description": "The task / instruction for the worker."},
                },
                "required": ["template_type", "member_name", "task"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "worker_say",
            "description": "Send a follow-up message to an existing worker (continues their conversation).",
            "parameters": {
                "type": "object",
                "properties": {
                    "worker_key": {"type": "string", "description": "The worker key returned by worker_spawn."},
                    "message": {"type": "string", "description": "The message / instruction to send."},
                },
                "required": ["worker_key", "message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "worker_dismiss",
            "description": "Dismiss a worker, marking their work as complete.",
            "parameters": {
                "type": "object",
                "properties": {
                    "worker_key": {"type": "string", "description": "The worker key to dismiss."},
                },
                "required": ["worker_key"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "team_end",
            "description": "End the team collaboration and provide the final integrated result.",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary": {"type": "string", "description": "Final integrated result / summary to return to the user."},
                },
                "required": ["summary"],
            },
        },
    },
]

TEAM_TOOL_NAMES: frozenset = frozenset(
    d["function"]["name"] for d in TEAM_TOOL_DEFS
)


# =============================================================================
# Runtime Context (per task_execution)
# =============================================================================

@dataclass
class _WorkerState:
    """单个 worker 的运行时状态（进程内，task 结束后丢弃）。"""
    key: str
    template_type: str
    member_name: str
    member_description: str = ""
    subtask_id: str = ""          # 对应 SubTask.id
    state_key: str = ""           # execute_for_subtask 使用的持久化 key
    status: str = "running"       # running / completed / dismissed
    last_output: str = ""


@dataclass
class TeamContext:
    """团队工具的运行时上下文。一个 task_execution 对应一个 TeamContext。"""
    task_execution_id: str = ""
    team_name: str = ""
    team_description: str = ""
    leader_name: str = ""
    leader_agent_id: str = ""
    workers: Dict[str, _WorkerState] = field(default_factory=dict)
    _worker_counter: int = 0
    final_result: Optional[str] = None  # team_end 设置
    ended: bool = False

    def next_worker_key(self) -> str:
        self._worker_counter += 1
        return f"W{self._worker_counter}"


# =============================================================================
# Tool Executor
# =============================================================================

class TeamToolExecutor:
    """P1-4: Team 工具的执行器。

    被 orchestrator._handle_team_tools_task 路径调用；每次 tool_call 传入
    tool_name + args，返回 (result_str, events_to_yield)。
    """

    def __init__(
        self,
        db: AsyncSession,
        executor: AgentExecutor,
        task_execution: TaskExecution,
        leader_name: str,
        leader_agent_id: str,
        available_template_types: List[str],
    ):
        self.db = db
        self.executor = executor
        self.task_execution = task_execution
        self.available_template_types = available_template_types
        self.ctx = TeamContext(
            task_execution_id=task_execution.id,
            leader_name=leader_name,
            leader_agent_id=leader_agent_id,
        )

    async def execute(self, tool_name: str, args: Dict[str, Any]) -> tuple[str, list]:
        """执行一个 team 工具调用。

        Returns:
            (result_str, events): result_str 作为 tool result 返回 LLM；
            events 是需要 yield 的 OrchestrationEvent 列表。
        """
        handler = self._dispatch.get(tool_name)
        if not handler:
            return f"Unknown team tool: {tool_name}", []
        return await handler(self, args)

    # ----- team_create -----
    async def _handle_team_create(self, args: Dict) -> tuple[str, list]:
        self.ctx.team_name = args.get("name", "Unnamed Team")
        self.ctx.team_description = args.get("description", "")
        events = [
            team_event(
                TeamEventType.TEAM_CREATED,
                task_execution_id=self.ctx.task_execution_id,
                team_name=self.ctx.team_name,
                agent_name=self.ctx.leader_name,
                message=self.ctx.team_description,
            )
        ]
        return f"Team '{self.ctx.team_name}' created. You can now spawn workers.", events

    # ----- worker_spawn -----
    async def _handle_worker_spawn(self, args: Dict) -> tuple[str, list]:
        template_type = args.get("template_type", "")
        member_name = args.get("member_name", template_type)
        member_description = args.get("member_description", "")
        task = args.get("task", "")

        # 校验 template_type 可用
        if template_type not in self.available_template_types:
            return (
                f"Error: template_type '{template_type}' is not available. "
                f"Available: {self.available_template_types}",
                [],
            )

        # 加载蓝图
        result = await self.db.execute(
            select(SubAgentTemplate).filter(SubAgentTemplate.type == template_type)
        )
        template = result.scalars().first()
        if not template:
            return f"Error: template '{template_type}' not found in database.", []

        # 渲染 system_prompt
        prompt_ctx = {
            "team_name": self.ctx.team_name or "Team",
            "team_description": self.ctx.team_description or task,
            "member_name": member_name,
            "member_description": member_description or template.description,
            "leader_name": self.ctx.leader_name,
        }
        try:
            rendered_prompt = template.system_prompt_template.format(**prompt_ctx)
        except (KeyError, ValueError) as e:
            rendered_prompt = template.system_prompt_template
            logger.warning("Template prompt render failed for %s: %s", template_type, e)

        # 创建 SubTask 记录
        worker_key = self.ctx.next_worker_key()
        subtask = SubTask(
            task_execution_id=self.ctx.task_execution_id,
            agent_id=self.ctx.leader_agent_id,  # 使用 leader 的 provider/model
            description=f"[{worker_key}:{template_type}] {task[:200]}",
            order_index=self.ctx._worker_counter,
            status="running",
        )
        self.db.add(subtask)
        await self.db.flush()

        state_key = f"{self.ctx.task_execution_id}:{subtask.id}"

        # 执行 worker（使用 per-subtask state）
        exec_result = await self.executor.execute_for_subtask(
            agent_id=self.ctx.leader_agent_id,
            messages=[{"role": "user", "content": task}],
            subtask_state_key=state_key,
            context={"worker_key": worker_key, "template_type": template_type},
        )

        # 更新 subtask 记录
        subtask.status = "completed"
        subtask.output_data = {"content": exec_result.content}
        subtask.input_tokens = exec_result.input_tokens
        subtask.output_tokens = exec_result.output_tokens
        await self.db.flush()

        # 注册 worker 状态
        self.ctx.workers[worker_key] = _WorkerState(
            key=worker_key,
            template_type=template_type,
            member_name=member_name,
            member_description=member_description,
            subtask_id=subtask.id,
            state_key=state_key,
            status="running",
            last_output=exec_result.content,
        )

        events = [
            team_event(
                TeamEventType.WORKER_SPAWNED,
                task_execution_id=self.ctx.task_execution_id,
                worker_key=worker_key,
                worker_template_type=template_type,
                agent_name=member_name,
                message=task[:200],
            ),
            team_event(
                TeamEventType.WORKER_COMPLETED,
                task_execution_id=self.ctx.task_execution_id,
                worker_key=worker_key,
                agent_name=member_name,
                result=exec_result.content[:500],
            ),
        ]

        return (
            f"Worker '{member_name}' (key={worker_key}, type={template_type}) completed.\n\n"
            f"Output:\n{exec_result.content}"
        ), events

    # ----- worker_say -----
    async def _handle_worker_say(self, args: Dict) -> tuple[str, list]:
        worker_key = args.get("worker_key", "")
        message = args.get("message", "")

        worker = self.ctx.workers.get(worker_key)
        if not worker:
            return f"Error: worker '{worker_key}' not found. Active workers: {list(self.ctx.workers.keys())}", []
        if worker.status == "dismissed":
            return f"Error: worker '{worker_key}' has been dismissed.", []

        # 使用同一 state_key 继续对话（worker 记得之前的上下文）
        exec_result = await self.executor.execute_for_subtask(
            agent_id=self.ctx.leader_agent_id,
            messages=[{"role": "user", "content": message}],
            subtask_state_key=worker.state_key,
            context={"worker_key": worker_key, "follow_up": True},
        )

        worker.last_output = exec_result.content

        events = [
            team_event(
                TeamEventType.WORKER_MESSAGE,
                task_execution_id=self.ctx.task_execution_id,
                worker_key=worker_key,
                agent_name=worker.member_name,
                message=message[:200],
                result=exec_result.content[:500],
            ),
        ]

        return f"Worker '{worker.member_name}' replied:\n{exec_result.content}", events

    # ----- worker_dismiss -----
    async def _handle_worker_dismiss(self, args: Dict) -> tuple[str, list]:
        worker_key = args.get("worker_key", "")
        worker = self.ctx.workers.get(worker_key)
        if not worker:
            return f"Error: worker '{worker_key}' not found.", []
        worker.status = "dismissed"
        events = [
            team_event(
                TeamEventType.WORKER_DISMISSED,
                task_execution_id=self.ctx.task_execution_id,
                worker_key=worker_key,
                agent_name=worker.member_name,
            ),
        ]
        return f"Worker '{worker.member_name}' dismissed.", events

    # ----- team_end -----
    async def _handle_team_end(self, args: Dict) -> tuple[str, list]:
        summary = args.get("summary", "")
        self.ctx.final_result = summary
        self.ctx.ended = True
        events = [
            team_event(
                TeamEventType.TEAM_DISSOLVED,
                task_execution_id=self.ctx.task_execution_id,
                team_name=self.ctx.team_name,
                agent_name=self.ctx.leader_name,
                result=summary[:500],
            ),
        ]
        return "Team collaboration ended. Final result delivered.", events

    # ----- Dispatch table -----
    _dispatch = {
        "team_create": _handle_team_create,
        "worker_spawn": _handle_worker_spawn,
        "worker_say": _handle_worker_say,
        "worker_dismiss": _handle_worker_dismiss,
        "team_end": _handle_team_end,
    }


__all__ = [
    "TEAM_TOOL_DEFS",
    "TEAM_TOOL_NAMES",
    "TeamToolExecutor",
    "TeamContext",
]
