"""
Chat tool dispatch: execute tool calls and append results to messages.

Handles both Anthropic and OpenAI message formats for tool call responses.
Shared by chats.py (with theater_id) and admin_debug.py (theater_id=None).

- Managed tools (base, canvas, image_gen) are delegated to ToolManager.
- load_skill is dispatched independently (skill system is a peer-level concept).
- Every execution is logged to the tool_executions table (non-blocking).
"""
import asyncio
import json
import logging
import time
from dataclasses import replace
from typing import TYPE_CHECKING

from database import AsyncSessionLocal
from services.tool_execution_logger import record_tool_execution

if TYPE_CHECKING:
    from services.tool_manager import ToolManager
    from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)


async def get_tool_result(
    tool_manager: "ToolManager", tc_name: str, tc_args: dict, ctx: "ToolContext",
) -> str:
    """Dispatch tool execution with timing and logging."""
    # 容错：LLM 可能发送 "skill_name:tool_name" 格式（如 "video_tools:generate_video"），自动提取真实工具名
    tc_name = tc_name.rsplit(":", 1)[-1] if ":" in tc_name else tc_name
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
    # 清理 skill_name：去除空白字符和引号
    skill_name = tc_args.get("skill_name", "")
    skill_name = skill_name.strip().strip('"\'')
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


async def append_tool_round_with_errors(
    messages: list, result, tool_manager: "ToolManager", ctx: "ToolContext", is_anthropic: bool,
    valid_calls: list, error_calls: list,
):
    """Execute tool calls with error handling and append results to messages.

    Args:
        valid_calls: List of (tool_call, parsed_args) tuples for successful parsing
        error_calls: List of (tool_call, error_message) tuples for failed parsing
    """
    _FORMAT_HANDLERS = {
        True: _append_anthropic_tool_round_with_errors,
        False: _append_openai_tool_round_with_errors,
    }
    await _FORMAT_HANDLERS[is_anthropic](messages, result, tool_manager, ctx, valid_calls, error_calls)


# Canvas mutation tools that must run sequentially to avoid position conflicts
_CANVAS_SEQUENTIAL_TOOLS = frozenset({
    "create_canvas_node", "update_canvas_node", "delete_canvas_node",
    "create_canvas_edge", "delete_canvas_edge",
})


async def _execute_valid_calls_parallel(
    valid_calls: list, tool_manager: "ToolManager", ctx: "ToolContext",
) -> list[tuple[str, str]]:
    """Execute valid tool calls, return list of (tc_id, content).

    Most tools are fired concurrently via asyncio.gather so independent API
    calls (e.g. 3× edit_image) run in parallel instead of sequentially.

    Canvas mutation tools (create/update/delete node/edge) are executed
    sequentially so each call sees the previous commit and auto-position
    calculations don't collide.

    Each parallel task gets its own AsyncSession to avoid SQLAlchemy
    ``IllegalStateChangeError`` when multiple tools commit concurrently.
    """

    # Single tool – reuse the existing session, no extra overhead
    if len(valid_calls) == 1:
        tc, args = valid_calls[0]
        content = await get_tool_result(tool_manager, tc.name, args, ctx)
        logger.info(f"  {tc.name}({args}) → {len(content)} chars")
        return [(tc.id, content)]

    # Split into sequential (canvas mutations) and parallel (everything else)
    sequential_calls = [(tc, args) for tc, args in valid_calls if tc.name in _CANVAS_SEQUENTIAL_TOOLS]
    parallel_calls = [(tc, args) for tc, args in valid_calls if tc.name not in _CANVAS_SEQUENTIAL_TOOLS]

    results: list[tuple[str, str]] = []

    # Helper for parallel tasks with isolated DB sessions
    async def _run(tc, args):
        async with AsyncSessionLocal() as session:
            isolated_ctx = replace(ctx, db=session)
            content = await get_tool_result(tool_manager, tc.name, args, isolated_ctx)
            logger.info(f"  {tc.name}({args}) → {len(content)} chars")
            return tc.id, content

    # Run canvas mutations sequentially (each needs to see prior commits)
    async def _run_sequential():
        seq_results = []
        for tc, args in sequential_calls:
            async with AsyncSessionLocal() as session:
                isolated_ctx = replace(ctx, db=session)
                content = await get_tool_result(tool_manager, tc.name, args, isolated_ctx)
                logger.info(f"  {tc.name}({args}) → {len(content)} chars")
                seq_results.append((tc.id, content))
        return seq_results

    # Execute both groups concurrently: sequential canvas ops as one task,
    # parallel ops each as their own task
    tasks = []
    sequential_calls and tasks.append(_run_sequential())
    tasks.extend(_run(tc, args) for tc, args in parallel_calls)

    gathered = await asyncio.gather(*tasks)

    # Unpack results: first item is a list (sequential), rest are tuples (parallel)
    results = []
    gi = 0
    if sequential_calls:
        results.extend(gathered[gi])
        gi += 1
    for _ in parallel_calls:
        results.append(gathered[gi])
        gi += 1

    return results


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
    
    results = await _execute_valid_calls_parallel(
        [(tc, json.loads(tc.arguments)) for tc in result.tool_calls], tool_manager, ctx,
    )
    tool_results = [
        {"type": "tool_result", "tool_use_id": tc_id, "content": content}
        for tc_id, content in results
    ]
    messages.append({"role": "user", "content": tool_results})
    result.full_response = ""


