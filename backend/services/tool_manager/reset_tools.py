"""
reset_tools — AgentScope-style meta-tool for dynamic tool group management.

Allows the agent to activate/deactivate tool groups at runtime, keeping only
relevant tools in the LLM context window and reducing token waste.

Design principles (aligned with AgentScope 2.0 ToolGroup):
- Final-state semantics: each call declares the COMPLETE desired state
- Groups not mentioned are DEACTIVATED (not incremental)
- The "basic" group (load_skill + reset_tools) is always active
- Coexists with skill-gate: reset_tools controls group visibility,
  load_skill controls skill content loading
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from services.tool_manager.context import TOOL_GROUPS

if TYPE_CHECKING:
    from services.tool_manager.context import ToolContext


def build_reset_tools_def(available_groups: list[str]) -> dict:
    """Build OpenAI-format tool definition for the reset_tools meta-tool.

    Only includes groups that are potentially available for the current agent/context.
    """
    properties = {
        group: {
            "type": "boolean",
            "description": TOOL_GROUPS[group].description,
        }
        for group in available_groups
        if group in TOOL_GROUPS
    }
    return {
        "type": "function",
        "function": {
            "name": "reset_tools",
            "description": (
                "Activate or deactivate tool groups to manage context window usage. "
                "Each parameter represents a tool group — set to true to activate, false to deactivate. "
                "Groups NOT mentioned will be DEACTIVATED (final-state semantics). "
                "Use this to keep only relevant tools active and reduce context noise. "
                "The load_skill and reset_tools meta-tools are always available regardless of group state."
            ),
            "parameters": {
                "type": "object",
                "properties": properties,
            },
        },
    }


def execute_reset_tools(args: dict, ctx: "ToolContext") -> str:
    """Execute reset_tools: set group overrides and return activation instructions.

    Final-state semantics: groups not mentioned in args are deactivated.
    """
    overrides = {k: bool(v) for k, v in args.items() if k in TOOL_GROUPS}
    # Final-state: unmentioned groups → False
    full_overrides = {g: overrides.get(g, False) for g in TOOL_GROUPS}
    ctx.set_group_overrides(full_overrides)

    activated = [g for g, v in full_overrides.items() if v]
    deactivated = [g for g, v in full_overrides.items() if not v]

    parts = [f"Tool groups updated. Active: [{', '.join(activated or ['none'])}], Deactivated: [{', '.join(deactivated or ['none'])}]"]
    # Append instructions for newly activated groups
    for g in activated:
        instr = TOOL_GROUPS[g].instructions
        instr and parts.append(f"[{g}] {instr}")
    return "\n".join(parts)
