"""
Chat tool dispatch: execute tool calls and append results to messages.

Handles both Anthropic and OpenAI message formats for tool call responses.
Shared by chats.py (with theater_id) and admin_debug.py (theater_id=None).
"""
import json
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from models import Agent
from services.skill_tools import load_skill_content
from services.base_tools import execute_base_tool
from services.canvas_tools import CANVAS_TOOL_NAMES, execute_canvas_tool
from services.image_gen_tools import IMAGE_GEN_TOOL_NAME, execute_image_gen_tool

logger = logging.getLogger(__name__)


async def get_tool_result(
    tc_name: str, tc_args: dict, active_skills_dir, theater_id: str | None,
    agent: Agent, db: AsyncSession
) -> str:
    """Dispatch tool execution by name. Returns result string."""
    _ASYNC_DISPATCHERS = {
        IMAGE_GEN_TOOL_NAME: lambda: execute_image_gen_tool(tc_args, agent, db),
    }
    is_canvas = tc_name in CANVAS_TOOL_NAMES and theater_id and agent.target_node_types
    async_handler = (
        (lambda: execute_canvas_tool(tc_name, tc_args, theater_id, agent.target_node_types, db, agent_id=agent.id))
        if is_canvas
        else _ASYNC_DISPATCHERS.get(tc_name)
    )
    return await async_handler() if async_handler else dispatch_standard_tool(tc_name, tc_args, active_skills_dir)


def dispatch_standard_tool(tc_name: str, tc_args: dict, active_skills_dir) -> str:
    """Dispatch standard (sync) tools."""
    _DISPATCH = {
        "load_skill": lambda args: load_skill_content(args.get("skill_name", ""), active_skills_dir),
    }
    handler = _DISPATCH.get(tc_name) or (lambda args: execute_base_tool(tc_name, args))
    return handler(tc_args)


async def append_tool_round(
    messages: list, result, active_skills_dir, is_anthropic: bool,
    theater_id: str | None, agent: Agent, db: AsyncSession
):
    """Execute tool calls and append results to messages.

    Handles both Anthropic and OpenAI message formats for tool call responses.
    """
    _FORMAT_HANDLERS = {
        True: _append_anthropic_tool_round,
        False: _append_openai_tool_round,
    }
    await _FORMAT_HANDLERS[is_anthropic](messages, result, active_skills_dir, theater_id, agent, db)


async def _append_anthropic_tool_round(
    messages: list, result, active_skills_dir,
    theater_id: str | None, agent: Agent, db: AsyncSession
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
        content = await get_tool_result(tc.name, args, active_skills_dir, theater_id, agent, db)
        logger.info(f"  {tc.name}({args}) → {len(content)} chars")
        tool_results.append({
            "type": "tool_result", "tool_use_id": tc.id, "content": content,
        })
    messages.append({"role": "user", "content": tool_results})
    result.full_response = ""


async def _append_openai_tool_round(
    messages: list, result, active_skills_dir,
    theater_id: str | None, agent: Agent, db: AsyncSession
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
        content = await get_tool_result(tc.name, args, active_skills_dir, theater_id, agent, db)
        logger.info(f"  {tc.name}({args}) → {len(content)} chars")
        messages.append({
            "role": "tool", "tool_call_id": tc.id, "content": content,
        })
    result.full_response = ""
