"""
Chat tool dispatch: execute tool calls and append results to messages.

Handles both Anthropic and OpenAI message formats for tool call responses.
Shared by chats.py (with theater_id) and admin_debug.py (theater_id=None).

- Managed tools (base, canvas, image_gen) are delegated to ToolManager.
- load_skill is dispatched independently (skill system is a peer-level concept).
- Every execution is logged to the tool_executions table (non-blocking).
"""
import json
import logging
import time
from typing import TYPE_CHECKING

from services.tool_execution_logger import record_tool_execution

if TYPE_CHECKING:
    from services.tool_manager import ToolManager
    from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)


async def get_tool_result(
    tool_manager: "ToolManager", tc_name: str, tc_args: dict, ctx: "ToolContext",
) -> str:
    """Dispatch tool execution with timing and logging."""
    start = time.perf_counter()
    status = "success"
    try:
        # Skill dispatch (peer-level, NOT a managed provider)
        result = (
            _execute_skill(tc_name, tc_args, ctx)
            if tc_name == "load_skill"
            else await tool_manager.execute_tool(tc_name, tc_args, ctx)
        )
    except Exception as exc:
        result = f"Error: {exc}"
        status = "error"
    duration_ms = int((time.perf_counter() - start) * 1000)
    record_tool_execution(tc_name, tc_args, result, status, duration_ms, ctx)
    return result


def _execute_skill(tc_name: str, tc_args: dict, ctx: "ToolContext") -> str:
    from services.skill_tools import load_skill_content
    from services.tool_manager.context import TOOL_SKILL_GATE_MAP
    skill_name = tc_args.get("skill_name", "")
    # 追踪工具Skill加载（用于 skill-gated 工具动态注入）
    (skill_name in TOOL_SKILL_GATE_MAP) and ctx.loaded_tool_skills.add(skill_name)
    return load_skill_content(skill_name, ctx.active_skills_dir)


async def append_tool_round(
    messages: list, result, tool_manager: "ToolManager", ctx: "ToolContext", is_anthropic: bool,
):
    """Execute tool calls and append results to messages.

    Handles both Anthropic and OpenAI message formats for tool call responses.
    """
    _FORMAT_HANDLERS = {
        True: _append_anthropic_tool_round,
        False: _append_openai_tool_round,
    }
    await _FORMAT_HANDLERS[is_anthropic](messages, result, tool_manager, ctx)


async def _append_anthropic_tool_round(
    messages: list, result, tool_manager: "ToolManager", ctx: "ToolContext",
):
    """Anthropic format: assistant content blocks + user tool_result blocks."""
    assistant_blocks = []
    result.full_response and assistant_blocks.append({"type": "text", "text": result.full_response})
    for tc in result.tool_calls:
        args = json.loads(tc.arguments)
        assistant_blocks.append({
            "type": "tool_use", "id": tc.id, "name": tc.name, "input": args,
        })
    messages.append({"role": "assistant", "content": assistant_blocks})

    tool_results = []
    for tc in result.tool_calls:
        args = json.loads(tc.arguments)
        content = await get_tool_result(tool_manager, tc.name, args, ctx)
        logger.info(f"  {tc.name}({args}) → {len(content)} chars")
        tool_results.append({
            "type": "tool_result", "tool_use_id": tc.id, "content": content,
        })
    messages.append({"role": "user", "content": tool_results})
    result.full_response = ""


async def _append_openai_tool_round(
    messages: list, result, tool_manager: "ToolManager", ctx: "ToolContext",
):
    """OpenAI format: assistant message with tool_calls + tool role messages."""
    assistant_msg = {
        "role": "assistant",
        "content": result.full_response or None,
        "tool_calls": [
            {
                "id": tc.id, "type": "function",
                "function": {"name": tc.name, "arguments": tc.arguments},
                "thought_signature": tc.thought_signature,  # Gemini: preserved for multi-turn
            }
            for tc in result.tool_calls
        ],
    }
    messages.append(assistant_msg)

    for tc in result.tool_calls:
        args = json.loads(tc.arguments)
        content = await get_tool_result(tool_manager, tc.name, args, ctx)
        logger.info(f"  {tc.name}({args}) → {len(content)} chars")
        messages.append({
            "role": "tool", "tool_call_id": tc.id, "content": content,
        })
    result.full_response = ""
