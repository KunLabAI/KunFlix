"""
Single-agent chat generation: LLM streaming loop with tool rounds, billing, and canvas bridge.
"""
import json
import logging
from typing import Any
import asyncio

from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal
from models import Agent, ChatSession, ChatMessage, LLMProvider, User, Admin, ToolConfig
from services.chat_utils import (
    sse, deserialize_content, extract_media_filename,
    get_last_image_path, image_file_to_data_url, inject_image_to_message,
    inject_attachment_images,
)
from services.chat_tool_dispatch import append_tool_round, append_tool_round_with_errors
from services.agent_executor import _extract_tool_results
from services.llm_stream import stream_completion
from services.tool_manager import ToolManager, ToolContext, CANVAS_TOOL_NAMES, IMAGE_GEN_TOOL_NAME
from services.tool_manager.context import TOOL_SKILL_GATE_MAP
from services.skill_tools import build_skill_prompt, build_load_skill_tool_def, load_skill_content
from services.billing import calculate_credit_cost, deduct_credits_atomic, InsufficientCreditsError, BalanceFrozenError, check_balance_sufficient, is_paid_agent as check_is_paid_agent
from services.media_utils import MEDIA_DIR
from services.image_config_adapter import resolve_global_image_configs

logger = logging.getLogger(__name__)

# =============================================================================
# Harness: Single-agent LLM retry & circuit breaker constants
# =============================================================================
MAX_LLM_RETRIES = 3                 # 单次 stream_completion 调用最大重试次数
MAX_CONSECUTIVE_TOOL_FAILURES = 5   # 连续工具调用失败上限（触发工具循环熔断）
RETRY_BACKOFF_SECONDS = (0.5, 1.0, 2.0)  # 重试退避时间
MAX_THINKING_ONLY_RETRIES = 1       # 模型仅输出思考内容时的重试次数

import re
_THINK_ONLY_RE = re.compile(r'^\s*<think>.*?</think>\s*$', re.DOTALL)
_THINK_EXTRACT_RE = re.compile(r'<think>(.*?)</think>', re.DOTALL)


