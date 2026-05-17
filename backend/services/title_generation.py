"""
Title generation service — automatic chat title generation from early conversation.

Generates a concise title (default ≤20 chars) by feeding the first N user/assistant
rounds (configurable, default 1 round = 2 messages) to an LLM. Only runs once per
session: when total message count reaches N*2 and the current title is still a
default placeholder.

Configuration is per-agent (Agent.title_gen_config), mirroring context_compaction.
"""
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import ChatMessage, LLMProvider

logger = logging.getLogger(__name__)


def _sanitize_for_log(value: Any) -> str:
    """Sanitize untrusted values before logging to prevent log injection."""
    text = str(value)
    text = text.replace("\r", "").replace("\n", "")
    return "".join(ch if ch.isprintable() else "?" for ch in text)

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
_DEFAULTS = {
    "enabled": False,       # 默认关闭，由管理员主动开启
    "provider_id": "",
    "model": "",
    "max_length": 20,
    "trigger_rounds": 1,    # 触发轮数，范围 1-10，默认第 1 轮对话结束后触发
}

TITLE_SYSTEM_PROMPT = (
    "你是对话主题概括专家。请基于给定的用户与 AI 的初期对话内容，"
    "生成一个不超过 {max_length} 个字符的简洁、准确、信息密度高的标题，"
    "概括对话的核心主题或用户意图。\n\n"
    "## 严格要求\n"
    "- 只返回标题文本，不要任何解释、前缀、引号、句号、表情或 Markdown 标记\n"
    "- 不要使用「关于...」「讨论...」等冗余开头\n"
    "- 字符数严格 ≤ {max_length}（中文字符与英文字符均按 1 计）\n"
    "- 使用对话所用的主要语言\n"
    "- 优先抓取具体主题、对象、动作；其次概括情绪或风格\n"
)

# 默认标题识别：仅当 title 仍是这些预设默认值时，才覆盖为 AI 生成标题
_DEFAULT_TITLE_EXACT = {"New Chat", "Debug Chat", "未命名对话", "未命名剧场"}
_DEFAULT_TITLE_PREFIXES = ("画布对话 - ", "Canvas Chat - ", "Chat - ")


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
@dataclass
class TitleGenConfig:
    enabled: bool
    provider_id: str
    model: str
    max_length: int
    trigger_rounds: int


def load_title_gen_config_from_agent(agent: Any) -> TitleGenConfig:
    """Load title-gen config from agent.title_gen_config dict, with safe defaults."""
    cfg = (getattr(agent, "title_gen_config", None) or {})
    merged = {k: cfg.get(k, v) for k, v in _DEFAULTS.items()}
    # 防御性归一化
    merged["max_length"] = max(8, min(50, int(merged.get("max_length") or 20)))
    merged["trigger_rounds"] = max(1, min(10, int(merged.get("trigger_rounds") or 1)))
    return TitleGenConfig(**merged)


def is_default_title(title: str | None) -> bool:
    """判定 title 是否仍是系统默认占位，从而决定是否可被 AI 生成结果覆盖。"""
    return (
        not title
        or title in _DEFAULT_TITLE_EXACT
        or any(title.startswith(p) for p in _DEFAULT_TITLE_PREFIXES)
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _extract_text(content: Any) -> str:
    """Extract plain text from message content (str / multimodal list / json-string)."""
    return (
        content if isinstance(content, str)
        else " ".join(
            p.get("text", "") for p in content if isinstance(p, dict)
        ) if isinstance(content, list)
        else str(content)
    )


def _format_messages_for_title(messages: list[dict]) -> str:
    """Format the first N rounds of messages into a compact prompt for the title model."""
    lines = []
    for m in messages:
        role = (m.get("role") or "user").upper()
        # 每条最多 800 字，避免一两条超长消息占满 prompt
        text = _extract_text(m.get("content", ""))[:800]
        lines.append(f"[{role}]: {text}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# LLM call (provider_type 分发，避免 if-else)
# ---------------------------------------------------------------------------
async def _call_openai_compat(
    provider: LLMProvider, model: str, system_text: str, user_text: str, max_tokens: int
) -> str:
    """OpenAI / DeepSeek / xAI / Ark / Doubao 等 OpenAI 兼容接口。

    注意：推理模型（DeepSeek-V4 / o1 系列等）的 max_tokens 同时限制思考与输出，
    若给得太小会导致 content 为空。这里统一给到一个保守上限。
    """
    from openai import AsyncOpenAI
    from services.llm_stream import DEFAULT_BASE_URLS

    base_url = provider.base_url or DEFAULT_BASE_URLS.get(
        (provider.provider_type or "").lower()
    )
    client = AsyncOpenAI(api_key=provider.api_key, base_url=base_url)
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_text},
            {"role": "user", "content": user_text},
        ],
        temperature=0.3,
        max_tokens=max_tokens,
    )
    msg = resp.choices[0].message
    # 推理模型可能把答案放在 reasoning_content；优先 content，回退 reasoning_content
    return (getattr(msg, "content", None) or getattr(msg, "reasoning_content", None) or "").strip()


