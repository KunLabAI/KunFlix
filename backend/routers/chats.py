from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import json
import asyncio
import logging

from database import get_db, AsyncSessionLocal
from models import Agent, ChatSession, ChatMessage, LLMProvider, User
from schemas import ChatSessionCreate, ChatSessionResponse, ChatMessageCreate, ChatMessageResponse
from auth import get_current_active_user, scoped_query

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
    # Verify agent exists
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
    session_id: int,
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
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify session ownership
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
    session_id: int,
    message: ChatMessageCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # 1. Get Session (with ownership check) and Agent
    session_query = select(ChatSession).filter(ChatSession.id == session_id)
    session_query = scoped_query(session_query, ChatSession, current_user)
    chat_session = await db.scalar(session_query)
    if not chat_session:
        raise HTTPException(status_code=404, detail="Session not found")

    agent_result = await db.execute(select(Agent).filter(Agent.id == chat_session.agent_id))
    agent = agent_result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # 2. Save User Message
    user_msg = ChatMessage(
        session_id=session_id,
        role="user",
        content=message.content,
    )
    db.add(user_msg)
    await db.commit()

    # 3. Prepare History
    history_result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    history = history_result.scalars().all()

    # 4. Prepare Provider/Model
    provider_result = await db.execute(select(LLMProvider).filter(LLMProvider.id == agent.provider_id))
    provider = provider_result.scalars().first()
    if not provider or not provider.is_active:
        raise HTTPException(status_code=400, detail="Agent provider is not available")

    # Capture user id for token persistence inside generator
    user_id = current_user.id

    # 5. Define Generator
    async def generate():
        full_response = ""
        usage_info = {"input_tokens": 0, "output_tokens": 0}

        try:
            # Prepare messages
            messages = []
            if agent.system_prompt:
                messages.append({"role": "system", "content": agent.system_prompt})

            for msg in history:
                role = msg.role
                if role not in ["user", "assistant", "system"]:
                    role = "user"  # Fallback
                messages.append({"role": role, "content": msg.content})

            # 计算输入字符数
            input_chars = sum(len(m['content']) for m in messages)
            history_count = len(history)

            logger.info(f"\n{'='*60}")
            logger.info(f"Agent: {agent.name} (ID: {agent.id})")
            logger.info(f"Model: {provider.provider_type}/{agent.model}")
            logger.info(f"Session: {session_id}")
            logger.info(f"User: {user_id}")
            logger.info(f"History messages: {history_count} (including current)")
            logger.info(f"Input chars: {input_chars}")
            logger.info(f"Context window: {agent.context_window}")
            logger.info(f"Temperature: {agent.temperature}")
            logger.info(f"\nCurrent user message: {message.content}")
            logger.info(f"{'-'*60}")

            # Streaming Logic
            if "openai" in provider.provider_type or "azure" in provider.provider_type:
                from openai import AsyncOpenAI, AsyncAzureOpenAI

                client = None
                if "azure" in provider.provider_type:
                    client = AsyncAzureOpenAI(
                        api_key=provider.api_key,
                        api_version="2023-05-15",
                        azure_endpoint=provider.base_url,
                    )
                else:
                    client = AsyncOpenAI(
                        api_key=provider.api_key,
                        base_url=provider.base_url,
                    )

                stream = await client.chat.completions.create(
                    model=agent.model,
                    messages=messages,
                    temperature=agent.temperature,
                    stream=True,
                    stream_options={"include_usage": True},
                )

                async for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        full_response += content
                        yield content

                    # 获取 token 统计（通常在最后一个 chunk）
                    if hasattr(chunk, 'usage') and chunk.usage:
                        usage_info['input_tokens'] = chunk.usage.prompt_tokens
                        usage_info['output_tokens'] = chunk.usage.completion_tokens

            elif "dashscope" in provider.provider_type:
                import dashscope
                from http import HTTPStatus

                responses = dashscope.Generation.call(
                    model=agent.model,
                    api_key=provider.api_key,
                    messages=messages,
                    result_format='message',
                    stream=True,
                    incremental_output=True,
                )

                for response in responses:
                    if response.status_code == HTTPStatus.OK:
                        content = response.output.choices[0]['message']['content']
                        full_response += content
                        yield content

                        # 获取 token 统计信息
                        if hasattr(response, 'usage') and response.usage:
                            usage_info['input_tokens'] = response.usage.get('input_tokens', 0)
                            usage_info['output_tokens'] = response.usage.get('output_tokens', 0)
                    else:
                        yield f"Error: {response.message}"

            else:
                yield "Provider not supported for streaming yet."
                full_response = "Provider not supported for streaming yet."

        except Exception as e:
            error_msg = f"Error generating response: {str(e)}"
            full_response += error_msg
            logger.error(f"Agent error: {error_msg}")
            yield error_msg

        # 输出统计信息
        output_chars = len(full_response)
        total_chars = input_chars + output_chars

        logger.info(f"\nAssistant response: {full_response[:200]}{'...' if len(full_response) > 200 else ''}")
        logger.info(f"Output chars: {output_chars}")
        logger.info(f"Total chars: {total_chars}")

        # 如果有 API 返回的 token 统计，也显示
        if usage_info['input_tokens'] > 0 or usage_info['output_tokens'] > 0:
            total_tokens = usage_info['input_tokens'] + usage_info['output_tokens']
            logger.info(f"\nAPI Token Usage:")
            logger.info(f"  Input tokens: {usage_info['input_tokens']}")
            logger.info(f"  Output tokens: {usage_info['output_tokens']}")
            logger.info(f"  Total tokens: {total_tokens}")
            logger.info(f"  Context usage: {total_tokens / agent.context_window * 100:.1f}%")

        logger.info(f"{'='*60}\n")

        # 6. Save Assistant Message + persist token counts (using new session)
        async with AsyncSessionLocal() as session:
            try:
                assistant_msg = ChatMessage(
                    session_id=session_id,
                    role="assistant",
                    content=full_response,
                )
                session.add(assistant_msg)

                # Update session timestamp
                result = await session.execute(select(ChatSession).filter(ChatSession.id == session_id))
                s = result.scalars().first()
                if s:
                    from sqlalchemy import func as sa_func
                    s.updated_at = sa_func.now()

                # Persist token & char counts to user
                user_result = await session.execute(select(User).filter(User.id == user_id))
                u = user_result.scalars().first()
                if u:
                    u.total_input_tokens = (u.total_input_tokens or 0) + usage_info['input_tokens']
                    u.total_output_tokens = (u.total_output_tokens or 0) + usage_info['output_tokens']
                    u.total_input_chars = (u.total_input_chars or 0) + input_chars
                    u.total_output_chars = (u.total_output_chars or 0) + output_chars

                await session.commit()
            except Exception as e:
                logger.error(f"Failed to save assistant message or update token counts: {e}")

    return StreamingResponse(generate(), media_type="text/plain")


@router.delete("/{session_id}")
async def delete_session(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ChatSession).filter(ChatSession.id == session_id)
    query = scoped_query(query, ChatSession, current_user)
    session = await db.scalar(query)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Delete messages manually (no cascade configured)
    from sqlalchemy import delete
    await db.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id))

    await db.delete(session)
    await db.commit()
    return {"message": "Session deleted"}
