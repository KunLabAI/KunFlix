"""
Multi-agent chat generation: orchestration routing, complex task execution, message saving.
"""
import json
import logging

from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, safe_commit
from models import Agent, ChatSession, ChatMessage
from services.chat_utils import (
    sse, deserialize_content, extract_media_filename,
    image_file_to_data_url, inject_image_to_message,
)
from services.chat_generation import generate_single_agent
from services.orchestrator import DynamicOrchestrator
from services.media_utils import resolve_media_filepath

logger = logging.getLogger(__name__)


async def generate_multi_agent(
    db: AsyncSession,
    agent: Agent,
    content: str,
    entity_id: str,
    session_id: str,
    is_admin: bool = False,
    theater_id: str | None = None,
    edit_last_image: bool = False,
    target_node_id: str | None = None,
    edit_image_url: str | None = None,
):
    """Multi-agent collaborative generator (unified: auto-routes simple vs complex tasks)."""
    logger.info(f"\n{'='*60}")
    logger.info(f"[Multi-Agent] Leader: {agent.name} (ID: {agent.id})")
    logger.info(f"Member agents: {agent.member_agent_ids}")
    logger.info(f"Session: {session_id} | {'Admin' if is_admin else 'User'}: {entity_id}")
    logger.info(f"Task: {content}")
    logger.info(f"{'='*60}\n")

    # Fetch conversation history for task analysis context
    history_messages = await _fetch_history_messages(db, session_id)

    # Task analysis: classify simple vs complex (with history for context)
    orchestrator = DynamicOrchestrator(db)
    analysis = await orchestrator.analyze_task(agent.id, content, history_messages=history_messages)
    logger.info(f"[Multi-Agent] Task analysis: is_simple={analysis.is_simple}")

    # Route: simple -> single-agent (full tool/canvas/skill support)
    #        complex -> multi-agent orchestration
    _generators = {
        True: lambda: generate_single_agent(
            db, agent, content, entity_id, session_id, is_admin,
            edit_last_image, theater_id, target_node_id, edit_image_url
        ),
        False: lambda: _execute_complex_multi_agent(
            orchestrator, db, agent, content, entity_id, session_id,
            is_admin, theater_id, analysis, edit_image_url, target_node_id,
            history_messages=history_messages,
        ),
    }
    async for chunk in _generators[analysis.is_simple]():
        yield chunk


async def _fetch_history_messages(db: AsyncSession, session_id: str) -> list[dict]:
    """Fetch conversation history for the session (excluding the last user message)."""
    history_result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    history = history_result.scalars().all()

    messages = []
    for msg in history[:-1]:
        role = msg.role if msg.role in ("user", "assistant") else "user"
        deserialized = deserialize_content(msg.content)
        content_val = (
            deserialized.get("text") or ""
            if role == "assistant" and isinstance(deserialized, dict) and "text" in deserialized
            else deserialized
        )
        messages.append({"role": role, "content": content_val})
    return messages


async def save_multi_agent_message(
    session_id: str,
    final_result: str,
    tokens_used: int = 0,
    multi_agent_data: dict | None = None,
):
    """Save multi-agent collaboration assistant message with steps data."""
    # 序列化：与单智能体一致的 JSON 结构 {text, multi_agent}
    content = json.dumps({
        "text": final_result,
        "multi_agent": multi_agent_data,
    }, ensure_ascii=False) if multi_agent_data else final_result

    async with AsyncSessionLocal() as session:
        try:
            assistant_msg = ChatMessage(
                session_id=session_id,
                role="assistant",
                content=content,
            )
            session.add(assistant_msg)

            from sqlalchemy import func as sa_func
            s_result = await session.execute(select(ChatSession).filter(ChatSession.id == session_id))
            s = s_result.scalars().first()
            s and setattr(s, 'updated_at', sa_func.now())
            tokens_used > 0 and s and setattr(s, 'total_tokens_used', (s.total_tokens_used or 0) + tokens_used)

            await safe_commit(session)
        except Exception as e:
            logger.error(f"Failed to save multi-agent message: {e}")


