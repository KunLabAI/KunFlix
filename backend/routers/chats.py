from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import logging

from database import get_db, AsyncSessionLocal
from models import Agent, ChatSession, ChatMessage, LLMProvider, User, CreditTransaction
from schemas import ChatSessionCreate, ChatSessionResponse, ChatMessageCreate, ChatMessageResponse
from auth import get_current_active_user, scoped_query
from services.llm_stream import stream_completion
from services.orchestrator import DynamicOrchestrator

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/chats",
    tags=["chats"],
    responses={404: {"description": "Not found"}},
)


@router.post("/", response_model=ChatSessionResponse)
async def create_session(
    session: ChatSessionCreate,
    current_user: User = Depends(get_current_active_user),
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
    )
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    return new_session


@router.get("/", response_model=List[ChatSessionResponse])
async def list_sessions(
    agent_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ChatSession).order_by(ChatSession.updated_at.desc())
    query = scoped_query(query, ChatSession, current_user)

    if agent_id:
        query = query.filter(ChatSession.agent_id == agent_id)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{session_id}", response_model=ChatSessionResponse)
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ChatSession).filter(ChatSession.id == session_id)
    query = scoped_query(query, ChatSession, current_user)
    session = await db.scalar(query)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/{session_id}/messages", response_model=List[ChatMessageResponse])
