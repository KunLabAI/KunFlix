"""P1-5: 标准化 Team 事件类型与 payload schema。

统一 orchestrator 中 team-specific 事件的命名空间与数据结构，
为 P1-4 Team 工具骨架提供事件发射基础。

既有 orchestrator 事件（task_start / subtask_created / subtask_chunk 等）保持原样，
本模块只定义 **team 层级** 的新事件。这些事件通过 sse_tee 自动进入 Redis Stream，
前端通过 SSE 订阅即可收到，无需额外传输配置。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Optional


class TeamEventType(str, Enum):
    """Team-specific SSE 事件类型（str enum 便于直接序列化为 SSE event name）。"""

    # 团队生命周期
    TEAM_CREATED = "team_created"
    TEAM_DISSOLVED = "team_dissolved"

    # Worker 生命周期
    WORKER_SPAWNED = "worker_spawned"
    WORKER_MESSAGE = "worker_message"       # leader → worker 或 worker → leader
    WORKER_COMPLETED = "worker_completed"
    WORKER_DISMISSED = "worker_dismissed"


@dataclass
class TeamEventPayload:
    """Team 事件的标准化 payload 结构。

    OrchestrationEvent(event_type=TeamEventType.XXX, data=payload.to_dict()) 使用。
    非 team 事件（legacy 路径）不需要使用此 dataclass。
    """

    task_execution_id: str = ""
    team_name: str = ""
    worker_key: str = ""                # worker 标识（SubTaskSpec.key / template_type instance）
    worker_template_type: str = ""      # 使用的蓝图 type
    agent_name: str = ""                # leader 或 worker 的展示名
    message: str = ""                   # 消息内容（worker_message 时使用）
    result: str = ""                    # worker 完成时的输出
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """转为可 JSON 序列化的 dict（排除空值以减少 payload 体积）。"""
        d: Dict[str, Any] = {}
        self.task_execution_id and d.update(task_execution_id=self.task_execution_id)
        self.team_name and d.update(team_name=self.team_name)
        self.worker_key and d.update(worker_key=self.worker_key)
        self.worker_template_type and d.update(worker_template_type=self.worker_template_type)
        self.agent_name and d.update(agent_name=self.agent_name)
        self.message and d.update(message=self.message)
        self.result and d.update(result=self.result)
        self.metadata and d.update(metadata=self.metadata)
        return d


# ---------------------------------------------------------------------------
# Helper: 构造 OrchestrationEvent 的便捷工厂
# ---------------------------------------------------------------------------

def team_event(event_type: TeamEventType, **kwargs) -> "OrchestrationEvent":
    """快速构造一个 team OrchestrationEvent。

    Example::

        yield team_event(TeamEventType.WORKER_SPAWNED, worker_key="W1", worker_template_type="researcher")
    """
    # 延迟导入避免循环依赖（team_events 被 orchestrator import）
    from services.orchestrator import OrchestrationEvent
    payload = TeamEventPayload(**kwargs)
    return OrchestrationEvent(event_type=event_type.value, data=payload.to_dict())


__all__ = [
    "TeamEventType",
    "TeamEventPayload",
    "team_event",
]
