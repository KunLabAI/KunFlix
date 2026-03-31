"""
Single-agent chat generation: LLM streaming loop with tool rounds, billing, and canvas bridge.
"""
import json
import logging
from typing import Any

from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal
from models import Agent, ChatSession, ChatMessage, LLMProvider, User, Admin
from services.chat_utils import (
    sse, deserialize_content, extract_media_filename,
    get_last_image_path, image_file_to_data_url, inject_image_to_message,
)
from services.chat_tool_dispatch import append_tool_round
from services.llm_stream import stream_completion
from services.skill_tools import build_skill_prompt, build_load_skill_tool_def
from services.base_tools import build_base_tool_defs
from services.canvas_tools import build_canvas_tool_defs, CANVAS_TOOL_NAMES
from services.image_gen_tools import build_image_gen_tool_def_list, IMAGE_GEN_TOOL_NAME
from services.billing import calculate_credit_cost, deduct_credits_atomic, InsufficientCreditsError, BalanceFrozenError
from services.media_utils import MEDIA_DIR
from services.image_config_adapter import resolve_image_configs

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

    # 准备消息列表
    messages = []
    if agent.system_prompt:
        messages.append({"role": "system", "content": agent.system_prompt})

    for msg in history:
        role = msg.role if msg.role in ["user", "assistant", "system"] else "user"
        deserialized = deserialize_content(msg.content)
        if role == "assistant" and isinstance(deserialized, dict) and "text" in deserialized:
            content_val = deserialized.get("text") or ""
        else:
            content_val = deserialized
        messages.append({"role": role, "content": content_val})

    # 图片注入：将画布节点的图片或历史图片注入为本轮多模态输入
    # 两条路径：
    #   1. edit_image_url（画布节点附件）→ 始终注入（用于 AI 分析/查看），不依赖 image_generation_enabled
    #   2. edit_last_image（编辑历史图片）→ 仅在 image_generation_enabled 时注入（图片编辑工作流）
    _IMAGE_EDIT_ENABLED = {
        "gemini": lambda a: (a.image_config or a.gemini_config or {}).get("image_generation_enabled"),
        "xai": lambda a: (a.image_config or a.xai_image_config or {}).get("image_generation_enabled"),
    }
    _edit_checker = _IMAGE_EDIT_ENABLED.get(provider.provider_type.lower(), lambda a: False)

    _edit_image_data_url = None
    # 路径 1：画布节点图片
    _img_filename = None
    if edit_image_url:
        _img_filename = extract_media_filename(edit_image_url)
        _img_filename and (_edit_image_data_url := image_file_to_data_url(str(MEDIA_DIR / _img_filename)))
    # 路径 2：历史图片编辑 — 需要 image_generation_enabled
    elif edit_last_image and _edit_checker(agent):
        last_image_path = get_last_image_path(history)
        last_image_path and (_edit_image_data_url := image_file_to_data_url(last_image_path))

    if _edit_image_data_url and messages:
        last_msg = messages[-1]
        (last_msg.get("role") == "user") and inject_image_to_message(last_msg, _edit_image_data_url)
        logger.info(f"Injected image into user message: {_img_filename or 'history_image'}")

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
    # 仅支持工具化生成的供应商才注册（如 xAI）；Gemini 等使用 response_modalities 原生生成
    _TOOL_GEN_PROVIDERS = {"xai"}
    image_gen_defs = build_image_gen_tool_def_list(agent)
    if image_gen_defs:
        _img_provider_id = (agent.image_config or {}).get("image_provider_id")
        _img_prov_result = await db.execute(select(LLMProvider).filter(LLMProvider.id == _img_provider_id))
        _img_prov = _img_prov_result.scalar_one_or_none()
        image_gen_defs = image_gen_defs if (_img_prov and _img_prov.provider_type.lower() in _TOOL_GEN_PROVIDERS) else []
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
            await append_tool_round(messages, result, active_skills_dir, is_anthropic, theater_id, agent, db)

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
                yield sse(_SSE_END[is_skill], event_data)
                
                # Canvas tool 执行后发送画布更新事件，通知前端刷新
                is_canvas and theater_id and (
                    yield sse("canvas_updated", {"theater_id": theater_id, "action": tc.name})
                )

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
    yield sse("billing", billing_event)

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
                    yield sse("canvas_updated", {"theater_id": theater_id, "action": action})
        except Exception as e:
            logger.error(f"Image canvas bridge failed: {e}")

    yield sse("done", {})
