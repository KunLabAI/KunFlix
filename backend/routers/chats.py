from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Any
import logging
import json
import base64
import mimetypes
import re

from database import get_db, AsyncSessionLocal
from models import Agent, ChatSession, ChatMessage, LLMProvider, User, Admin, CreditTransaction
from schemas import ChatSessionCreate, ChatSessionResponse, ChatMessageCreate, ChatMessageResponse
from auth import get_current_active_user_or_admin, scoped_query, is_admin_entity
from services.llm_stream import stream_completion
from services.orchestrator import DynamicOrchestrator
from services.billing import calculate_credit_cost
from services.media_utils import MEDIA_DIR

logger = logging.getLogger(__name__)


def _serialize_content(content: Any) -> str:
    """序列化消息内容：列表转 JSON 字符串，字符串保持原样"""
    return json.dumps(content, ensure_ascii=False) if isinstance(content, list) else str(content)


def _deserialize_content(content: str) -> Any:
    """反序列化消息内容：尝试解析 JSON，失败则返回原字符串"""
    try:
        parsed = json.loads(content)
        return parsed if isinstance(parsed, list) else content
    except (json.JSONDecodeError, TypeError):
        return content


_IMAGE_MD_PATTERN = re.compile(r"!\[image\]\((/api/media/[^)]+)\)")


def _get_last_image_path(history) -> str | None:
    """从历史消息中找到最后一张助手图片对应的本地文件路径"""
    for msg in reversed(history):
        if getattr(msg, "role", None) != "assistant":
            continue
        content = getattr(msg, "content", "") or ""
        if not isinstance(content, str):
            continue
        m = _IMAGE_MD_PATTERN.search(content)
        if m:
            url = m.group(1)  # /api/media/xxxx.png
            filename = url.rsplit("/", 1)[-1]
            return str(MEDIA_DIR / filename)
    return None


def _image_file_to_data_url(path: str) -> str | None:
    """读取本地图片文件并转换为 data URL，供 Gemini image_url 使用"""
    from pathlib import Path

    file_path = Path(path)
    if not file_path.exists():
        return None

    mime, _ = mimetypes.guess_type(str(file_path))
    mime = mime or "image/png"
    data = file_path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


router = APIRouter(
    prefix="/api/chats",
    tags=["chats"],
    responses={404: {"description": "Not found"}},
)


@router.post("/", response_model=ChatSessionResponse)
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
    current_user=Depends(get_current_active_user_or_admin),
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
    # 反序列化多模态消息内容
    return [
        {"id": msg.id, "session_id": msg.session_id, "role": msg.role, 
         "content": _deserialize_content(msg.content), "created_at": msg.created_at}
        for msg in result.scalars().all()
    ]


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
    user_msg = ChatMessage(session_id=session_id, role="user", content=_serialize_content(message.content))
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

    # 3. 积分预检查：付费智能体且余额不足则拒绝（管理员也需要检查以便调试）
    if is_paid_agent and (current_user.credits or 0) <= 0:
        raise HTTPException(status_code=402, detail="积分余额不足")

    # 4. 判断是否为 Leader 多智能体模式
    is_multi_agent = agent.is_leader and agent.member_agent_ids

    # 5. 根据模式选择生成器
    generator = (
        _generate_multi_agent(db, agent, message.content, entity_id, session_id, is_admin)
        if is_multi_agent else
        _generate_single_agent(db, agent, message.content, entity_id, session_id, is_admin, message.edit_last_image)
    )

    media_type = "text/event-stream" if is_multi_agent else "text/plain"
    return StreamingResponse(generator, media_type=media_type)