async def _execute_complex_multi_agent(
    orchestrator: DynamicOrchestrator,
    db: AsyncSession,
    agent: Agent,
    content: str,
    entity_id: str,
    session_id: str,
    is_admin: bool,
    theater_id: str | None,
    analysis,
    edit_image_url: str | None = None,
    target_node_id: str | None = None,
    history_messages: list[dict] | None = None,
):
    """Execute complex task multi-agent collaboration."""
    history_messages = history_messages or []

    # 图片编辑上下文注入：将画布节点的图片注入到历史消息的最后一条用户消息
    edit_image_data_url = None
    if edit_image_url:
        filename = extract_media_filename(edit_image_url)
        if filename:
            _resolved = resolve_media_filepath(filename)
            _local_path = str(_resolved) if _resolved else None
            _local_path and (edit_image_data_url := await image_file_to_data_url(_local_path))
            edit_image_data_url and logger.info(f"[Multi-Agent] Injected edit image: {filename}")
    
    # 将图片注入到最后一条用户消息或添加新的用户消息
    if edit_image_data_url and history_messages:
        # 找到最后一条用户消息并注入图片
        for i in range(len(history_messages) - 1, -1, -1):
            if history_messages[i].get("role") == "user":
                inject_image_to_message(history_messages[i], edit_image_data_url)
                break
        else:
            # 如果没有用户消息，创建一个包含图片的用户消息
            history_messages.append({
                "role": "user",
                "content": [{"type": "image_url", "image_url": {"url": edit_image_data_url}}]
            })

    final_result = None
    billing_data = {}
    # 收集多智能体协作步骤数据用于持久化
    steps_collector: dict[str, dict] = {}  # subtask_id -> step data
    orchestration_meta: dict = {}  # team_name, leader_name, orchestration_style

    async for event in orchestrator.execute(
        task_description=content,
        user_id=entity_id,
        leader_agent_id=agent.id,
        session_id=session_id,
        theater_id=theater_id,
        max_iterations=agent.max_subtasks or 5,
        enable_review=agent.enable_auto_review or False,
        history_messages=history_messages,
        pre_analysis=analysis,
        is_admin=is_admin,
    ):
        # 记录事件（过滤高频chunk和text事件）
        event.event_type not in ("subtask_chunk", "subtask_tool_call", "subtask_tool_result", "text") and logger.info(f"[Orchestration] {event.event_type}: {event.data}")

        # ── 收集步骤数据用于持久化 ──
        _collect_step_data(event, steps_collector, orchestration_meta)

        # 捕获最终结果和计费信息
        (event.event_type == "task_completed") and (
            final_result := event.data.get("result", ""),
            billing_data.update({
                "credit_cost": event.data.get("total_credit_cost", 0),
                "billing_status": event.data.get("billing_status", "success"),
                "context_usage": event.data.get("context_usage"),
            }),
        )

        yield event.to_sse()

    # 构建 multi_agent 持久化数据
    multi_agent_data = _build_multi_agent_data(
        steps_collector, orchestration_meta, billing_data, final_result or ""
    )

    # 保存最终的助手消息，并更新累计 token 使用量
    context_usage = billing_data.get("context_usage") or {}
    tokens_used = context_usage.get("used_tokens", 0)
    final_result and await save_multi_agent_message(
        session_id, final_result, tokens_used, multi_agent_data
    )

    # 发送计费事件（在保存后发送，确保包含累计值）
    # 重新查询会话获取累计 token 使用量
    async with AsyncSessionLocal() as db_session:
        s_result = await db_session.execute(select(ChatSession).filter(ChatSession.id == session_id))
        s = s_result.scalars().first()
        total_tokens = (s.total_tokens_used or 0) if s else tokens_used
    
    yield sse("billing", {
        "credit_cost": billing_data.get("credit_cost", 0),
        "context_usage": {
            "used_tokens": total_tokens,
            "context_window": agent.context_window,
        },
    })
    yield sse("done", {})