def _extract_reasoning_to_msg(msg: dict) -> bool:
    """Extract <think> blocks from content into reasoning_content field.
    
    DeepSeek thinking mode requires reasoning_content to be passed back
    as a separate field on assistant messages. Returns True if extraction occurred.
    """
    content = msg.get("content", "")
    match = _THINK_EXTRACT_RE.search(content)
    match and msg.update(
        reasoning_content=match.group(1),
        content=_THINK_EXTRACT_RE.sub("", content).strip() or None,
    )
    return bool(match)


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
    _is_thinking_provider = provider.provider_type in ("deepseek",)
    for msg in history[skip_count:]:
        role = msg.role if msg.role in ["user", "assistant", "system"] else "user"
        deserialized = deserialize_content(msg.content)
        if role == "assistant" and isinstance(deserialized, dict) and "text" in deserialized:
            content_val = deserialized.get("text") or ""
        else:
            content_val = deserialized
        hist_msg = {"role": role, "content": content_val}
        # DeepSeek thinking mode: extract <think> blocks into reasoning_content field
        (_is_thinking_provider and agent.thinking_mode
         and role == "assistant" and isinstance(content_val, str)
         and _extract_reasoning_to_msg(hist_msg))
        messages.append(hist_msg)

    # 从全局 ToolConfig 读取图像生成配置
    from sqlalchemy import select as sql_select
    global_image_result = await db.execute(
        sql_select(ToolConfig).where(ToolConfig.tool_name == "generate_image")
    )
    global_image_config = global_image_result.scalar_one_or_none()
    global_image_cfg = (global_image_config.config if global_image_config else {})
    image_gen_enabled = global_image_cfg.get("image_generation_enabled", False)

    # 图片注入：将画布节点的图片或历史图片注入为本轮多模态输入
    # 三条路径（优先级递减）：
    #   1. __ATTACHMENTS__ 元数据 → 解析所有图片附件，批量注入（最常见：用户引用多张画布图片）
    #   2. edit_image_url（画布单图编辑）→ 注入单张图（用于 AI 分析/查看）
    #   3. edit_last_image（编辑历史图片）→ 仅在 image_generation_enabled 时注入（图片编辑工作流）
    _injected_images: list[str] = []

    # 路径 1：从消息文本的 __ATTACHMENTS__ 解析所有图片附件
    last_msg = messages[-1] if messages else None
    if last_msg and last_msg.get("role") == "user":
        _injected_images = await inject_attachment_images(last_msg)

    # 路径 2/3：__ATTACHMENTS__ 未注入任何图片时，回退到单图注入
    _edit_image_data_url = None
    _img_filename = None
    if not _injected_images:
        # 路径 2：画布节点单图
        if edit_image_url:
            _img_filename = extract_media_filename(edit_image_url)
            _img_filename and (_edit_image_data_url := await image_file_to_data_url(str(MEDIA_DIR / _img_filename)))
        # 路径 3：历史图片编辑 — 需要 image_generation_enabled
        elif edit_last_image and image_gen_enabled:
            last_image_path = get_last_image_path(history)
            last_image_path and (_edit_image_data_url := await image_file_to_data_url(last_image_path))

        if _edit_image_data_url and last_msg and last_msg.get("role") == "user":
            inject_image_to_message(last_msg, _edit_image_data_url)
            _media_path = _img_filename and f"/api/media/{_img_filename}"
            _media_path and isinstance(last_msg.get("content"), list) and last_msg["content"].append(
                {"type": "text", "text": f"[Image source path: {_media_path} — use this path as image_url for edit_image tool, do NOT pass base64 data]"}
            )
            _injected_images = [_img_filename or "history_image"]

    _injected_images and logger.info(f"Injected {len(_injected_images)} image(s) into user message: {', '.join(_injected_images)}")

    # 工具管理器 — 构建工具定义
    tool_manager = ToolManager()
    ctx = ToolContext(theater_id=theater_id, agent=agent, db=db,
                      session_id=session_id, user_id=entity_id, is_admin=is_admin)
    agent_skills = agent.tools or []

    # 从聊天历史恢复已加载的技能（渐进式披露：跨轮次持久化）
    # assistant 消息中的 skill_calls 字段记录了之前加载过的技能
    loaded_skills: set[str] = set()
    for msg in history[skip_count:]:
        deserialized = (msg.role == "assistant") and deserialize_content(msg.content)
        (isinstance(deserialized, dict) and deserialized.get("skill_calls")) and loaded_skills.update(
            sc.get("skill_name", "") for sc in deserialized["skill_calls"]
            if sc.get("status") == "loaded" and sc.get("skill_name")
        )
    # 同步到 ToolContext，使 is_skill_gated() 对已加载技能返回 False
    ctx.loaded_tool_skills.update(s for s in loaded_skills if s in TOOL_SKILL_GATE_MAP)
    loaded_skills and logger.info(f"Restored skills from history: {loaded_skills}")

    tool_defs = await tool_manager.build_tool_defs(ctx)

    # 技能系统（与工具同级，独立编排）
    remaining_skills = [s for s in agent_skills if s not in loaded_skills]
    remaining_skills and (tool_defs := (tool_defs or []) + [build_load_skill_tool_def(remaining_skills)])

    # 注入技能信息到 system prompt
    # 已恢复的技能：注入完整内容（补偿工具调用轮次未持久化导致的上下文丢失）
    # 未加载的技能：仅注入轻量索引（名称 + 描述）
    _skill_prompt_parts: list[str] = []
    # 已恢复技能：完整内容
    for s in loaded_skills:
        _skill_content = load_skill_content(s, ctx.active_skills_dir)
        _skill_content and _skill_prompt_parts.append(_skill_content)
    # 未加载技能：轻量索引
    remaining_skills and _skill_prompt_parts.append(
        build_skill_prompt(remaining_skills, ctx.active_skills_dir)
    )
    _skill_prompt_combined = "\n\n".join(filter(None, _skill_prompt_parts))
    (_skill_prompt_combined and messages and messages[0].get("role") == "system"
     and messages[0].__setitem__("content", messages[0]["content"] + "\n\n" + _skill_prompt_combined))

    # 注意：禁用工具结果预截断，以保持渐进式披露架构的完整性
    # load_skill 的结果需要完整保留，否则 AI 会反复重新加载 skill
    # 如果上下文过长，由后续的 compact_context 机制处理
    from services.context_compaction import load_compaction_config_from_agent
    _compact_cfg = load_compaction_config_from_agent(agent)
    _messages_snapshot = list(messages)  # 快照：用于后续延迟压缩（工具调用循环会修改 messages）

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
    # 二次余额防护：服务层在 LLM 调用前再次验证（防止路由层检查后余额被并发消耗）
    if check_is_paid_agent(agent):
        try:
            async with AsyncSessionLocal() as _pre_db:
                _balance_ok = await check_balance_sufficient(entity_id, 0, _pre_db)
                if not _balance_ok:
                    yield sse("error", {"message": "积分余额不足，请充值后继续使用"})
                    return
        except BalanceFrozenError:
            yield sse("error", {"message": "账户资金已冻结，请联系管理员"})
            return

    TOOL_PENDING_PREFIX = "__TOOL_PENDING__:"
    TOOL_DELTA_PREFIX = "__TOOL_DELTA__:"
    is_anthropic = provider.provider_type.lower() in ("anthropic", "minimax")
    # 从智能体配置读取工具调用轮次限制，默认100，范围10-200
    MAX_TOOL_ROUNDS = max(10, min(200, agent.max_tool_rounds or 100))
    all_tool_calls = []  # 记录所有执行的普通工具
    tool_generated_image_count = 0  # generate_image 工具累计生成图片数（跨轮次）
    result = None
    generation_failed = False
    _SSE_START = {True: "skill_call", False: "tool_call"}
    _SSE_END = {True: "skill_loaded", False: "tool_result"}
    _consecutive_tool_failures = 0   # Harness: 连续工具失败计数器
    _thinking_only_retried = False     # thinking-only 重试标记（防止无限循环）
    try:
        for _round in range(MAX_TOOL_ROUNDS + 1):
            is_last_round = _round == MAX_TOOL_ROUNDS
            current_tools = None if is_last_round else tool_defs
            result = None
            # 通过适配器解析有效的图像配置（使用全局 ToolConfig）
            _eff_gemini, _eff_xai = resolve_global_image_configs(global_image_cfg, agent, provider.provider_type)

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
                        user_id=entity_id,
                    ):
                        # Early tool detection / delta signals from stream layer
                        _is_pending = chunk.startswith(TOOL_PENDING_PREFIX)
                        _is_delta = (not _is_pending) and chunk.startswith(TOOL_DELTA_PREFIX)
                        _is_pending and (
                            (yield sse("tool_pending", {"tool_name": chunk[len(TOOL_PENDING_PREFIX):]})) or True
                        )
                        _is_delta and (
                            (yield sse("tool_call_delta", {
                                "tool_name": chunk[len(TOOL_DELTA_PREFIX):].split(":", 1)[0],
                                "chunk": chunk[len(TOOL_DELTA_PREFIX):].split(":", 1)[1] if ":" in chunk[len(TOOL_DELTA_PREFIX):] else "",
                            })) or True
                        )
                        (not _is_pending and not _is_delta) and (yield sse("text", {"chunk": chunk}))
                    _llm_success = True
                    break
                except Exception as llm_err:
                    _attempt = _retry + 1
                    logger.warning(f"LLM call attempt {_attempt}/{MAX_LLM_RETRIES} failed: {llm_err}")
                    # 未达上限，发送重试事件并退避
                    (_attempt < MAX_LLM_RETRIES) and (
                        yield sse("llm_retry", {"attempt": _attempt, "max_retries": MAX_LLM_RETRIES, "error": str(llm_err)})
                    )
                    (_attempt < MAX_LLM_RETRIES) and await asyncio.sleep(
                        RETRY_BACKOFF_SECONDS[min(_retry, len(RETRY_BACKOFF_SECONDS) - 1)]
                    )

            # 熔断：LLM 调用全部失败
            if not _llm_success:
                yield sse("llm_circuit_breaker", {"retries": MAX_LLM_RETRIES, "round": _round + 1})
                raise Exception(f"LLM circuit breaker: all {MAX_LLM_RETRIES} attempts failed in round {_round + 1}")

            # 无 tool_calls → 检查是否仅有思考内容（无可见文本）
            if not (result and result.tool_calls):
                # 检测 thinking-only 响应：full_response 全部在 <think> 标签内，无用户可见文本
                _is_thinking_only = (
                    result
                    and result.full_response
                    and _THINK_ONLY_RE.match(result.full_response)
                )
                if _is_thinking_only and not _thinking_only_retried:
                    _thinking_only_retried = True
                    logger.warning("Response is thinking-only (no visible text), retrying LLM call")
                    # 保留 thinking 内容（已发送到前端），重置 result 并重新调用 LLM
                    _saved_thinking = result.full_response
                    result = None
                    for _retry2 in range(MAX_LLM_RETRIES):
                        try:
                            async for chunk, result in stream_completion(
                                provider_type=provider.provider_type,
                                api_key=provider.api_key,
                                base_url=provider.base_url,
                                model=agent.model,
                                messages=messages,
                                temperature=min((agent.temperature or 0.7) + 0.2, 1.5),
                                context_window=agent.context_window,
                                thinking_mode=agent.thinking_mode,
                                gemini_config=_eff_gemini,
                                tools=current_tools,
                                xai_image_config=_eff_xai,
                                user_id=entity_id,
                            ):
                                # Early tool detection / delta signals from stream layer
                                _is_pending2 = chunk.startswith(TOOL_PENDING_PREFIX)
                                _is_delta2 = (not _is_pending2) and chunk.startswith(TOOL_DELTA_PREFIX)
                                _is_pending2 and (
                                    (yield sse("tool_pending", {"tool_name": chunk[len(TOOL_PENDING_PREFIX):]})) or True
                                )
                                _is_delta2 and (
                                    (yield sse("tool_call_delta", {
                                        "tool_name": chunk[len(TOOL_DELTA_PREFIX):].split(":", 1)[0],
                                        "chunk": chunk[len(TOOL_DELTA_PREFIX):].split(":", 1)[1] if ":" in chunk[len(TOOL_DELTA_PREFIX):] else "",
                                    })) or True
                                )
                                (not _is_pending2 and not _is_delta2) and (yield sse("text", {"chunk": chunk}))
                            # 将保留的 thinking 合并回 full_response
                            result and setattr(result, 'full_response', _saved_thinking + result.full_response)
                            break
                        except Exception as retry_err:
                            logger.warning(f"Thinking-only retry {_retry2 + 1} failed: {retry_err}")
                break

            # 处理工具调用，包括参数解析错误的情况
            tool_calls_valid = []
            tool_calls_with_error = []
            
            for tc in result.tool_calls:
                try:
                    args = json.loads(tc.arguments)
                    tool_calls_valid.append((tc, args))
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse tool arguments for {tc.name}: {e}")
                    logger.error(f"Raw arguments: {tc.arguments!r}")
                    # 记录错误，让智能体知道参数格式有问题
                    tool_calls_with_error.append((tc, f"Error: Invalid JSON in tool arguments: {e}. Raw arguments: {tc.arguments!r}"))
            
            # 发送 tool 开始事件 (skill_call 或 tool_call)
            for tc, args in tool_calls_valid:
                is_skill = tc.name == "load_skill"
                if not is_skill:
                    all_tool_calls.append({"name": tc.name, "arguments": args})
                
                event_data = (
                    {"skill_name": args.get("skill_name", "")}
                    if is_skill else
                    {"tool_name": tc.name, "arguments": args}
                )
                yield sse(_SSE_START[is_skill], event_data)
            
            # 发送参数解析错误的 tool 开始事件
            for tc, _ in tool_calls_with_error:
                yield sse("tool_call", {"tool_name": tc.name, "arguments": {"error": "JSON parse failed"}})

            # 执行工具调用并追加结果到消息（包含错误处理）
            total_tool_calls = len(tool_calls_valid) + len(tool_calls_with_error)
            logger.info(f"[Tool Round {_round + 1}] {total_tool_calls} tool call(s) ({len(tool_calls_valid)} valid, {len(tool_calls_with_error)} error)")
            await append_tool_round_with_errors(messages, result, tool_manager, ctx, is_anthropic, tool_calls_valid, tool_calls_with_error)

            # 提取工具执行结果（用于 SSE 事件携带 result，供前端显示错误状态）
            _tool_results_map = _extract_tool_results(messages[-(1 + total_tool_calls):] if not is_anthropic else messages[-2:], is_anthropic)

            # 输出工具轮次后新增的消息（assistant tool_calls + tool results）
            _new_msgs = messages[-(1 + total_tool_calls):] if not is_anthropic else messages[-2:]
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

            # 累计 generate_image 工具产生的图片数（用于计费）- 只统计有效调用
            tool_generated_image_count += sum(
                min(max(args.get("n", 1), 1), 4)
                for tc, args in tool_calls_valid
                if tc.name == IMAGE_GEN_TOOL_NAME
            )

            # 追踪已加载的技能 - 只从有效调用中追踪
            tool_skill_loaded = False
            for tc, args in tool_calls_valid:
                (tc.name == "load_skill") and loaded_skills.add(args.get("skill_name", ""))
            # 检测本轮是否有工具Skill被加载（ctx.loaded_tool_skills 已在 _execute_skill 中更新）
            tool_skill_loaded = any(
                tc.name == "load_skill" and args.get("skill_name", "") in TOOL_SKILL_GATE_MAP
                for tc, args in tool_calls_valid
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
            for tc, args in tool_calls_valid:
                is_skill = tc.name == "load_skill"
                is_canvas = tc.name in CANVAS_TOOL_NAMES
                tool_result_str = _tool_results_map.get(tc.id, "")
                event_data = (
                    {"skill_name": args.get("skill_name", "")}
                    if is_skill else
                    {"tool_name": tc.name, "success": True, "result": tool_result_str}
                )
                yield sse(_SSE_END[is_skill], event_data)
                
                # Canvas / edit_image 工具执行后发送画布更新事件，通知前端刷新
                (is_canvas or tc.name == "edit_image") and theater_id and (
                    yield sse("canvas_updated", {"theater_id": theater_id, "action": tc.name})
                )
            
            # 发送错误调用的完成事件
            for tc, _ in tool_calls_with_error:
                yield sse("tool_result", {"tool_name": tc.name, "success": False, "error": "JSON parse failed"})

            # Harness: 连续工具失败熔断
            _all_failed = (len(tool_calls_valid) == 0) and (len(tool_calls_with_error) > 0)
            _consecutive_tool_failures = (_consecutive_tool_failures + 1) * _all_failed
            (_consecutive_tool_failures >= MAX_CONSECUTIVE_TOOL_FAILURES) and (
                yield sse("tool_circuit_breaker", {
                    "consecutive_failures": _consecutive_tool_failures,
                    "max_allowed": MAX_CONSECUTIVE_TOOL_FAILURES,
                })
            )
            # 达到上限，终止工具循环
            (_consecutive_tool_failures >= MAX_CONSECUTIVE_TOOL_FAILURES) and (_ for _ in ()).throw(
                Exception(f"Tool circuit breaker: {_consecutive_tool_failures} consecutive failures")
            )

            # 发送视频任务创建事件（通知前端启动轮询UI）
            for vt in ctx.video_tasks:
                yield sse("video_task_created", vt)
            ctx.video_tasks.clear()

            # 发送音乐任务创建事件（通知前端启动轮询UI）
            for mt in ctx.music_tasks:
                yield sse("music_task_created", mt)
            ctx.music_tasks.clear()

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
    # 调试：检查是否包含思考标签
    has_think_start = '<think>' in result.full_response
    has_think_end = '</think>' in result.full_response
    logger.info(f"Think tags: start={has_think_start}, end={has_think_end}")

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
    # 使用 asyncio.create_task 将持久化操作与 SSE 请求生命周期解耦，
    # 避免客户端断开连接时导致 CancelledError / Connection closed。
    billing_event = {
        "credit_cost": 0,
        "context_usage": {
            "used_tokens": result.input_tokens + result.output_tokens,
            "context_window": agent.context_window,
        },
    }

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

    _persist_state = {"compaction": None}  # mutable container for cross-scope sharing

    async def _persist_message_and_billing():
        """Background task: save message, update stats, deduct credits.

        分两阶段持久化，降低 SQLite 写锁冲突概率：
        - Phase 1: 独立短事务保存 assistant 消息（最关键，必须落库）
        - Phase 2: 统计 / 扣费 / compaction（允许失败，不阻塞用户看到回复）

        Runs independently of the SSE request lifecycle so client disconnect
        cannot cancel the database writes.
        """
        nonlocal billing_event

        # -------- Phase 1: 消息落库（短事务 + 指数退避重试） --------
        _MAX_MSG_RETRIES = 5
        assistant_msg_id = None
        for attempt in range(_MAX_MSG_RETRIES):
            try:
                async with AsyncSessionLocal() as session:
                    assistant_msg = ChatMessage(
                        session_id=session_id, role="assistant", content=final_content,
                    )
                    session.add(assistant_msg)
                    await session.commit()
                    assistant_msg_id = assistant_msg.id
                break
            except Exception as exc:
                is_locked = "database is locked" in str(exc)
                remaining = _MAX_MSG_RETRIES - attempt - 1
                # 非锁错误或耗尽重试 → 放弃
                fatal = (not is_locked) or (remaining <= 0)
                log_fn = logger.error if fatal else logger.warning
                log_fn("Background message save attempt %d/%d failed: %s",
                       attempt + 1, _MAX_MSG_RETRIES, exc)
                if fatal:
                    return
                # 指数退避：0.5s, 1s, 2s, 4s, 8s
                await asyncio.sleep(0.5 * (2 ** attempt))

        # -------- Phase 2: 统计 + 扣费 + compaction（独立事务，失败可容忍） --------
        try:
            async with AsyncSessionLocal() as session:
                # no_autoflush 避免 query 时触发隐式 flush 与其他写者抢锁
                async with session.no_autoflush:
                    from sqlalchemy import func as sa_func
                    s_result = await session.execute(select(ChatSession).filter(ChatSession.id == session_id))
                    s = s_result.scalars().first()
                    s and setattr(s, 'updated_at', sa_func.now())
                    s and setattr(s, 'total_tokens_used', (s.total_tokens_used or 0) + result.input_tokens + result.output_tokens)
                    s and setattr(s, 'last_round_tokens', result.input_tokens + result.output_tokens)

                    # 查询实体并更新统计（映射表驱动，避免 if-else）
                    entity_model_map = {True: Admin, False: User}
                    entity_model = entity_model_map[is_admin]
                    e_result = await session.execute(select(entity_model).filter(entity_model.id == entity_id))
                    entity = e_result.scalars().first()
                    entity and setattr(entity, 'total_input_tokens', (entity.total_input_tokens or 0) + result.input_tokens)
                    entity and setattr(entity, 'total_output_tokens', (entity.total_output_tokens or 0) + result.output_tokens)
                    entity and setattr(entity, 'total_input_chars', (entity.total_input_chars or 0) + input_chars)
                    entity and setattr(entity, 'total_output_chars', (entity.total_output_chars or 0) + len(result.full_response))

                    # 积分扣费（统一原子扣费，User 和 Admin 均走 deduct_credits_atomic）
                    credit_cost, billing_metadata = calculate_credit_cost(result, agent)
                    billing_event["credit_cost"] = round(credit_cost, 6)

                    try:
                        (credit_cost > 0) and await deduct_credits_atomic(
                            user_id=entity_id,
                            cost=credit_cost,
                            session=session,
                            metadata=billing_metadata,
                            transaction_type="consumption",
                            idempotency_key=f"chat:{assistant_msg_id}",
                        )
                    except InsufficientCreditsError:
                        billing_event["insufficient"] = True
                        logger.warning(f"Credits depleted for {'admin' if is_admin else 'user'} {entity_id}. Cost: {credit_cost}")
                    except BalanceFrozenError:
                        billing_event["frozen"] = True
                        logger.warning(f"Balance frozen for {entity_id}")

                    # Post-generation deferred compaction
                    from services.context_compaction import compact_context
                    _persist_state["compaction"] = await compact_context(
                        _messages_snapshot, agent, provider, session, session_id,
                        session_obj=s,
                        actual_total_tokens=result.input_tokens + result.output_tokens,
                    )

                await session.commit()
                logger.info("Message/billing saved successfully (background)")
        except Exception as e:
            # Phase 2 失败不影响消息可见性，仅记录告警
            logger.warning(f"Background stats/billing save failed (message already persisted): {e}")

    # 启动后台保存任务，使用 asyncio.shield 保护任务不被请求取消影响
    try:
        await asyncio.shield(_persist_message_and_billing())
    except asyncio.CancelledError:
        # generator 被取消，但 shield 内的保存操作仍在运行
        logger.warning("SSE generator cancelled during save, persistence continues in background")
        return

    # 发送压缩事件（如果触发了压缩）
    _compaction = _persist_state.get("compaction")
    _compaction and (yield sse("context_compacted", {
        "summary": _compaction[1],
    }))

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
