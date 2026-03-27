"""
管理员调试会话路由 - 与普通用户会话完全隔离

此模块提供独立的API端点供管理员调试智能体使用，
确保管理员调试数据不会与普通用户数据混淆。
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
from typing import List, Optional, Any
import logging
import json
import base64
import mimetypes
import re

from database import get_db, AsyncSessionLocal
from models import (
    Agent, AdminDebugSession, AdminDebugMessage, 
    LLMProvider, Admin, CreditTransaction
)
from schemas import (
    AdminDebugSessionCreate, AdminDebugSessionResponse,
    AdminDebugMessageCreate, AdminDebugMessageResponse
)
from auth import get_current_active_admin, is_admin_entity
from services.llm_stream import stream_completion
from services.skill_tools import build_skill_prompt, build_load_skill_tool_def, load_skill_content
from services.base_tools import build_base_tool_defs, execute_base_tool
from services.canvas_tools import build_canvas_tool_defs, CANVAS_TOOL_NAMES
from services.orchestrator import DynamicOrchestrator
from services.billing import calculate_credit_cost, CreditTransaction as BillingCreditTransaction
from services.media_utils import MEDIA_DIR
from services.image_config_adapter import resolve_image_configs
from services.image_gen_tools import build_image_gen_tool_def_list, execute_image_gen_tool, IMAGE_GEN_TOOL_NAME

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
    prefix="/api/admin/debug",
    tags=["admin-debug"],
    responses={404: {"description": "Not found"}},
)


@router.post("/sessions", response_model=AdminDebugSessionResponse)
async def create_debug_session(
    session: AdminDebugSessionCreate,
    current_admin=Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
):
    """创建管理员调试会话"""
    result = await db.execute(select(Agent).filter(Agent.id == session.agent_id))
    agent = result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    new_session = AdminDebugSession(
        title=session.title,
        agent_id=session.agent_id,
        admin_id=current_admin.id,
    )
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)
    return new_session


@router.get("/sessions", response_model=List[AdminDebugSessionResponse])
async def list_debug_sessions(
    agent_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_admin=Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
):
    """列出当前管理员的调试会话"""
    query = select(AdminDebugSession).filter(
        AdminDebugSession.admin_id == current_admin.id
    ).order_by(AdminDebugSession.updated_at.desc())

    if agent_id:
        query = query.filter(AdminDebugSession.agent_id == agent_id)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/sessions/{session_id}", response_model=AdminDebugSessionResponse)
async def get_debug_session(
    session_id: str,
    current_admin=Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取单个调试会话详情"""
    query = select(AdminDebugSession).filter(
        AdminDebugSession.id == session_id,
        AdminDebugSession.admin_id == current_admin.id
    )
    session = await db.scalar(query)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/sessions/{session_id}/messages")
