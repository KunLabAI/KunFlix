from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import logging

from database import get_db
from models import Agent, ChatSession, ChatMessage
from schemas import ChatSessionCreate, ChatSessionResponse, ChatMessageCreate
from auth import get_current_active_user_or_admin, scoped_query, is_admin_entity
from services.chat_utils import serialize_content, deserialize_content
from services.chat_generation import generate_single_agent
from services.chat_multi_agent import generate_multi_agent

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/chats",
    tags=["chats"],
    responses={404: {"description": "Not found"}},
)


@router.post("", response_model=ChatSessionResponse)
async def create_session(
    session: ChatSessionCreate,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Agent).filter(Agent.id == session.agent_id))
    agent = result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    new_session = ChatSession(
        title=session.title,
        agent_id=session.agent_id,
        user_id=current_user.id,
        theater_id=session.theater_id,
    )
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    return new_session


@router.get("", response_model=List[ChatSessionResponse])
async def list_sessions(
    agent_id: Optional[str] = None,
    theater_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(ChatSession).order_by(ChatSession.updated_at.desc())
    query = scoped_query(query, ChatSession, current_user)

    if agent_id:
        query = query.filter(ChatSession.agent_id == agent_id)
    
    if theater_id:
        query = query.filter(ChatSession.theater_id == theater_id)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{session_id}", response_model=ChatSessionResponse)
async def get_session(
    session_id: str,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(ChatSession).filter(ChatSession.id == session_id)
    query = scoped_query(query, ChatSession, current_user)
    session = await db.scalar(query)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    session_query = select(ChatSession).filter(ChatSession.id == session_id)
    session_query = scoped_query(session_query, ChatSession, current_user)
    chat_session = await db.scalar(session_query)
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    # 反序列化多模态消息内容及技能/工具调用
    messages_resp = []
    for msg in result.scalars().all():
        deserialized = deserialize_content(msg.content)
        if msg.role == "assistant" and isinstance(deserialized, dict) and "text" in deserialized:
            messages_resp.append({
                "id": msg.id,
                "session_id": msg.session_id,
                "role": msg.role,
                "content": deserialized.get("text") or "",
                "skill_calls": deserialized.get("skill_calls", []),
                "tool_calls": deserialized.get("tool_calls", []),
                "created_at": msg.created_at
            })
        else:
            messages_resp.append({
                "id": msg.id,
                "session_id": msg.session_id,
                "role": msg.role,
                "content": deserialized,
                "created_at": msg.created_at
            })
    return messages_resp


@router.post("/{session_id}/messages")
async def send_message(
    session_id: str,
    message: ChatMessageCreate,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    # 1. 验证会话和智能体
    session_query = select(ChatSession).filter(ChatSession.id == session_id)
    session_query = scoped_query(session_query, ChatSession, current_user)
    chat_session = await db.scalar(session_query)
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session not found")

    agent_result = await db.execute(select(Agent).filter(Agent.id == chat_session.agent_id))
    agent = agent_result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # 2. 保存用户消息（多模态内容序列化为 JSON）
    user_msg = ChatMessage(session_id=session_id, role="user", content=serialize_content(message.content))
    db.add(user_msg)
    await db.commit()

    # 捕获上下文变量
    entity_id = current_user.id
    is_admin = is_admin_entity(current_user)
    is_paid_agent = (
        agent.input_credit_per_1m > 0
        or agent.output_credit_per_1m > 0
        or agent.image_output_credit_per_1m > 0
        or agent.search_credit_per_query > 0
    )

    # 3. 积分预检查：付费智能体且余额不足则友好拒绝
    if is_paid_agent and (current_user.credits or 0) <= 0:
        raise HTTPException(status_code=402, detail="积分余额不足，请充值后继续使用")

    # 4. 判断是否为 Leader 多智能体模式
    is_multi_agent = agent.is_leader and agent.member_agent_ids

    # 5. 根据模式选择生成器
    generator = (
        generate_multi_agent(db, agent, message.content, entity_id, session_id, is_admin, message.theater_id, message.edit_last_image, message.target_node_id, message.edit_image_url)
        if is_multi_agent else
        generate_single_agent(db, agent, message.content, entity_id, session_id, is_admin, message.edit_last_image, message.theater_id, message.target_node_id, message.edit_image_url)
    )

    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/{session_id}/messages")
async def clear_session_messages(
    session_id: str,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """清空会话的所有消息记录（保留会话本身）"""
    # 验证会话存在且属于当前用户
    query = select(ChatSession).filter(ChatSession.id == session_id)
    query = scoped_query(query, ChatSession, current_user)
    chat_session = await db.scalar(query)
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session not found")

    # 删除该会话的所有消息
    from sqlalchemy import delete
    result = await db.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id))

    # 重置会话的累计 token 使用量
    chat_session.total_tokens_used = 0

    await db.commit()

    deleted_count = result.rowcount
    logger.info(f"Cleared {deleted_count} messages from session {session_id}")
    return {"message": "Messages cleared", "deleted_count": deleted_count}


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    query = select(ChatSession).filter(ChatSession.id == session_id)
    query = scoped_query(query, ChatSession, current_user)
    session = await db.scalar(query)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    from sqlalchemy import delete
    await db.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id))

    await db.delete(session)
    await db.commit()
    return {"message": "Session deleted"}