async def _append_anthropic_tool_round_with_errors(
    messages: list, result, tool_manager: "ToolManager", ctx: "ToolContext",
    valid_calls: list, error_calls: list,
):
    """Anthropic format with error handling: assistant content blocks + user tool_result blocks."""
    assistant_blocks = []
    result.full_response and assistant_blocks.append({"type": "text", "text": result.full_response})
    
    # 添加所有 tool_calls（包括有效和错误的）
    all_calls = [tc for tc, _ in valid_calls] + [tc for tc, _ in error_calls]
    for tc in all_calls:
        # 对于错误调用，使用空对象作为 input
        args = {}
        for valid_tc, valid_args in valid_calls:
            if valid_tc.id == tc.id:
                args = valid_args
                break
        assistant_blocks.append({
            "type": "tool_use", "id": tc.id, "name": tc.name, "input": args,
        })
    messages.append({"role": "assistant", "content": assistant_blocks})
    
    # 并行执行有效调用
    results = await _execute_valid_calls_parallel(valid_calls, tool_manager, ctx)
    results_map = dict(results)
    
    tool_results = [
        {"type": "tool_result", "tool_use_id": tc.id, "content": results_map[tc.id]}
        for tc, _ in valid_calls
    ]
    # 处理错误调用 - 直接返回错误信息
    for tc, error_msg in error_calls:
        logger.info(f"  {tc.name}(ERROR) \u2192 {error_msg}")
        tool_results.append({
            "type": "tool_result", "tool_use_id": tc.id, "content": error_msg,
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
    
    results = await _execute_valid_calls_parallel(
        [(tc, json.loads(tc.arguments)) for tc in result.tool_calls], tool_manager, ctx,
    )
    for tc_id, content in results:
        messages.append({
            "role": "tool", "tool_call_id": tc_id, "content": content,
        })
    result.full_response = ""


async def _append_openai_tool_round_with_errors(
    messages: list, result, tool_manager: "ToolManager", ctx: "ToolContext",
    valid_calls: list, error_calls: list,
):
    """OpenAI format with error handling: assistant message with tool_calls + tool role messages."""
    # 构建所有 tool_calls（包括有效和错误的）
    all_calls = [tc for tc, _ in valid_calls] + [tc for tc, _ in error_calls]
    assistant_msg = {
        "role": "assistant",
        "content": result.full_response or None,
        "tool_calls": [
            {
                "id": tc.id, "type": "function",
                "function": {"name": tc.name, "arguments": tc.arguments},
                "thought_signature": tc.thought_signature,
            }
            for tc in all_calls
        ],
    }
    messages.append(assistant_msg)
    
    # 并行执行有效调用
    results = await _execute_valid_calls_parallel(valid_calls, tool_manager, ctx)
    results_map = dict(results)
    for tc, _ in valid_calls:
        messages.append({
            "role": "tool", "tool_call_id": tc.id, "content": results_map[tc.id],
        })
    # 处理错误调用 - 直接返回错误信息
    for tc, error_msg in error_calls:
        logger.info(f"  {tc.name}(ERROR) \u2192 {error_msg}")
        messages.append({
            "role": "tool", "tool_call_id": tc.id, "content": error_msg,
        })
    result.full_response = ""