async def get_debug_session_messages(
    session_id: str,
    current_admin=Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取调试会话的消息列表"""
    session_query = select(AdminDebugSession).filter(
        AdminDebugSession.id == session_id,
        AdminDebugSession.admin_id == current_admin.id
    )
    debug_session = await db.scalar(session_query)
    if not debug_session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(
        select(AdminDebugMessage)
        .filter(AdminDebugMessage.session_id == session_id)
        .order_by(AdminDebugMessage.created_at.asc())
    )
    # 反序列化多模态消息内容
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


@router.post("/sessions/{session_id}/messages")
async def send_debug_message(
    session_id: str,
    message: AdminDebugMessageCreate,
    current_admin=Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
):
    """发送调试消息并获取流式响应"""
    # 1. 验证会话和智能体
    session_query = select(AdminDebugSession).filter(
        AdminDebugSession.id == session_id,
        AdminDebugSession.admin_id == current_admin.id
    )
    debug_session = await db.scalar(session_query)
    if not debug_session:
        raise HTTPException(status_code=404, detail="Session not found")

    agent_result = await db.execute(select(Agent).filter(Agent.id == debug_session.agent_id))
    agent = agent_result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # 2. 保存用户消息
    user_msg = AdminDebugMessage(
        session_id=session_id, 
        role="user", 
        content=_serialize_content(message.content)
    )
    db.add(user_msg)
    await db.commit()

    # 3. 判断是否为 Leader 多智能体模式
    is_multi_agent = agent.is_leader and agent.member_agent_ids

    # 4. 根据模式选择生成器
    generator = (
        _generate_multi_agent_debug(db, agent, message.content, current_admin.id, session_id)
        if is_multi_agent else
        _generate_single_agent_debug(db, agent, message.content, current_admin.id, session_id, message.edit_last_image)
    )

    media_type = "text/event-stream"
    return StreamingResponse(generator, media_type=media_type)


async def _generate_multi_agent_debug(
    db: AsyncSession,
    agent: Agent,
    content: str,
    admin_id: str,
    session_id: str,
):
    """多智能体调试模式生成器"""
    logger.info(f"\n{'='*60}")
    logger.info(f"[Admin Debug Multi-Agent] Leader: {agent.name} (ID: {agent.id})")
    logger.info(f"Member agents: {agent.member_agent_ids}")
    logger.info(f"Session: {session_id} | Admin: {admin_id}")
    logger.info(f"Task: {content}")
    logger.info(f"{'='*60}\n")

    # 获取历史消息
    history_result = await db.execute(
        select(AdminDebugMessage)
        .filter(AdminDebugMessage.session_id == session_id)
        .order_by(AdminDebugMessage.created_at.asc())
    )
    history = history_result.scalars().all()
    
    # 构建历史消息列表
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

    orchestrator = DynamicOrchestrator(db)
    
    final_result = None
    async for event in orchestrator.execute(
        task_description=content,
        user_id=admin_id,
        leader_agent_id=agent.id,
        session_id=session_id,
        max_iterations=agent.max_subtasks or 5,
        enable_review=agent.enable_auto_review or False,
        history_messages=history_messages
    ):
        event.event_type not in ("subtask_chunk", "text") and logger.info(f"[Orchestration] {event.event_type}: {event.data}")
        
        (event.event_type == "task_completed") and (final_result := event.data.get("result", ""))
        
        yield event.to_sse()

    # 发送完成事件
    from routers.chats import _sse
    yield _sse("done", {})

    # 保存最终的助手消息
    if final_result:
        async with AsyncSessionLocal() as session:
            try:
                assistant_msg = AdminDebugMessage(
                    session_id=session_id,
                    role="assistant",
                    content=final_result,
                )
                session.add(assistant_msg)

                from sqlalchemy import func as sa_func
                s_result = await session.execute(select(AdminDebugSession).filter(AdminDebugSession.id == session_id))
                s = s_result.scalars().first()
                s and setattr(s, 'updated_at', sa_func.now())

                await session.commit()
            except Exception as e:
                logger.error(f"Failed to save multi-agent debug message: {e}")


async def _generate_single_agent_debug(
    db: AsyncSession,
    agent: Agent,
    content: Any,
    admin_id: str,
    session_id: str,
    edit_last_image: bool = False,
):
    """单智能体调试模式生成器"""
    # 获取历史消息
    history_result = await db.execute(
        select(AdminDebugMessage)
        .filter(AdminDebugMessage.session_id == session_id)
        .order_by(AdminDebugMessage.created_at.asc())
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

    # 如果用户请求编辑上一张图片
    # 供应商 -> 图片生成启用判断函数映射表（优先使用统一配置）
    _IMAGE_EDIT_ENABLED = {
        "gemini": lambda a: (a.image_config or a.gemini_config or {}).get("image_generation_enabled"),
        "xai": lambda a: (a.image_config or a.xai_image_config or {}).get("image_generation_enabled"),
    }
    _edit_checker = _IMAGE_EDIT_ENABLED.get(provider.provider_type.lower(), lambda a: False)
    if edit_last_image and _edit_checker(agent):
        last_image_path = _get_last_image_path(history)
        if last_image_path is not None:
            data_url = _image_file_to_data_url(last_image_path)
            if data_url and messages:
                last_msg = messages[-1]
                (last_msg.get("role") == "user") and _inject_image_to_message(last_msg, data_url)

    # 工具配置
    agent_tools = agent.tools or []
    tool_defs = None
    active_skills_dir = None
    base_defs = []
    canvas_defs = []
    image_gen_defs = build_image_gen_tool_def_list(agent)
    has_canvas_context = False  # 调试模式不使用画布上下文
    canvas_defs = []
    if agent_tools or image_gen_defs:
        from skills_manager import get_active_skills_dir
        active_skills_dir = get_active_skills_dir()
        skill_prompt = build_skill_prompt(agent_tools, active_skills_dir)
        (skill_prompt and messages and messages[0].get("role") == "system"
         and messages[0].__setitem__("content", messages[0]["content"] + "\n\n" + skill_prompt))
        base_defs = build_base_tool_defs()
        skill_defs = [build_load_skill_tool_def(agent_tools)] if agent_tools else []
        tool_defs = base_defs + image_gen_defs + skill_defs

    # 计算输入字符数
    def _content_len(c): return len(c) if isinstance(c, str) else sum(len(p.get('text', '')) for p in c if isinstance(p, dict))
    input_chars = sum(_content_len(m['content']) for m in messages)

    # 日志输出
    logger.info(f"\n{'='*60}")
    logger.info(f"[Admin Debug] Agent: {agent.name} (ID: {agent.id})")
    logger.info(f"Model: {provider.provider_type}/{agent.model}")
    logger.info(f"Session: {session_id} | Admin: {admin_id}")
    logger.info(f"History: {len(history)} | Input chars: {input_chars}")
    logger.info(f"Context window: {agent.context_window} | Temperature: {agent.temperature}")
    logger.info(f"Skills: {agent_tools or 'none'}")
    logger.info(f"Current message: {content}")
    logger.info(f"{'-'*60}")

    # 调用 LLM 流式接口
    is_anthropic = provider.provider_type.lower() in ("anthropic", "minimax")
    MAX_TOOL_ROUNDS = 5
    loaded_skills: set[str] = set()
    all_tool_calls = []
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

            # 发送 tool 开始事件
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
            await _append_tool_round_debug(messages, result, active_skills_dir, is_anthropic, agent, db)

            # 累计 generate_image 工具产生的图片数（用于计费）
            tool_generated_image_count += sum(
                min(max(json.loads(tc.arguments).get("n", 1), 1), 4)
                for tc in result.tool_calls
                if tc.name == IMAGE_GEN_TOOL_NAME
            )

            # 记录已加载的技能
            for tc in result.tool_calls:
                tc.name == "load_skill" and loaded_skills.add(json.loads(tc.arguments).get("skill_name", ""))
            remaining = [s for s in agent_tools if s not in loaded_skills]
            skill_defs = [build_load_skill_tool_def(remaining)] if remaining else []
            tool_defs = base_defs + image_gen_defs + skill_defs

            # 发送 tool 完成事件
            for tc in result.tool_calls:
                args = json.loads(tc.arguments)
                is_skill = tc.name == "load_skill"
                event_data = (
                    {"skill_name": args.get("skill_name", "")}
                    if is_skill else
                    {"tool_name": tc.name, "success": True}
                )
                yield _sse(_SSE_END[is_skill], event_data)

        yield _sse("done", {})

    except Exception as e:
        generation_failed = True
        logger.error(f"LLM generation failed: {e}")
        yield _sse("error", {"message": str(e)})

    # 生成失败时不保存消息
    if generation_failed or not result:
        logger.info(f"{'='*60} (no billing - generation {'failed' if generation_failed else 'empty'})\n")
        return

    # 输出统计日志
    if result.reasoning_content:
        logger.info(f"\nThinking: {result.reasoning_content[:300]}{'...' if len(result.reasoning_content) > 300 else ''}")
    
    logger.info(f"\nResponse: {result.full_response[:200]}{'...' if len(result.full_response) > 200 else ''}")
    logger.info(f"Output chars: {len(result.full_response)}")

    # 将 generate_image 工具累计的图片数合并到 result（供计费使用）
    tool_generated_image_count and setattr(
        result, 'generated_image_count',
        getattr(result, 'generated_image_count', 0) + tool_generated_image_count,
    )
    
    if result.input_tokens > 0 or result.output_tokens > 0:
        total_tokens = result.input_tokens + result.output_tokens
        logger.info(f"Tokens: {result.input_tokens} in / {result.output_tokens} out = {total_tokens}")
        logger.info(f"  text_out={result.text_output_tokens}, image_out={result.image_output_tokens}, search={result.search_query_count}")
        logger.info(f"Context usage: {total_tokens / agent.context_window * 100:.1f}%")
    
    logger.info(f"{'='*60}\n")

    # 保存助手消息、更新统计（调试模式也记录管理员使用统计）
    async with AsyncSessionLocal() as session:
        try:
            # 准备内容
            if loaded_skills or all_tool_calls:
                assistant_data = {
                    "text": result.full_response,
                    "skill_calls": [{"skill_name": s, "status": "loaded"} for s in loaded_skills],
                    "tool_calls": [{"tool_name": tc["name"], "arguments": tc["arguments"], "status": "completed"} for tc in all_tool_calls]
                }
                final_content = json.dumps(assistant_data, ensure_ascii=False)
            else:
                final_content = result.full_response

            assistant_msg = AdminDebugMessage(
                session_id=session_id,
                role="assistant",
                content=final_content,
            )
            session.add(assistant_msg)

            # 更新会话时间戳
            from sqlalchemy import func as sa_func
            s_result = await session.execute(select(AdminDebugSession).filter(AdminDebugSession.id == session_id))
            s = s_result.scalars().first()
            if s:
                s.updated_at = sa_func.now()

            # 更新管理员统计
            e_result = await session.execute(select(Admin).filter(Admin.id == admin_id))
            entity = e_result.scalars().first()
            if entity:
                entity.total_input_tokens = (entity.total_input_tokens or 0) + result.input_tokens
                entity.total_output_tokens = (entity.total_output_tokens or 0) + result.output_tokens
                entity.total_input_chars = (entity.total_input_chars or 0) + input_chars
                entity.total_output_chars = (entity.total_output_chars or 0) + len(result.full_response)

                # 调试模式也扣费（可选：管理员可以透支）
                credit_cost, billing_metadata = calculate_credit_cost(result, agent)
                if credit_cost > 0:
                    balance_before = entity.credits or 0
                    entity.credits = max(0, balance_before - credit_cost)
                    tx_kwargs = {
                        "admin_id": admin_id,
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
                    logger.info(f"Admin Debug Credits: -{credit_cost:.4f} ({balance_before:.2f} -> {entity.credits:.2f})")

            await session.commit()
        except Exception as e:
            logger.error(f"Failed to save debug message: {e}")


async def _append_tool_round_debug(
    messages: list, result, active_skills_dir, is_anthropic: bool,
    agent: Agent, db: AsyncSession
):
    """执行工具调用并追加结果到消息（调试模式）"""
    _FORMAT_HANDLERS = {
        True: _append_anthropic_tool_round_debug,
        False: _append_openai_tool_round_debug,
    }
    await _FORMAT_HANDLERS[is_anthropic](messages, result, active_skills_dir, agent, db)


async def _append_anthropic_tool_round_debug(
    messages: list, result, active_skills_dir,
    agent: Agent, db: AsyncSession
):
    """Anthropic format: assistant content blocks + user tool_result blocks（调试模式）"""
    import json
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
        content = await _get_tool_result_debug(tc.name, args, active_skills_dir, agent, db)
        logger.info(f"  {tc.name}({args}) → {len(content)} chars")
        tool_results.append({
            "type": "tool_result", "tool_use_id": tc.id, "content": content,
        })
    messages.append({"role": "user", "content": tool_results})
    result.full_response = ""


async def _append_openai_tool_round_debug(
    messages: list, result, active_skills_dir,
    agent: Agent, db: AsyncSession
):
    """OpenAI format: assistant message with tool_calls + tool role messages（调试模式）"""
    import json
    assistant_msg = {
        "role": "assistant",
        "content": result.full_response or None,
        "tool_calls": [
            {
                "id": tc.id, "type": "function",
                "function": {"name": tc.name, "arguments": tc.arguments},
                "thought_signature": tc.thought_signature,
            }
            for tc in result.tool_calls
        ],
    }
    messages.append(assistant_msg)

    for tc in result.tool_calls:
        args = json.loads(tc.arguments)
        content = await _get_tool_result_debug(tc.name, args, active_skills_dir, agent, db)
        logger.info(f"  {tc.name}({args}) → {len(content)} chars")
        messages.append({
            "role": "tool", "tool_call_id": tc.id, "content": content,
        })
    result.full_response = ""


async def _get_tool_result_debug(
    tc_name: str, tc_args: dict, active_skills_dir, agent: Agent, db: AsyncSession
) -> str:
    """Dispatch tool execution by name（调试模式 - 不包含画布工具）"""
    # 异步工具派发表
    _ASYNC_DISPATCHERS = {
        IMAGE_GEN_TOOL_NAME: lambda: execute_image_gen_tool(tc_args, agent, db),
    }
    async_handler = _ASYNC_DISPATCHERS.get(tc_name)
    if async_handler:
        return await async_handler()
    _DISPATCH = {
        "load_skill": lambda args: load_skill_content(args.get("skill_name", ""), active_skills_dir),
    }
    handler = _DISPATCH.get(tc_name) or (lambda args: execute_base_tool(tc_name, args))
    return handler(tc_args)


@router.delete("/sessions/{session_id}")
async def delete_debug_session(
    session_id: str,
    current_admin=Depends(get_current_active_admin),
    db: AsyncSession = Depends(get_db),
):
    """删除调试会话及其所有消息"""
    query = select(AdminDebugSession).filter(
        AdminDebugSession.id == session_id,
        AdminDebugSession.admin_id == current_admin.id
    )
    session = await db.scalar(query)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # 先删除所有消息
    await db.execute(delete(AdminDebugMessage).where(AdminDebugMessage.session_id == session_id))
    # 再删除会话
    await db.delete(session)
    await db.commit()
    return {"message": "Debug session deleted"}
