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
import asyncio

from database import get_db, AsyncSessionLocal
from models import (
    Agent, AdminDebugSession, AdminDebugMessage, 
    LLMProvider, Admin, CreditTransaction, ToolConfig
)
from schemas import (
    AdminDebugSessionCreate, AdminDebugSessionResponse,
    AdminDebugMessageCreate, AdminDebugMessageResponse
)
from auth import get_current_active_admin, is_admin_entity
from services.llm_stream import stream_completion
from services.orchestrator import DynamicOrchestrator
from services.billing import calculate_credit_cost, CreditTransaction as BillingCreditTransaction
from services.image_config_adapter import resolve_global_image_configs
from services.tool_manager import ToolManager, ToolContext, IMAGE_GEN_TOOL_NAME
from services.tool_manager.context import TOOL_SKILL_GATE_MAP
from services.skill_tools import build_skill_prompt, build_load_skill_tool_def, load_skill_content
from services.chat_utils import (
    sse, serialize_content, deserialize_content,
    get_last_image_path, image_file_to_data_url, inject_image_to_message,
)
from services.chat_tool_dispatch import append_tool_round
from sqlalchemy import select as sql_select

logger = logging.getLogger(__name__)

# Harness constants (import from chat_generation to keep in sync)
from services.chat_generation import MAX_LLM_RETRIES, RETRY_BACKOFF_SECONDS


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
        content=serialize_content(message.content)
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
        deserialized = deserialize_content(msg.content)
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
    yield sse("done", {})

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

    # 加载调试会话（用于读取压缩状态）
    debug_session_result = await db.execute(select(AdminDebugSession).filter(AdminDebugSession.id == session_id))
    debug_session = debug_session_result.scalars().first()
    skip_count = int(debug_session.compressed_before_id or "0") if debug_session else 0

    # 准备消息列表
    messages = []
    if agent.system_prompt:
        messages.append({"role": "system", "content": agent.system_prompt})

    # 注入已有压缩摘要到 system prompt
    (debug_session and debug_session.compressed_summary and messages and messages[0].get("role") == "system"
     and messages[0].__setitem__(
         "content",
         messages[0]["content"] + f"\n\n# Previous Conversation Summary\n{debug_session.compressed_summary}",
     ))

    # 加载历史消息（跳过已被摘要覆盖的旧消息）
    for msg in history[skip_count:]:
        role = msg.role if msg.role in ["user", "assistant", "system"] else "user"
        deserialized = deserialize_content(msg.content)
        if role == "assistant" and isinstance(deserialized, dict) and "text" in deserialized:
            content_val = deserialized.get("text") or ""
        else:
            content_val = deserialized
        messages.append({"role": role, "content": content_val})

    # 如果用户请求编辑上一张图片
    # 从全局 ToolConfig 读取图像生成启用状态
    global_image_result = await db.execute(
        sql_select(ToolConfig).where(ToolConfig.tool_name == "generate_image")
    )
    global_image_config = global_image_result.scalar_one_or_none()
    image_gen_enabled = (global_image_config.config if global_image_config else {}).get("image_generation_enabled", False)
    
    if edit_last_image and image_gen_enabled:
        last_image_path = get_last_image_path(history)
        if last_image_path is not None:
            data_url = image_file_to_data_url(last_image_path)
            if data_url and messages:
                last_msg = messages[-1]
                (last_msg.get("role") == "user") and inject_image_to_message(last_msg, data_url)

    # 工具配置（统一工具管理器，调试模式 theater_id=None）
    tool_manager = ToolManager()
    ctx = ToolContext(theater_id=None, agent=agent, db=db,
                      session_id=session_id, user_id=admin_id, is_admin=True)
    agent_skills = agent.tools or []

    # 从聊天历史恢复已加载的技能（渐进式披露：跨轮次持久化）
    loaded_skills: set[str] = set()
    for msg in history[skip_count:]:
        deserialized = (msg.role == "assistant") and deserialize_content(msg.content)
        (isinstance(deserialized, dict) and deserialized.get("skill_calls")) and loaded_skills.update(
            sc.get("skill_name", "") for sc in deserialized["skill_calls"]
            if sc.get("status") == "loaded" and sc.get("skill_name")
        )
    ctx.loaded_tool_skills.update(s for s in loaded_skills if s in TOOL_SKILL_GATE_MAP)
    loaded_skills and logger.info(f"Restored skills from history: {loaded_skills}")

    tool_defs = await tool_manager.build_tool_defs(ctx)

    # 技能系统（与工具同级，独立编排）
    remaining_skills = [s for s in agent_skills if s not in loaded_skills]
    remaining_skills and (tool_defs := (tool_defs or []) + [build_load_skill_tool_def(remaining_skills)])

    # 注入技能信息到 system prompt
    _skill_prompt_parts: list[str] = []
    for s in loaded_skills:
        _skill_content = load_skill_content(s, ctx.active_skills_dir)
        _skill_content and _skill_prompt_parts.append(_skill_content)
    remaining_skills and _skill_prompt_parts.append(
        build_skill_prompt(remaining_skills, ctx.active_skills_dir)
    )
    _skill_prompt_combined = "\n\n".join(filter(None, _skill_prompt_parts))
    (_skill_prompt_combined and messages and messages[0].get("role") == "system"
     and messages[0].__setitem__("content", messages[0]["content"] + "\n\n" + _skill_prompt_combined))

    # 上下文压缩（在所有注入完成后、LLM 调用前）
    from services.context_compaction import compact_context
    compaction_result = await compact_context(messages, agent, provider, db, session_id, session_obj=debug_session)
    if compaction_result:
        messages, _summary = compaction_result
        yield sse("context_compacted", {"message": "Context compacted", "preserved_messages": len(messages)})

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
    logger.info(f"Skills: {agent.tools or 'none'}")
    logger.info(f"Current message: {content}")
    logger.info(f"{'-'*60}")

    # 调用 LLM 流式接口
    is_anthropic = provider.provider_type.lower() in ("anthropic", "minimax")
    MAX_TOOL_ROUNDS = 200
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
            # 通过适配器解析有效的图像配置（使用全局 ToolConfig）
            global_cfg = (global_image_config.config if global_image_config else {})
            _eff_gemini, _eff_xai = resolve_global_image_configs(global_cfg, agent, provider.provider_type)

            # Harness: LLM 调用重试 + 熔断
            _llm_success = False
            for _retry in range(MAX_LLM_RETRIES):
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
                        gemini_config=_eff_gemini,
                        tools=current_tools,
                        xai_image_config=_eff_xai,
                    ):
                        yield sse("text", {"chunk": chunk})
                    _llm_success = True
                    break
                except Exception as llm_err:
                    _attempt = _retry + 1
                    logger.warning(f"[Debug] LLM attempt {_attempt}/{MAX_LLM_RETRIES} failed: {llm_err}")
                    (_attempt < MAX_LLM_RETRIES) and (
                        yield sse("llm_retry", {"attempt": _attempt, "max_retries": MAX_LLM_RETRIES, "error": str(llm_err)})
                    )
                    (_attempt < MAX_LLM_RETRIES) and await asyncio.sleep(
                        RETRY_BACKOFF_SECONDS[min(_retry, len(RETRY_BACKOFF_SECONDS) - 1)]
                    )

            # 熔断：LLM 调用全部失败
            if not _llm_success:
                yield sse("llm_circuit_breaker", {"retries": MAX_LLM_RETRIES, "round": _round + 1})
                raise Exception(f"LLM circuit breaker: all {MAX_LLM_RETRIES} attempts failed")

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
                yield sse(_SSE_START[is_skill], event_data)

            # 执行工具调用并追加结果到消息
            logger.info(f"[Tool Round {_round + 1}] {len(result.tool_calls)} tool call(s)")
            await append_tool_round(messages, result, tool_manager, ctx, is_anthropic)

            # 累计 generate_image 工具产生的图片数（用于计费）
            tool_generated_image_count += sum(
                min(max(json.loads(tc.arguments).get("n", 1), 1), 4)
                for tc in result.tool_calls
                if tc.name == IMAGE_GEN_TOOL_NAME
            )

            # 追踪已加载的技能
            tool_skill_loaded = False
            for tc in result.tool_calls:
                (tc.name == "load_skill") and loaded_skills.add(json.loads(tc.arguments).get("skill_name", ""))
            # 检测本轮是否有工具Skill被加载
            tool_skill_loaded = any(
                tc.name == "load_skill" and json.loads(tc.arguments).get("skill_name", "") in TOOL_SKILL_GATE_MAP
                for tc in result.tool_calls
            )

            # 重建工具定义（技能 enum 自动缩减）
            # 如果有工具Skill被加载，需完整异步重建以注入新解锁的工具定义
            remaining_skills = [s for s in agent_skills if s not in loaded_skills]
            managed_defs = (
                await tool_manager.build_tool_defs(ctx)
                if tool_skill_loaded
                else tool_manager.rebuild_after_round(ctx)
            )
            tool_defs = (managed_defs or []) + ([build_load_skill_tool_def(remaining_skills)] if remaining_skills else [])
            tool_defs = tool_defs or None

            # 发送 tool 完成事件
            for tc in result.tool_calls:
                args = json.loads(tc.arguments)
                is_skill = tc.name == "load_skill"
                event_data = (
                    {"skill_name": args.get("skill_name", "")}
                    if is_skill else
                    {"tool_name": tc.name, "success": True}
                )
                yield sse(_SSE_END[is_skill], event_data)

        yield sse("done", {})

    except Exception as e:
        generation_failed = True
        logger.error(f"LLM generation failed: {e}")
        yield sse("error", {"message": str(e)})

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