def _collect_step_data(event, steps_collector: dict, orchestration_meta: dict):
    """Collect multi-agent step data from orchestration events for persistence."""
    etype = event.event_type
    d = event.data

    # 编排元信息
    _meta_handlers = {
        "task_analyzed": lambda: orchestration_meta.update({
            "orchestration_style": d.get("orchestration_style", "legacy_json"),
        }),
        "team_created": lambda: orchestration_meta.update({
            "orchestration_style": "team_tools",
            "team_name": d.get("team_name", ""),
            "leader_name": d.get("agent_name", ""),
        }),
    }
    _meta_handlers.get(etype, lambda: None)()

    # 步骤创建
    _step_creators = {
        "subtask_created": lambda: steps_collector.setdefault(d.get("subtask_id", ""), {
            "subtask_id": d.get("subtask_id", ""),
            "agent_name": d.get("agent", ""),
            "description": d.get("description", ""),
            "status": "pending",
            "tool_calls": [],
        }),
        "worker_spawned": lambda: steps_collector.setdefault(d.get("worker_key", ""), {
            "subtask_id": d.get("worker_key", ""),
            "agent_name": d.get("agent_name", ""),
            "description": d.get("message", ""),
            "status": "running",
            "templateType": d.get("worker_template_type"),
            "tool_calls": [],
        }),
    }
    _step_creators.get(etype, lambda: None)()

    # 步骤状态更新
    _step_updaters = {
        "subtask_started": lambda: _update_step(steps_collector, d.get("subtask_id", ""), {
            "status": "running", "agent_name": d.get("agent_name"),
        }),
        "subtask_completed": lambda: _update_step(steps_collector, d.get("subtask_id", ""), {
            "status": "completed",
            "result": d.get("result", ""),
            "agent_name": d.get("agent_name"),
            "description": d.get("description"),
            "tokens": d.get("tokens"),
        }),
        "subtask_failed": lambda: _update_step(steps_collector, d.get("subtask_id", ""), {
            "status": "failed", "error": d.get("error", ""),
        }),
        "worker_completed": lambda: _update_step(steps_collector, d.get("worker_key", ""), {
            "status": "completed", "result": d.get("result", ""),
            "agent_name": d.get("agent_name"),
        }),
        "worker_dismissed": lambda: _update_step(steps_collector, d.get("worker_key", ""), {
            "status": "completed",
        }),
    }
    _step_updaters.get(etype, lambda: None)()

    # 工具调用收集
    _tool_handlers = {
        "subtask_tool_call": lambda: _append_tool_call(steps_collector, d.get("subtask_id", ""), {
            "tool_name": d.get("tool_name", ""),
            "status": "executing",
        }),
        "subtask_tool_result": lambda: _complete_tool_call(
            steps_collector, d.get("subtask_id", ""), d.get("tool_name", ""),
        ),
    }
    _tool_handlers.get(etype, lambda: None)()


def _update_step(steps: dict, step_id: str, updates: dict):
    """Update an existing step with non-None values."""
    step = steps.get(step_id)
    step and step.update({k: v for k, v in updates.items() if v is not None})


def _append_tool_call(steps: dict, step_id: str, tool_data: dict):
    """Append a tool call to a step."""
    step = steps.get(step_id)
    step and step.setdefault("tool_calls", []).append(tool_data)


def _complete_tool_call(steps: dict, step_id: str, tool_name: str):
    """Mark the last executing tool call as completed."""
    step = steps.get(step_id)
    tc_list = step.get("tool_calls", []) if step else []
    # 找到最后一个正在执行的同名工具并标记完成
    for tc in reversed(tc_list):
        (tc.get("tool_name") == tool_name and tc.get("status") == "executing") and tc.update({"status": "completed"})
        break


def _build_multi_agent_data(
    steps_collector: dict,
    orchestration_meta: dict,
    billing_data: dict,
    final_result: str,
) -> dict:
    """Build the multi_agent data structure for persistence."""
    steps_list = list(steps_collector.values())
    context_usage = billing_data.get("context_usage") or {}
    return {
        "steps": steps_list,
        "finalResult": final_result,
        "totalTokens": {
            "input": context_usage.get("input_tokens", 0),
            "output": context_usage.get("output_tokens", 0),
        },
        "creditCost": billing_data.get("credit_cost", 0),
        "orchestrationStyle": orchestration_meta.get("orchestration_style", "legacy_json"),
        "teamName": orchestration_meta.get("team_name"),
        "leaderName": orchestration_meta.get("leader_name"),
    }