async def get_session_messages(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
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
    return result.scalars().all()


@router.post("/{session_id}/messages")
async def send_message(
    session_id: str,
    message: ChatMessageCreate,
    current_user: User = Depends(get_current_active_user),
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

    # 2. 保存用户消息
    user_msg = ChatMessage(session_id=session_id, role="user", content=message.content)
    db.add(user_msg)
    await db.commit()

    # 捕获上下文变量
    user_id = current_user.id
    input_rate = agent.input_credit_per_1k
    output_rate = agent.output_credit_per_1k
    is_paid_agent = input_rate > 0 or output_rate > 0

    # 3. 积分预检查：付费智能体且余额不足则拒绝
    if is_paid_agent and (current_user.credits or 0) <= 0:
        raise HTTPException(status_code=402, detail="积分余额不足")

    # 4. 判断是否为 Leader 多智能体模式
    is_multi_agent = agent.is_leader and agent.member_agent_ids

    # 5. 根据模式选择生成器
    generator = (
        _generate_multi_agent(db, agent, message.content, user_id, session_id)
        if is_multi_agent else
        _generate_single_agent(db, agent, message.content, user_id, session_id, input_rate, output_rate)
    )

    media_type = "text/event-stream" if is_multi_agent else "text/plain"
    return StreamingResponse(generator, media_type=media_type)


async def _generate_multi_agent(
    db: AsyncSession,
    agent: Agent,
    content: str,
    user_id: str,
    session_id: str
):
    """多智能体协作模式生成器"""
    logger.info(f"\n{'='*60}")
    logger.info(f"[Multi-Agent] Leader: {agent.name} (ID: {agent.id})")
    logger.info(f"Coordination mode: {agent.coordination_modes}")
    logger.info(f"Member agents: {agent.member_agent_ids}")
    logger.info(f"Session: {session_id} | User: {user_id}")
    logger.info(f"Task: {content}")
    logger.info(f"{'='*60}\n")

    # 获取历史消息（不包含刚发送的用户消息，因为已经commit了）
    history_result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    history = history_result.scalars().all()
    
    # 构建历史消息列表（排除最后一条，即刚发送的用户消息）
    history_messages = []
    for msg in history[:-1]:
        role = msg.role if msg.role in ["user", "assistant"] else "user"
        history_messages.append({"role": role, "content": msg.content})

    orchestrator = DynamicOrchestrator(db)
    coordination_mode = (agent.coordination_modes or ["pipeline"])[0]
    
    final_result = None
    async for event in orchestrator.execute(
        task_description=content,
        user_id=user_id,
        leader_agent_id=agent.id,
        session_id=session_id,
        coordination_mode=coordination_mode,
        max_iterations=agent.max_subtasks or 5,
        enable_review=agent.enable_auto_review or False,
        history_messages=history_messages
    ):
        # 记录事件（过滤高频chunk事件）
        event.event_type != "subtask_chunk" and logger.info(f"[Orchestration] {event.event_type}: {event.data}")
        
        # 保存最终结果用于存储助手消息
        if event.event_type == "task_completed":
            final_result = event.data.get("result", "")
        
        yield event.to_sse()

    # 保存最终的助手消息
    if final_result:
        async with AsyncSessionLocal() as session:
            try:
                assistant_msg = ChatMessage(
                    session_id=session_id,
                    role="assistant",
                    content=final_result,
                )
                session.add(assistant_msg)

                # 更新会话时间戳
                from sqlalchemy import func as sa_func
                s_result = await session.execute(select(ChatSession).filter(ChatSession.id == session_id))
                s = s_result.scalars().first()
                if s:
                    s.updated_at = sa_func.now()

                await session.commit()
            except Exception as e:
                logger.error(f"Failed to save multi-agent message: {e}")


async def _generate_single_agent(
    db: AsyncSession,
    agent: Agent,
    content: str,
    user_id: str,
    session_id: str,
    input_rate: float,
    output_rate: float
):
    """单智能体模式生成器"""
    # 获取历史消息
    history_result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    history = history_result.scalars().all()

    # 获取供应商配置
    provider_result = await db.execute(select(LLMProvider).filter(LLMProvider.id == agent.provider_id))
    provider = provider_result.scalars().first()
    if not provider or not provider.is_active:
        yield "Error: Agent provider is not available"
        return

    # 准备消息列表
    messages = []
    if agent.system_prompt:
        messages.append({"role": "system", "content": agent.system_prompt})

    for msg in history:
        role = msg.role if msg.role in ["user", "assistant", "system"] else "user"
        messages.append({"role": role, "content": msg.content})

    input_chars = sum(len(m['content']) for m in messages)

    # 日志输出
    logger.info(f"\n{'='*60}")
    logger.info(f"Agent: {agent.name} (ID: {agent.id})")
    logger.info(f"Model: {provider.provider_type}/{agent.model}")
    logger.info(f"Session: {session_id} | User: {user_id}")
    logger.info(f"History: {len(history)} | Input chars: {input_chars}")
    logger.info(f"Context window: {agent.context_window} | Temperature: {agent.temperature}")
    logger.info(f"Current message: {content}")
    logger.info(f"{'-'*60}")

    # 调用 LLM 流式接口
    result = None
    async for chunk, result in stream_completion(
        provider_type=provider.provider_type,
        api_key=provider.api_key,
        base_url=provider.base_url,
        model=agent.model,
        messages=messages,
        temperature=agent.temperature,
        context_window=agent.context_window,
        thinking_mode=agent.thinking_mode,
    ):
        yield chunk

    # 输出统计日志
    if result:
        if result.reasoning_content:
            logger.info(f"\nThinking: {result.reasoning_content[:300]}{'...' if len(result.reasoning_content) > 300 else ''}")
        
        logger.info(f"\nResponse: {result.full_response[:200]}{'...' if len(result.full_response) > 200 else ''}")
        logger.info(f"Output chars: {len(result.full_response)}")
        
        if result.input_tokens > 0 or result.output_tokens > 0:
            total_tokens = result.input_tokens + result.output_tokens
            logger.info(f"Tokens: {result.input_tokens} in / {result.output_tokens} out = {total_tokens}")
            logger.info(f"Context usage: {total_tokens / agent.context_window * 100:.1f}%")
        
        logger.info(f"{'='*60}\n")

        # 保存助手消息和统计
        async with AsyncSessionLocal() as session:
            try:
                assistant_msg = ChatMessage(
                    session_id=session_id,
                    role="assistant",
                    content=result.full_response,
                )
                session.add(assistant_msg)

                # 更新会话时间戳
                from sqlalchemy import func as sa_func
                s_result = await session.execute(select(ChatSession).filter(ChatSession.id == session_id))
                s = s_result.scalars().first()
                if s:
                    s.updated_at = sa_func.now()

                # 更新用户统计
                u_result = await session.execute(select(User).filter(User.id == user_id))
                u = u_result.scalars().first()
                if u:
                    u.total_input_tokens = (u.total_input_tokens or 0) + result.input_tokens
                    u.total_output_tokens = (u.total_output_tokens or 0) + result.output_tokens
                    u.total_input_chars = (u.total_input_chars or 0) + input_chars
                    u.total_output_chars = (u.total_output_chars or 0) + len(result.full_response)

                    # 积分扣费
                    credit_cost = (
                        result.input_tokens / 1000 * input_rate
                        + result.output_tokens / 1000 * output_rate
                    )
                    if credit_cost > 0:
                        balance_before = u.credits or 0
                        u.credits = max(0, balance_before - credit_cost)
                        session.add(CreditTransaction(
                            user_id=user_id,
                            agent_id=agent.id,
                            session_id=session_id,
                            transaction_type="deduction",
                            amount=-credit_cost,
                            balance_before=balance_before,
                            balance_after=u.credits,
                            input_tokens=result.input_tokens,
                            output_tokens=result.output_tokens,
                            metadata_json={
                                "agent_name": agent.name,
                                "model": agent.model,
                                "input_rate": input_rate,
                                "output_rate": output_rate,
                            },
                        ))
                        logger.info(f"Credits: -{credit_cost:.4f} ({balance_before:.2f} → {u.credits:.2f})")

                await session.commit()
            except Exception as e:
                logger.error(f"Failed to save message: {e}")


@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_active_user),
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
