"""P1-3: 极简 PermissionContext —— 3 档 mode + 只读工具白名单。

不同于 AgentScope 2.0 官方的 6 步评估骨架（含建议规则、危险路径 ASK、
用户确认 loop），本模块只提供最小可行的权限决策，覆盖以下诉求：

- ``EXPLORE`` 模式：只读工具放行，其余一律拒绝（适合只读探索会话）
- ``DEFAULT`` 模式：默认策略，权限决策委托给既有 skill_gate 与 tool_manager
- ``BYPASS``  模式：完全信任（后台批处理 / CI）

`ask` 分支（用户确认）本迭代**不实现**，若命中会被降级为 ``DENY``（KunFlix
既有前端尚无对应交互；后续 P2 再补齐）。

挂载点：``ToolManager.execute_tool`` 会在实际 dispatch 前调用
``check_tool_permission(mode, tool_name)``。DENY 时返回结构化 error 字符串，
LLM 可读并调整策略。
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class PermissionMode(str, Enum):
    """3 档权限模式；字符串枚举方便 DB / JSON 存取。"""

    EXPLORE = "explore"
    DEFAULT = "default"
    BYPASS = "bypass"


class PermissionBehavior(str, Enum):
    ALLOW = "allow"
    DENY = "deny"


@dataclass(frozen=True)
class PermissionDecision:
    behavior: PermissionBehavior
    reason: str = ""

    @property
    def denied(self) -> bool:
        return self.behavior == PermissionBehavior.DENY

    def as_error_message(self, tool_name: str) -> str:
        """DENY 决策格式化为 LLM 可读的 error 字符串。"""
        return f"[permission_denied] Tool '{tool_name}' blocked: {self.reason}"


# ---------------------------------------------------------------------------
# 只读工具白名单
# ---------------------------------------------------------------------------
#
# EXPLORE 模式下允许调用的工具集合。
# 白名单是**保守**的：新工具默认不在其中，避免 EXPLORE 意外放行写操作。
# 后续新增只读工具时在此显式登记。
READ_ONLY_TOOLS: frozenset[str] = frozenset({
    # canvas 只读
    "list_canvas_nodes",
    "get_canvas_node",
})


def _coerce_mode(raw: str | PermissionMode | None) -> PermissionMode:
    """把字符串 / None / enum 归一为 PermissionMode；未知值兜底 DEFAULT。"""
    if isinstance(raw, PermissionMode):
        return raw
    if not raw:
        return PermissionMode.DEFAULT
    try:
        return PermissionMode(str(raw).lower())
    except ValueError:
        return PermissionMode.DEFAULT


def check_tool_permission(
    mode: str | PermissionMode | None,
    tool_name: str,
) -> PermissionDecision:
    """P1-3: 前置权限决策。

    - ``BYPASS`` → ALLOW（无条件；deny 语义未来 P2 再补齐）
    - ``EXPLORE`` → 命中 READ_ONLY_TOOLS 才 ALLOW，其余 DENY
    - ``DEFAULT`` → ALLOW（不额外拦截；委托给既有 skill_gate / tool 内部检查）

    Args:
        mode: PermissionMode 或其等价字符串（来自 Agent.permission_mode DB 字段）
        tool_name: 待执行的工具名（OpenAI tool.function.name）

    Returns:
        PermissionDecision（``behavior`` + ``reason``），永远返回 ALLOW/DENY。
    """
    resolved = _coerce_mode(mode)

    _handlers = {
        PermissionMode.BYPASS: lambda: PermissionDecision(
            behavior=PermissionBehavior.ALLOW,
            reason="bypass mode",
        ),
        PermissionMode.EXPLORE: lambda: (
            PermissionDecision(
                behavior=PermissionBehavior.ALLOW,
                reason="read-only tool allowed in explore mode",
            )
            if tool_name in READ_ONLY_TOOLS
            else PermissionDecision(
                behavior=PermissionBehavior.DENY,
                reason=(
                    f"tool '{tool_name}' is not in the read-only whitelist "
                    "and explore mode forbids write operations"
                ),
            )
        ),
        PermissionMode.DEFAULT: lambda: PermissionDecision(
            behavior=PermissionBehavior.ALLOW,
            reason="default policy delegates to skill_gate / tool checks",
        ),
    }
    return _handlers[resolved]()


__all__ = [
    "PermissionMode",
    "PermissionBehavior",
    "PermissionDecision",
    "READ_ONLY_TOOLS",
    "check_tool_permission",
]