async def _call_gemini(
    provider: LLMProvider, model: str, system_text: str, user_text: str, max_tokens: int
) -> str:
    """Gemini 原生 SDK 调用（不能走 OpenAI 兼容接口）。"""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=provider.api_key)
    resp = await client.aio.models.generate_content(
        model=model,
        contents=user_text,
        config=types.GenerateContentConfig(
            system_instruction=system_text,
            temperature=0.3,
            max_output_tokens=max_tokens,
        ),
    )
    return (getattr(resp, "text", None) or "").strip()


# provider_type → 调用实现（表驱动分发，未命中默认走 OpenAI 兼容接口）
_TITLE_DISPATCH = {
    "gemini": _call_gemini,
}


async def generate_title(
    messages: list[dict],
    provider: LLMProvider,
    model: str,
    max_length: int = 20,
) -> str:
    """Call LLM to generate a short title. Returns trimmed/truncated string or ''."""
    system_text = TITLE_SYSTEM_PROMPT.format(max_length=max_length)
    user_text = (
        f"## 初期对话内容\n{_format_messages_for_title(messages)}\n\n"
        f"请输出一个不超过 {max_length} 字符的标题（仅文本，无任何附加内容）。"
    )

    pt = (provider.provider_type or "").lower()
    caller = _TITLE_DISPATCH.get(pt, _call_openai_compat)
    # max_tokens 给 512：兼容推理模型（思考占大头），最终输出仍由 max_length 截断
    raw = await caller(provider, model, system_text, user_text, 512)
    logger.info(f"[TitleGen] LLM raw response (provider_type={pt}, model={model}): {raw!r}")

    # 清理常见多余字符：首尾引号、句末标点、换行
    cleaned = raw.strip().strip('"“”\'‘’「」『』`')
    cleaned = cleaned.splitlines()[0].strip() if cleaned else ""
    # 兜底截断
    final = cleaned[:max_length]
    logger.info(f"[TitleGen] cleaned title: {final!r} (len={len(final)})")
    return final


# ---------------------------------------------------------------------------
# Main entry
# ---------------------------------------------------------------------------
async def maybe_generate_title(
    agent: Any,
    provider: LLMProvider,
    db: AsyncSession,
    session_id: str,
    session_obj: Any = None,
) -> str | None:
    """决策 + 调用 + 持久化。返回新标题；不需要 / 失败时返回 None。

    判定条件（全部满足才执行）：
    1. agent.title_gen_config.enabled = True
    2. session_obj 存在且 title 仍为系统默认值（避免覆盖手动设置）
    3. 当前会话消息总数恰好 == cfg.trigger_rounds * 2
       （即刚完成第 N 轮 assistant 持久化，N 可配范围 1-10）
    """
    cfg = load_title_gen_config_from_agent(agent)
    safe_session_id = _sanitize_for_log(session_id)
    if not cfg.enabled:
        logger.debug(f"[TitleGen] session={safe_session_id} skipped: enabled=False")
        return None

    cur_title = getattr(session_obj, "title", None) if session_obj else None
    if not session_obj or not is_default_title(cur_title):
        logger.info(
            f"[TitleGen] session={safe_session_id} skipped: "
            f"session_obj={bool(session_obj)} title={cur_title!r} (非默认占位不覆盖)"
        )
        return None

    expected = cfg.trigger_rounds * 2
    msg_count = await db.scalar(
        select(func.count(ChatMessage.id)).filter(ChatMessage.session_id == session_id)
    )
    if msg_count != expected:
        logger.info(
            f"[TitleGen] session={safe_session_id} skipped: "
            f"msg_count={msg_count} != expected={expected} "
            f"(trigger_rounds={cfg.trigger_rounds})"
        )
        return None

    logger.info(
        f"[TitleGen] session={safe_session_id} triggering: "
        f"trigger_rounds={cfg.trigger_rounds} msg_count={msg_count}"
    )

    # 取前 N*2 条消息（user → assistant 交替）
    rows_result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
        .limit(expected)
    )
    rows = rows_result.scalars().all()
    if len(rows) < expected:
        logger.warning(
            f"[TitleGen] session={safe_session_id} aborted: rows={len(rows)} < expected={expected}"
        )
        return None

    msgs = [{"role": r.role, "content": r.content} for r in rows]

    # 解析使用的 provider/model：优先 cfg 指定，否则回退 agent 自身
    title_provider, title_model = provider, agent.model
    use_custom = bool(cfg.provider_id and cfg.model)
    custom = (await db.execute(
        select(LLMProvider).filter(LLMProvider.id == cfg.provider_id)
    )).scalars().first() if use_custom else None
    is_custom_active = bool(custom and custom.is_active)
    title_provider = custom if is_custom_active else provider
    title_model = cfg.model if is_custom_active else agent.model

    try:
        title = await generate_title(msgs, title_provider, title_model, cfg.max_length)
    except Exception as e:
        logger.warning(f"[TitleGen] generation failed: {e}")
        return None

    if not title:
        logger.warning(f"[TitleGen] session={safe_session_id} got empty title from LLM, skip")
        return None

    session_obj.title = title
    await db.flush()
    logger.info(f"[TitleGen] session={safe_session_id} title generated: {title!r}")
    return title
