"""
Single-agent chat generation: LLM streaming loop with tool rounds, billing, and canvas bridge.
"""
import json
import logging
from typing import Any

from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal
from models import Agent, ChatSession, ChatMessage, LLMProvider, User, Admin, ToolConfig
from services.chat_utils import (
    sse, deserialize_content, extract_media_filename,
    get_last_image_path, image_file_to_data_url, inject_image_to_message,
)
from services.chat_tool_dispatch import append_tool_round
from services.llm_stream import stream_completion
from services.tool_manager import ToolManager, ToolContext, CANVAS_TOOL_NAMES, IMAGE_GEN_TOOL_NAME
from services.tool_manager.context import TOOL_SKILL_GATE_MAP
from services.skill_tools import build_skill_prompt, build_load_skill_tool_def
from services.billing import calculate_credit_cost, deduct_credits_atomic, InsufficientCreditsError, BalanceFrozenError
from services.media_utils import MEDIA_DIR
from services.image_config_adapter import resolve_global_image_configs

logger = logging.getLogger(__name__)


async def generate_single_agent(
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
    """Single-agent streaming generator."""
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

    # 加载会话（用于读取压缩状态）
    session_result = await db.execute(select(ChatSession).filter(ChatSession.id == session_id))
    chat_session = session_result.scalars().first()
    skip_count = int(chat_session.compressed_before_id or "0") if chat_session else 0

    # 准备消息列表
    messages = []
    if agent.system_prompt:
        messages.append({"role": "system", "content": agent.system_prompt})

    # 注入已有压缩摘要到 system prompt
    (chat_session and chat_session.compressed_summary and messages and messages[0].get("role") == "system"
     and messages[0].__setitem__(
         "content",
         messages[0]["content"] + f"\n\n# Previous Conversation Summary\n{chat_session.compressed_summary}",
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

    # 从全局 ToolConfig 读取图像生成配置
    from sqlalchemy import select as sql_select
    global_image_result = await db.execute(
        sql_select(ToolConfig).where(ToolConfig.tool_name == "generate_image")
    )
    global_image_config = global_image_result.scalar_one_or_none()
    global_image_cfg = (global_image_config.config if global_image_config else {})
    image_gen_enabled = global_image_cfg.get("image_generation_enabled", False)

    # 图片注入：将画布节点的图片或历史图片注入为本轮多模态输入
    # 两条路径：
    #   1. edit_image_url（画布节点附件）→ 始终注入（用于 AI 分析/查看），不依赖 image_generation_enabled
    #   2. edit_last_image（编辑历史图片）→ 仅在 image_generation_enabled 时注入（图片编辑工作流）
    _edit_image_data_url = None
    # 路径 1：画布节点图片
    _img_filename = None
    if edit_image_url:
        _img_filename = extract_media_filename(edit_image_url)
        _img_filename and (_edit_image_data_url := image_file_to_data_url(str(MEDIA_DIR / _img_filename)))
    # 路径 2：历史图片编辑 — 需要 image_generation_enabled
    elif edit_last_image and image_gen_enabled:
        last_image_path = get_last_image_path(history)
        last_image_path and (_edit_image_data_url := image_file_to_data_url(last_image_path))

    if _edit_image_data_url and messages:
        last_msg = messages[-1]
        (last_msg.get("role") == "user") and inject_image_to_message(last_msg, _edit_image_data_url)
        # 附带媒体路径提示，让 LLM 使用路径调用 edit_image（而非尝试复制 base64）
        _media_path = _img_filename and f"/api/media/{_img_filename}"
        _media_path and isinstance(last_msg.get("content"), list) and last_msg["content"].append(
            {"type": "text", "text": f"[Image source path: {_media_path} — use this path as image_url for edit_image tool, do NOT pass base64 data]"}
        )
        logger.info(f"Injected image into user message: {_img_filename or 'history_image'}")

    # 工具管理器 — 构建工具定义
    tool_manager = ToolManager()
    ctx = ToolContext(theater_id=theater_id, agent=agent, db=db,
                      session_id=session_id, user_id=entity_id, is_admin=is_admin)
    agent_skills = agent.tools or []
    loaded_skills: set[str] = set()
    tool_defs = await tool_manager.build_tool_defs(ctx)

    # 技能系统（与工具同级，独立编排）
    remaining_skills = list(agent_skills)
    remaining_skills and (tool_defs := (tool_defs or []) + [build_load_skill_tool_def(remaining_skills)])

    # 注入轻量技能索引到 system prompt
    skill_prompt = build_skill_prompt(agent_skills, ctx.active_skills_dir) if agent_skills else ""
    (skill_prompt and messages and messages[0].get("role") == "system"
     and messages[0].__setitem__("content", messages[0]["content"] + "\n\n" + skill_prompt))

    # 上下文压缩（在所有注入完成后、LLM 调用前）
    from services.context_compaction import compact_context
    compaction_result = await compact_context(messages, agent, provider, db, session_id, session_obj=chat_session)
    if compaction_result:
        messages, _summary = compaction_result
        yield sse("context_compacted", {"message": "Context compacted", "preserved_messages": len(messages)})

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
    logger.info(f"Skills: {agent.tools or 'none'}")
    logger.info(f"Current message: {content}")
    # 输出发送给 LLM 的完整消息列表
    logger.info(f"--- Messages ({len(messages)}) ---")
    for i, m in enumerate(messages):
        role = m.get("role", "?")
        c = m.get("content", "")
        # 多模态消息（list）只显示文本部分摘要
        preview = (
            c[:200] if isinstance(c, str)
            else " | ".join(p.get("text", "[non-text]")[:80] for p in c if isinstance(p, dict))[:200]
        )
        logger.info(f"  [{i}] {role}: {preview}{'...' if len(str(c)) > 200 else ''}")
    # 输出工具定义
    tool_names_list = [d.get("function", {}).get("name", "?") for d in (tool_defs or [])]
    logger.info(f"--- Tools ({len(tool_names_list)}): {tool_names_list} ---")
    logger.info(f"{'-'*60}")

    # 调用 LLM 流式接口（含工具调用循环）
    is_anthropic = provider.provider_type.lower() in ("anthropic", "minimax")
    MAX_TOOL_ROUNDS = 5
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
            # 通过适配器解析有效的图像配置（使用全局 ToolConfig）
            _eff_gemini, _eff_xai = resolve_global_image_configs(global_image_cfg, agent, provider.provider_type)
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
                yield sse(_SSE_START[is_skill], event_data)

            # 执行工具调用并追加结果到消息
            logger.info(f"[Tool Round {_round + 1}] {len(result.tool_calls)} tool call(s)")
            await append_tool_round(messages, result, tool_manager, ctx, is_anthropic)

            # 输出工具轮次后新增的消息（assistant tool_calls + tool results）
            _new_msgs = messages[-(1 + len(result.tool_calls)):] if not is_anthropic else messages[-2:]
            for nm in _new_msgs:
                _r = nm.get("role", "?")
                _c = nm.get("content", "")
                _tc = nm.get("tool_calls")
                # tool_calls 消息：显示函数名
                _tc_names = [t.get("function", {}).get("name", "?") for t in (_tc or [])]
                _preview = (
                    f"tool_calls={_tc_names}" if _tc
                    else (str(_c)[:300] if isinstance(_c, str) else str(_c)[:300])
                )
                logger.info(f"  >> [{_r}] {_preview}{'...' if len(str(_c)) > 300 else ''}")

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
            # 检测本轮是否有工具Skill被加载（ctx.loaded_tool_skills 已在 _execute_skill 中更新）
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

            # 输出重建后的工具列表（仅在发生变化时）
            tool_skill_loaded and logger.info(
                f"  [Skill-gate] Rebuilt tools: {[d.get('function', {}).get('name', '?') for d in (tool_defs or [])]}"
            )

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
                yield sse(_SSE_END[is_skill], event_data)
                
                # Canvas / edit_image 工具执行后发送画布更新事件，通知前端刷新
                (is_canvas or tc.name == "edit_image") and theater_id and (
                    yield sse("canvas_updated", {"theater_id": theater_id, "action": tc.name})
                )

            # 发送视频任务创建事件（通知前端启动轮询UI）
            for vt in ctx.video_tasks:
                yield sse("video_task_created", vt)
            ctx.video_tasks.clear()

    except Exception as e:
        generation_failed = True
        logger.error(f"LLM generation failed: {e}")
        yield sse("error", {"message": str(e)})

    # 生成失败时不保存消息也不扣费
    if generation_failed or not result:
        logger.info(f"{'='*60} (no billing - generation {'failed' if generation_failed else 'empty'})\n")
        yield sse("done", {})
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

            # 查询最新余额
            balance_result = await session.execute(
                select(entity_model.credits).where(entity_model.id == entity_id)
            )
            billing_event["remaining_credits"] = round(float(balance_result.scalar() or 0), 4)

        except Exception as e:
            logger.error(f"Failed to save message/billing: {e}")

    # 发送计费信息和完成事件
    yield sse("billing", billing_event)

    # 画布图像桥接：图像生成后自动创建/更新画布节点
    # 使用全局 ToolConfig 判断图像生成是否启用
    _node_types = set(agent.target_node_types or [])
    _has_image_target = bool(_node_types & {"image", "character"})
    _is_image_enabled = image_gen_enabled
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
                    yield sse("canvas_updated", {"theater_id": theater_id, "action": action})
        except Exception as e:
            logger.error(f"Image canvas bridge failed: {e}")

    yield sse("done", {})
    yield sse("done", {})
