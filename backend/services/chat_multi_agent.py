"""
Multi-agent chat generation: orchestration routing, complex task execution, message saving.
"""
import logging

from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal
from models import Agent, ChatSession, ChatMessage
from services.chat_utils import (
    sse, deserialize_content, extract_media_filename,
    image_file_to_data_url, inject_image_to_message,
)
from services.chat_generation import generate_single_agent
from services.orchestrator import DynamicOrchestrator
from services.media_utils import MEDIA_DIR

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


async def save_multi_agent_message(session_id: str, final_result: str, tokens_used: int = 0):
    """Save multi-agent collaboration assistant message."""
    async with AsyncSessionLocal() as session:
        try:
            assistant_msg = ChatMessage(
                session_id=session_id,
                role="assistant",
                content=final_result,
            )
            session.add(assistant_msg)

            from sqlalchemy import func as sa_func
            s_result = await session.execute(select(ChatSession).filter(ChatSession.id == session_id))
            s = s_result.scalars().first()
            s and setattr(s, 'updated_at', sa_func.now())
            tokens_used > 0 and s and setattr(s, 'total_tokens_used', (s.total_tokens_used or 0) + tokens_used)

            await session.commit()
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
            _local_path = str(MEDIA_DIR / filename)
            edit_image_data_url = await image_file_to_data_url(_local_path)
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

    # 保存最终的助手消息，并更新累计 token 使用量
    context_usage = billing_data.get("context_usage") or {}
    tokens_used = context_usage.get("used_tokens", 0)
    final_result and await save_multi_agent_message(session_id, final_result, tokens_used)

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
