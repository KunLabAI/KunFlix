from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import json
import asyncio

from database import get_db, AsyncSessionLocal
from models import Agent, ChatSession, ChatMessage, LLMProvider
from schemas import ChatSessionCreate, ChatSessionResponse, ChatMessageCreate, ChatMessageResponse

router = APIRouter(
    prefix="/api/chats",
    tags=["chats"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", response_model=ChatSessionResponse)
async def create_session(session: ChatSessionCreate, db: AsyncSession = Depends(get_db)):
    # Verify agent exists
    result = await db.execute(select(Agent).filter(Agent.id == session.agent_id))
    agent = result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
        
    new_session = ChatSession(
        title=session.title,
        agent_id=session.agent_id
    )
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    return new_session

@router.get("/", response_model=List[ChatSessionResponse])
async def list_sessions(
    agent_id: Optional[int] = None,
    skip: int = 0, 
    limit: int = 50, 
    db: AsyncSession = Depends(get_db)
):
    query = select(ChatSession).order_by(ChatSession.updated_at.desc())
    
    if agent_id:
        query = query.filter(ChatSession.agent_id == agent_id)
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{session_id}", response_model=ChatSessionResponse)
async def get_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).filter(ChatSession.id == session_id))
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.get("/{session_id}/messages", response_model=List[ChatMessageResponse])
async def get_session_messages(session_id: int, db: AsyncSession = Depends(get_db)):
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
    db: AsyncSession = Depends(get_db)
):
    # 1. Get Session and Agent
    session_result = await db.execute(select(ChatSession).filter(ChatSession.id == session_id))
    chat_session = session_result.scalars().first()
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
        content=message.content
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

    # 5. Define Generator
    async def generate():
        full_response = ""
        
        try:
            # Prepare messages
            messages = []
            if agent.system_prompt:
                messages.append({"role": "system", "content": agent.system_prompt})
            
            for msg in history:
                role = msg.role
                if role not in ["user", "assistant", "system"]:
                    role = "user" # Fallback
                messages.append({"role": role, "content": msg.content})
            
            # Streaming Logic
            if "openai" in provider.provider_type or "azure" in provider.provider_type:
                from openai import AsyncOpenAI, AsyncAzureOpenAI
                
                client = None
                if "azure" in provider.provider_type:
                    client = AsyncAzureOpenAI(
                        api_key=provider.api_key,
                        api_version="2023-05-15",
                        azure_endpoint=provider.base_url
                    )
                else:
                    client = AsyncOpenAI(
                        api_key=provider.api_key,
                        base_url=provider.base_url
                    )
                
                stream = await client.chat.completions.create(
                    model=agent.model,
                    messages=messages,
                    temperature=agent.temperature,
                    stream=True
                )
                
                async for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        full_response += content
                        yield content

            elif "dashscope" in provider.provider_type:
                import dashscope
                from http import HTTPStatus
                
                # Dashscope streaming returns full content each time usually
                responses = dashscope.Generation.call(
                    model=agent.model,
                    api_key=provider.api_key,
                    messages=messages,
                    result_format='message',
                    stream=True,
                    incremental_output=True # This enables delta output
                )
                
                for response in responses:
                    if response.status_code == HTTPStatus.OK:
                        content = response.output.choices[0]['message']['content']
                        full_response += content
                        yield content
                    else:
                        yield f"Error: {response.message}"
            
            else:
                 yield "Provider not supported for streaming yet."
                 full_response = "Provider not supported for streaming yet."

        except Exception as e:
            error_msg = f"Error generating response: {str(e)}"
            full_response += error_msg
            yield error_msg
        
        # 6. Save Assistant Message (using new session)
        async with AsyncSessionLocal() as session:
             try:
                assistant_msg = ChatMessage(
                    session_id=session_id,
                    role="assistant",
                    content=full_response
                )
                session.add(assistant_msg)
                
                # Update session timestamp
                # We need to fetch session again to update it
                result = await session.execute(select(ChatSession).filter(ChatSession.id == session_id))
                s = result.scalars().first()
                if s:
                    from sqlalchemy import func
                    s.updated_at = func.now()
                
                await session.commit()
             except Exception as e:
                print(f"Failed to save assistant message: {e}")

    return StreamingResponse(generate(), media_type="text/plain")

@router.delete("/{session_id}")
async def delete_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).filter(ChatSession.id == session_id))
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Messages should be deleted by cascade if configured, but we didn't configure cascade in models
    # So we delete manually
    from sqlalchemy import delete
    await db.execute(delete(ChatMessage).where(ChatMessage.session_id == session_id))
    
    await db.delete(session)
    await db.commit()
    return {"message": "Session deleted"}