async def _generate_multi_agent(
    db: AsyncSession,
    agent: Agent,
    content: str,
    entity_id: str,
    session_id: str,
    is_admin: bool = False
):
    """多智能体协作模式生成器"""
    logger.info(f"\n{'='*60}")
    logger.info(f"[Multi-Agent] Leader: {agent.name} (ID: {agent.id})")
    logger.info(f"Coordination mode: {agent.coordination_modes}")
    logger.info(f"Member agents: {agent.member_agent_ids}")
    logger.info(f"Session: {session_id} | {'Admin' if is_admin else 'User'}: {entity_id}")
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
        history_messages.append({"role": role, "content": _deserialize_content(msg.content)})

    orchestrator = DynamicOrchestrator(db)
    coordination_mode = (agent.coordination_modes or ["pipeline"])[0]
    
    final_result = None
    async for event in orchestrator.execute(
        task_description=content,
        user_id=entity_id,
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
    content: Any,
    entity_id: str,
    session_id: str,
    is_admin: bool = False,
    edit_last_image: bool = False,
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
        messages.append({"role": role, "content": _deserialize_content(msg.content)})

    # 如果用户请求编辑上一张图片，且当前为 Gemini 图片生成场景，则注入上一张图片为本轮输入
    if edit_last_image and provider.provider_type == "gemini":
        gemini_cfg = agent.gemini_config or {}
        if gemini_cfg.get("image_generation_enabled"):
            last_image_path = _get_last_image_path(history)
            if last_image_path is not None:
                data_url = _image_file_to_data_url(last_image_path)
                if data_url:
                    # 修改最后一条用户消息的 content，注入 image_url part
                    if messages:
                        last_msg = messages[-1]
                        if last_msg.get("role") == "user":
                            user_content = last_msg.get("content")
                            if isinstance(user_content, str):
                                parts = [
                                    {"type": "image_url", "image_url": {"url": data_url}},
                                    {"type": "text", "text": user_content},
                                ]
                            elif isinstance(user_content, list):
                                parts = [{"type": "image_url", "image_url": {"url": data_url}}] + [
                                    p for p in user_content
                                ]
                            else:
                                parts = [{"type": "image_url", "image_url": {"url": data_url}}]
                            last_msg["content"] = parts

    # 计算输入字符数（兼容多模态消息）
    def _content_len(c): return len(c) if isinstance(c, str) else sum(len(p.get('text', '')) for p in c if isinstance(p, dict))
    input_chars = sum(_content_len(m['content']) for m in messages)

    # 日志输出
    logger.info(f"\n{'='*60}")
    logger.info(f"Agent: {agent.name} (ID: {agent.id})")
    logger.info(f"Model: {provider.provider_type}/{agent.model}")
    logger.info(f"Session: {session_id} | {'Admin' if is_admin else 'User'}: {entity_id}")
    logger.info(f"History: {len(history)} | Input chars: {input_chars}")
    logger.info(f"Context window: {agent.context_window} | Temperature: {agent.temperature}")
    logger.info(f"Current message: {content}")
    logger.info(f"{'-'*60}")

    # 调用 LLM 流式接口
    result = None
    generation_failed = False
    try:
        async for chunk, result in stream_completion(
            provider_type=provider.provider_type,
            api_key=provider.api_key,
            base_url=provider.base_url,
            model=agent.model,
            messages=messages,
            temperature=agent.temperature,
            context_window=agent.context_window,
            thinking_mode=agent.thinking_mode,
            gemini_config=agent.gemini_config,
        ):
            yield chunk
    except Exception as e:
        generation_failed = True
        logger.error(f"LLM generation failed: {e}")
        yield f"Error: {str(e)}"

    # 生成失败时不保存消息也不扣费
    if generation_failed or not result:
        logger.info(f"{'='*60} (no billing - generation {'failed' if generation_failed else 'empty'})\n")
        return

    # 输出统计日志
    if result.reasoning_content:
        logger.info(f"\nThinking: {result.reasoning_content[:300]}{'...' if len(result.reasoning_content) > 300 else ''}")
    
    logger.info(f"\nResponse: {result.full_response[:200]}{'...' if len(result.full_response) > 200 else ''}")
    logger.info(f"Output chars: {len(result.full_response)}")
    
    if result.input_tokens > 0 or result.output_tokens > 0:
        total_tokens = result.input_tokens + result.output_tokens
        logger.info(f"Tokens: {result.input_tokens} in / {result.output_tokens} out = {total_tokens}")
        logger.info(f"  text_out={result.text_output_tokens}, image_out={result.image_output_tokens}, search={result.search_query_count}")
        logger.info(f"Context usage: {total_tokens / agent.context_window * 100:.1f}%")
    
    logger.info(f"{'='*60}\n")

    # 保存助手消息、更新统计、扣费（仅在生成成功后执行）
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

            # 查询实体并更新统计（映射表驱动，避免 if-else）
            entity_model_map = {True: Admin, False: User}
            entity_model = entity_model_map[is_admin]
            e_result = await session.execute(select(entity_model).filter(entity_model.id == entity_id))
            entity = e_result.scalars().first()
            if entity:
                entity.total_input_tokens = (entity.total_input_tokens or 0) + result.input_tokens
                entity.total_output_tokens = (entity.total_output_tokens or 0) + result.output_tokens
                entity.total_input_chars = (entity.total_input_chars or 0) + input_chars
                entity.total_output_chars = (entity.total_output_chars or 0) + len(result.full_response)

                # 积分扣费（映射表驱动多维度计费，仅在生成成功后扣费）
                credit_cost, billing_metadata = calculate_credit_cost(result, agent)
                if credit_cost > 0:
                    balance_before = entity.credits or 0
                    entity.credits = max(0, balance_before - credit_cost)
                    # 根据实体类型设置对应的 ID 字段
                    tx_kwargs = {
                        "admin_id" if is_admin else "user_id": entity_id,
                        "agent_id": agent.id,
                        "session_id": session_id,
                        "transaction_type": "deduction",
                        "amount": -credit_cost,
                        "balance_before": balance_before,
                        "balance_after": entity.credits,
                        "input_tokens": result.input_tokens,
                        "output_tokens": result.output_tokens,
                        "metadata_json": billing_metadata,
                    }
                    session.add(CreditTransaction(**tx_kwargs))
                    logger.info(f"Credits: -{credit_cost:.4f} ({balance_before:.2f} -> {entity.credits:.2f})")

            await session.commit()
        except Exception as e:
            logger.error(f"Failed to save message: {e}")


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
