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
from services.skill_tools import build_skill_prompt, build_load_skill_tool_def, load_skill_content
from services.base_tools import build_base_tool_defs, execute_base_tool
from services.canvas_tools import build_canvas_tool_defs, execute_canvas_tool, CANVAS_TOOL_NAMES
from services.image_gen_tools import build_image_gen_tool_def_list, execute_image_gen_tool, IMAGE_GEN_TOOL_NAME
from services.orchestrator import DynamicOrchestrator
from services.billing import calculate_credit_cost, deduct_credits_atomic, InsufficientCreditsError, BalanceFrozenError, check_balance_sufficient
from services.media_utils import MEDIA_DIR
from services.image_config_adapter import resolve_image_configs

logger = logging.getLogger(__name__)


def _sse(event: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _serialize_content(content: Any) -> str:
    """序列化消息内容：列表转 JSON 字符串，字符串保持原样"""
    return json.dumps(content, ensure_ascii=False) if isinstance(content, list) else str(content)


def _deserialize_content(content: str) -> Any:
    """反序列化消息内容：尝试解析 JSON，失败则返回原字符串"""
    try:
        parsed = json.loads(content)
        return parsed if isinstance(parsed, (list, dict)) else content
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


def _inject_image_to_message(msg: dict, data_url: str):
    """将图片 data_url 注入到用户消息的 content 中"""
    user_content = msg.get("content")
    _builders = {
        str:  lambda c: [{"type": "image_url", "image_url": {"url": data_url}}, {"type": "text", "text": c}],
        list: lambda c: [{"type": "image_url", "image_url": {"url": data_url}}] + list(c),
    }
    builder = _builders.get(type(user_content), lambda c: [{"type": "image_url", "image_url": {"url": data_url}}])
    msg["content"] = builder(user_content)


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
        deserialized = _deserialize_content(msg.content)
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

    # 3. 积分预检查：付费智能体且余额不足则友好拒绝
    if is_paid_agent and (current_user.credits or 0) <= 0:
        raise HTTPException(status_code=402, detail="积分余额不足，请充值后继续使用")

    # 4. 判断是否为 Leader 多智能体模式
    is_multi_agent = agent.is_leader and agent.member_agent_ids

    # 5. 根据模式选择生成器
    generator = (
        _generate_multi_agent(db, agent, message.content, entity_id, session_id, is_admin, message.theater_id, message.edit_last_image, message.target_node_id, message.edit_image_url)
        if is_multi_agent else
        _generate_single_agent(db, agent, message.content, entity_id, session_id, is_admin, message.edit_last_image, message.theater_id, message.target_node_id, message.edit_image_url)
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


async def _generate_multi_agent(
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
    """多智能体协作模式生成器（统一架构：自动区分简单/复杂任务）"""
    logger.info(f"\n{'='*60}")
    logger.info(f"[Multi-Agent] Leader: {agent.name} (ID: {agent.id})")
    logger.info(f"Member agents: {agent.member_agent_ids}")
    logger.info(f"Session: {session_id} | {'Admin' if is_admin else 'User'}: {entity_id}")
    logger.info(f"Task: {content}")
    logger.info(f"{'='*60}\n")

    # Task analysis: classify simple vs complex
    orchestrator = DynamicOrchestrator(db)
    analysis = await orchestrator.analyze_task(agent.id, content)
    logger.info(f"[Multi-Agent] Task analysis: is_simple={analysis.is_simple}")

    # Route: simple → single-agent (full tool/canvas/skill support)
    #        complex → multi-agent orchestration
    _generators = {
        True: lambda: _generate_single_agent(
            db, agent, content, entity_id, session_id, is_admin,
            edit_last_image, theater_id, target_node_id, edit_image_url
        ),
        False: lambda: _execute_complex_multi_agent(
            orchestrator, db, agent, content, entity_id, session_id,
            is_admin, theater_id, analysis, edit_image_url, target_node_id
        ),
    }
    async for chunk in _generators[analysis.is_simple]():
        yield chunk


async def _save_multi_agent_message(session_id: str, final_result: str, tokens_used: int = 0):
    """保存多智能体协作的助手消息"""
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
):
    """执行复杂任务的多智能体协作"""
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
        deserialized = _deserialize_content(msg.content)
        content_val = (
            deserialized.get("text") or ""
            if role == "assistant" and isinstance(deserialized, dict) and "text" in deserialized
            else deserialized
        )
        history_messages.append({"role": role, "content": content_val})

    # 图片编辑上下文注入：将画布节点的图片注入到历史消息的最后一条用户消息
    edit_image_data_url = None
    if edit_image_url:
        # 提取文件名：支持多种 URL 格式
        # - /api/media/xxx.png
        # - http://localhost:8000/api/media/xxx.png
        # - xxx.png (纯文件名)
        filename = None
        if "/api/media/" in edit_image_url:
            filename = edit_image_url.split("/api/media/")[-1].split("?")[0]  # 移除可能的查询参数
        elif "/media/" in edit_image_url:
            filename = edit_image_url.split("/media/")[-1].split("?")[0]
        elif edit_image_url.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
            # 纯文件名或相对路径
            filename = edit_image_url.split("/")[-1]
        
        if filename:
            _local_path = str(MEDIA_DIR / filename)
            edit_image_data_url = _image_file_to_data_url(_local_path)
            edit_image_data_url and logger.info(f"[Multi-Agent] Injected edit image: {filename}")
    
    # 将图片注入到最后一条用户消息或添加新的用户消息
    if edit_image_data_url and history_messages:
        # 找到最后一条用户消息并注入图片
        for i in range(len(history_messages) - 1, -1, -1):
            if history_messages[i].get("role") == "user":
                _inject_image_to_message(history_messages[i], edit_image_data_url)
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
    ):
        # 记录事件（过滤高频chunk和text事件）
        event.event_type not in ("subtask_chunk", "text") and logger.info(f"[Orchestration] {event.event_type}: {event.data}")

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
    final_result and await _save_multi_agent_message(session_id, final_result, tokens_used)

    # 发送计费事件（在保存后发送，确保包含累计值）
    # 重新查询会话获取累计 token 使用量
    async with AsyncSessionLocal() as db_session:
        s_result = await db_session.execute(select(ChatSession).filter(ChatSession.id == session_id))
        s = s_result.scalars().first()
        total_tokens = (s.total_tokens_used or 0) if s else tokens_used
    
    yield _sse("billing", {
        "credit_cost": billing_data.get("credit_cost", 0),
        "context_usage": {
            "used_tokens": total_tokens,
            "context_window": agent.context_window,
        },
    })
    yield _sse("done", {})


async def _get_tool_result(
    tc_name: str, tc_args: dict, active_skills_dir, theater_id: str | None,
    agent: Agent, db: AsyncSession
) -> str:
    """Dispatch tool execution by name. Returns result string."""
    # 异步工具派发表（generate_image、未来可扩展更多异步工具）
    _ASYNC_DISPATCHERS = {
        IMAGE_GEN_TOOL_NAME: lambda: execute_image_gen_tool(tc_args, agent, db),
    }
    is_canvas = tc_name in CANVAS_TOOL_NAMES and theater_id and agent.target_node_types
    async_handler = (
        (lambda: execute_canvas_tool(tc_name, tc_args, theater_id, agent.target_node_types, db, agent_id=agent.id))
        if is_canvas
        else _ASYNC_DISPATCHERS.get(tc_name)
    )
    return await async_handler() if async_handler else _dispatch_standard_tool(tc_name, tc_args, active_skills_dir)


def _dispatch_standard_tool(tc_name: str, tc_args: dict, active_skills_dir) -> str:
    """Dispatch standard (sync) tools."""
    _DISPATCH = {
        "load_skill": lambda args: load_skill_content(args.get("skill_name", ""), active_skills_dir),
    }
    handler = _DISPATCH.get(tc_name) or (lambda args: execute_base_tool(tc_name, args))
    return handler(tc_args)


async def _append_tool_round(
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
        content = await _get_tool_result(tc.name, args, active_skills_dir, theater_id, agent, db)
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
        content = await _get_tool_result(tc.name, args, active_skills_dir, theater_id, agent, db)
        logger.info(f"  {tc.name}({args}) → {len(content)} chars")
        messages.append({
            "role": "tool", "tool_call_id": tc.id, "content": content,
        })
    result.full_response = ""


async def _generate_single_agent(
    db: AsyncSession,
    agent: Agent,
    content: Any,
    entity_id: str,
    session_id: str,
    is_admin: bool = False,
    edit_last_image: bool = False,
    theater_id: str | None = None,
    target_node_id: str | None = None,
    edit_image_url: str | None = None,
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
        deserialized = _deserialize_content(msg.content)
        if role == "assistant" and isinstance(deserialized, dict) and "text" in deserialized:
            content_val = deserialized.get("text") or ""
        else:
            content_val = deserialized
        messages.append({"role": role, "content": content_val})

    # 如果用户请求编辑图片（来自画布节点或历史对话），注入图片为本轮输入
    # 供应商 -> 图片生成启用判断函数映射表（优先使用统一配置）
    _IMAGE_EDIT_ENABLED = {
        "gemini": lambda a: (a.image_config or a.gemini_config or {}).get("image_generation_enabled"),
        "xai": lambda a: (a.image_config or a.xai_image_config or {}).get("image_generation_enabled"),
    }
    _edit_checker = _IMAGE_EDIT_ENABLED.get(provider.provider_type.lower(), lambda a: False)

    # 获取要编辑的图片：优先使用画布节点的 edit_image_url，否则回退到历史对话中的最后一张
    _edit_image_data_url = None
    _should_edit = _edit_checker(agent) and (edit_image_url or edit_last_image)
    if _should_edit and edit_image_url:
        # 从画布节点提供的 URL 加载
        _local_path = str(MEDIA_DIR / edit_image_url.split("/api/media/")[-1]) if "/api/media/" in edit_image_url else None
        _local_path and (_edit_image_data_url := _image_file_to_data_url(_local_path))
    elif _should_edit and edit_last_image:
        # 从历史对话中获取最后一张图片
        last_image_path = _get_last_image_path(history)
        last_image_path and (_edit_image_data_url := _image_file_to_data_url(last_image_path))

    if _edit_image_data_url and messages:
        last_msg = messages[-1]
        (last_msg.get("role") == "user") and _inject_image_to_message(last_msg, _edit_image_data_url)

    # Tool Wrapper: 注入轻量技能索引 + 准备工具定义（load_skill + base tools + canvas tools + image_gen）
    agent_tools = agent.tools or []
    tool_defs = None
    active_skills_dir = None
    base_defs = []
    canvas_defs = []
    image_gen_defs = []
    # 注入画布工具（当 theater_id 和 target_node_types 都存在时）
    has_canvas_context = theater_id and agent.target_node_types
    canvas_defs = build_canvas_tool_defs(agent.target_node_types) if has_canvas_context else []
    # 注入图像生成工具（当统一配置启用且指定了 image_provider + image_model 时）
    image_gen_defs = build_image_gen_tool_def_list(agent)
    if agent_tools or canvas_defs or image_gen_defs:
        from skills_manager import get_active_skills_dir
        active_skills_dir = get_active_skills_dir()
        skill_prompt = build_skill_prompt(agent_tools, active_skills_dir)
        # 追加轻量索引到 system prompt
        (skill_prompt and messages and messages[0].get("role") == "system"
         and messages[0].__setitem__("content", messages[0]["content"] + "\n\n" + skill_prompt))
        # 注册 base tools + load_skill 元工具 + canvas tools + image_gen tools
        base_defs = build_base_tool_defs()
        skill_defs = [build_load_skill_tool_def(agent_tools)] if agent_tools else []
        tool_defs = base_defs + canvas_defs + image_gen_defs + skill_defs

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
    logger.info(f"Skills: {agent_tools or 'none'}")
    logger.info(f"Current message: {content}")
    logger.info(f"{'-'*60}")

    # 调用 LLM 流式接口（含工具调用循环：load_skill + base tools）
    is_anthropic = provider.provider_type.lower() in ("anthropic", "minimax")
    MAX_TOOL_ROUNDS = 5
    loaded_skills: set[str] = set()  # 已加载的技能，防止重复调用
    all_tool_calls = []  # 记录所有执行的普通工具
    tool_generated_image_count = 0  # generate_image 工具累计生成图片数（跨轮次）
    result = None
    generation_failed = False
    _SSE_START = {True: "skill_call", False: "tool_call"}
    _SSE_END = {True: "skill_loaded", False: "tool_result"}
    try:
        for _round in range(MAX_TOOL_ROUNDS + 1):
            is_last_round = _round == MAX_TOOL_ROUNDS
            current_tools = None if is_last_round else tool_defs
            result = None
            # 通过适配器解析有效的图像配置
            _eff_gemini, _eff_xai = resolve_image_configs(agent, provider.provider_type)
            async for chunk, result in stream_completion(
                provider_type=provider.provider_type,
                api_key=provider.api_key,
                base_url=provider.base_url,
                model=agent.model,
                messages=messages,
                temperature=agent.temperature,
                context_window=agent.context_window,
                thinking_mode=agent.thinking_mode,
                gemini_config=_eff_gemini,
                tools=current_tools,
                xai_image_config=_eff_xai,
            ):
                yield _sse("text", {"chunk": chunk})

            # 无 tool_calls → 直接结束
            if not (result and result.tool_calls):
                break

            # 发送 tool 开始事件 (skill_call 或 tool_call)
            for tc in result.tool_calls:
                args = json.loads(tc.arguments)
                is_skill = tc.name == "load_skill"
                if not is_skill:
                    all_tool_calls.append({"name": tc.name, "arguments": args})
                
                event_data = (
                    {"skill_name": args.get("skill_name", "")}
                    if is_skill else
                    {"tool_name": tc.name, "arguments": args}
                )
                yield _sse(_SSE_START[is_skill], event_data)

            # 执行工具调用并追加结果到消息
            logger.info(f"[Tool Round {_round + 1}] {len(result.tool_calls)} tool call(s)")
            await _append_tool_round(messages, result, active_skills_dir, is_anthropic, theater_id, agent, db)

            # 累计 generate_image 工具产生的图片数（用于计费）
            tool_generated_image_count += sum(
                min(max(json.loads(tc.arguments).get("n", 1), 1), 4)
                for tc in result.tool_calls
                if tc.name == IMAGE_GEN_TOOL_NAME
            )

            # 记录已加载的技能，更新 tool_defs（base tools + canvas tools 始终保留，load_skill enum 缩减）
            for tc in result.tool_calls:
                tc.name == "load_skill" and loaded_skills.add(json.loads(tc.arguments).get("skill_name", ""))
            remaining = [s for s in agent_tools if s not in loaded_skills]
            skill_defs = [build_load_skill_tool_def(remaining)] if remaining else []
            tool_defs = base_defs + canvas_defs + image_gen_defs + skill_defs

            # 发送 tool 完成事件 (skill_loaded 或 tool_result)
            for tc in result.tool_calls:
                args = json.loads(tc.arguments)
                is_skill = tc.name == "load_skill"
                is_canvas = tc.name in CANVAS_TOOL_NAMES
                event_data = (
                    {"skill_name": args.get("skill_name", "")}
                    if is_skill else
                    {"tool_name": tc.name, "success": True}
                )
                yield _sse(_SSE_END[is_skill], event_data)
                
                # Canvas tool 执行后发送画布更新事件，通知前端刷新
                is_canvas and theater_id and (
                    yield _sse("canvas_updated", {"theater_id": theater_id, "action": tc.name})
                )

    except Exception as e:
        generation_failed = True
        logger.error(f"LLM generation failed: {e}")
        yield _sse("error", {"message": str(e)})

    # 生成失败时不保存消息也不扣费
    if generation_failed or not result:
        logger.info(f"{'='*60} (no billing - generation {'failed' if generation_failed else 'empty'})\n")
        yield _sse("done", {})
        return

    # 输出统计日志
    result.reasoning_content and logger.info(
        f"\nThinking: {result.reasoning_content[:300]}{'...' if len(result.reasoning_content) > 300 else ''}"
    )
    logger.info(f"\nResponse: {result.full_response[:200]}{'...' if len(result.full_response) > 200 else ''}")
    logger.info(f"Output chars: {len(result.full_response)}")

    # 将 generate_image 工具累计的图片数合并到 result（供计费使用）
    tool_generated_image_count and setattr(
        result, 'generated_image_count',
        getattr(result, 'generated_image_count', 0) + tool_generated_image_count,
    )

    total_tokens = result.input_tokens + result.output_tokens
    (total_tokens > 0) and (
        logger.info(f"Tokens: {result.input_tokens} in / {result.output_tokens} out = {total_tokens}"),
        logger.info(f"  text_out={result.text_output_tokens}, image_out={result.image_output_tokens}, search={result.search_query_count}"),
        logger.info(f"Context usage: {total_tokens / agent.context_window * 100:.1f}%"),
    )
    logger.info(f"{'='*60}\n")

    # 保存助手消息、更新统计、扣费（仅在生成成功后执行）
    billing_event = {
        "credit_cost": 0,
        "context_usage": {
            "used_tokens": result.input_tokens + result.output_tokens,
            "context_window": agent.context_window,
        },
    }
    async with AsyncSessionLocal() as session:
        try:
            # Prepare content for assistant（映射表驱动，避免 if-else）
            _content_builders = {
                True: lambda: json.dumps({
                    "text": result.full_response,
                    "skill_calls": [{"skill_name": s, "status": "loaded"} for s in loaded_skills],
                    "tool_calls": [{"tool_name": tc["name"], "arguments": tc["arguments"], "status": "completed"} for tc in all_tool_calls]
                }, ensure_ascii=False),
                False: lambda: result.full_response,
            }
            final_content = _content_builders[bool(loaded_skills or all_tool_calls)]()

            assistant_msg = ChatMessage(
                session_id=session_id,
                role="assistant",
                content=final_content,
            )
            session.add(assistant_msg)

            # 更新会话时间戳和累计 token 使用量
            from sqlalchemy import func as sa_func
            s_result = await session.execute(select(ChatSession).filter(ChatSession.id == session_id))
            s = s_result.scalars().first()
            s and setattr(s, 'updated_at', sa_func.now())
            s and setattr(s, 'total_tokens_used', (s.total_tokens_used or 0) + result.input_tokens + result.output_tokens)

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

            # 积分扣费（统一原子扣费，User 和 Admin 均走 deduct_credits_atomic）
            credit_cost, billing_metadata = calculate_credit_cost(result, agent)
            billing_event["credit_cost"] = round(credit_cost, 6)

            try:
                (credit_cost > 0) and await deduct_credits_atomic(
                    user_id=entity_id,
                    cost=credit_cost,
                    session=session,
                    metadata=billing_metadata,
                    transaction_type="consumption"
                )
            except InsufficientCreditsError:
                billing_event["insufficient"] = True
                logger.warning(f"Credits depleted for {'admin' if is_admin else 'user'} {entity_id}. Cost: {credit_cost}")
            except BalanceFrozenError:
                billing_event["frozen"] = True
                logger.warning(f"Balance frozen for {entity_id}")

            await session.commit()

            # 更新 billing_event 中的 context_usage 为累计值
            s and billing_event.update({
                "context_usage": {
                    "used_tokens": s.total_tokens_used or 0,
                    "context_window": agent.context_window,
                }
            })

            # 查询最新余额
            balance_result = await session.execute(
                select(entity_model.credits).where(entity_model.id == entity_id)
            )
            billing_event["remaining_credits"] = round(float(balance_result.scalar() or 0), 4)

        except Exception as e:
            logger.error(f"Failed to save message/billing: {e}")

    # 发送计费信息和完成事件
    yield _sse("billing", billing_event)

    # 画布图像桥接：图像生成后自动创建/更新画布节点
    _image_enabled_check = {
        "gemini": lambda a: (a.image_config or a.gemini_config or {}).get("image_generation_enabled"),
        "xai":    lambda a: (a.image_config or a.xai_image_config or {}).get("image_generation_enabled"),
    }
    _node_types = set(agent.target_node_types or [])
    _has_image_target = bool(_node_types & {"image", "character"})
    _is_image_enabled = _image_enabled_check.get(provider.provider_type.lower(), lambda a: False)(agent)
    _should_bridge = theater_id and _has_image_target and _is_image_enabled and result and result.full_response

    if _should_bridge:
        from services.image_canvas_bridge import bridge_images_to_canvas
        try:
            async with AsyncSessionLocal() as bridge_db:
                bridge_actions = await bridge_images_to_canvas(
                    response_text=result.full_response,
                    theater_id=theater_id,
                    target_node_id=target_node_id,
                    agent=agent,
                    db=bridge_db,
                )
                for action in bridge_actions:
                    yield _sse("canvas_updated", {"theater_id": theater_id, "action": action})
        except Exception as e:
            logger.error(f"Image canvas bridge failed: {e}")

    yield _sse("done", {})


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
