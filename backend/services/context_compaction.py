"""
Context compaction service — automatic context window management.

Monitors token usage and compacts older messages into LLM-generated summaries
when the context approaches its limit. Preserves system prompt and recent messages.

Memory model:
    [System Prompt (preserved)] + [Compressed Summary] + [Recent Messages (preserved)]
"""
import json
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import ChatSession, LLMProvider

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default configuration (used when no DB config exists)
# ---------------------------------------------------------------------------
_DEFAULTS = {
    "enabled": True,
    "provider_id": "",
    "model": "",
    "compact_ratio": 0.75,
    "reserve_ratio": 0.15,
    "tool_old_threshold": 500,
    "tool_recent_n": 5,
    "tool_recent_threshold": 5000,
    "max_summary_tokens": 1024,
}

SUMMARY_SYSTEM_PROMPT = (
    "You are a conversation summarizer. Condense the following conversation "
    "into a brief summary that preserves key facts, decisions, tool results, "
    "and context needed for continuation.\n"
    "Output a concise summary in the same language as the conversation."
)


@dataclass
class CompactionConfig:
    """Runtime compaction configuration resolved from DB + defaults."""
    enabled: bool
    provider_id: str
    model: str
    compact_ratio: float
    reserve_ratio: float
    tool_old_threshold: int
    tool_recent_n: int
    tool_recent_threshold: int
    max_summary_tokens: int


def load_compaction_config_from_agent(agent: Any) -> CompactionConfig:
    """Load compaction config from agent.compaction_config dict, falling back to defaults."""
    cfg = (getattr(agent, "compaction_config", None) or {})
    return CompactionConfig(**{k: cfg.get(k, v) for k, v in _DEFAULTS.items()})


# ---------------------------------------------------------------------------
# Token estimation (character-based, no external tokenizer dependency)
# ---------------------------------------------------------------------------
def estimate_tokens(text: str) -> int:
    """Rough token estimate: ~1 token per 3 characters for mixed CJK/Latin text."""
    return max(1, len(text) // 3)


def _extract_text(content: Any) -> str:
    """Extract plain text from message content (str or multimodal list)."""
    return (
        content if isinstance(content, str)
        else " ".join(
            p.get("text", "") for p in content if isinstance(p, dict)
        ) if isinstance(content, list)
        else str(content)
    )


def estimate_messages_tokens(messages: list[dict]) -> int:
    """Estimate total tokens across a message list."""
    return sum(
        estimate_tokens(_extract_text(m.get("content", "")))
        + estimate_tokens(m.get("role", ""))
        + 4  # per-message overhead
        for m in messages
    )


# ---------------------------------------------------------------------------
# Tool result truncation
# ---------------------------------------------------------------------------
def truncate_tool_results(
    messages: list[dict],
    recent_n: int = 5,
    old_threshold: int = 500,
    recent_threshold: int = 5000,
) -> None:
    """In-place truncation of tool-role message content to save tokens."""
    tool_indices = [i for i, m in enumerate(messages) if m.get("role") == "tool"]
    total = len(tool_indices)
    recent_start = max(0, total - recent_n)

    for rank, idx in enumerate(tool_indices):
        content = messages[idx].get("content", "")
        text = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
        threshold = recent_threshold if rank >= recent_start else old_threshold
        (len(text) > threshold) and messages[idx].__setitem__(
            "content", text[:threshold] + "\n...[truncated]"
        )


# ---------------------------------------------------------------------------
# Compaction decision
# ---------------------------------------------------------------------------
def check_compaction_needed(
    messages: list[dict], context_window: int, compact_ratio: float
) -> tuple[bool, int]:
    """Return (should_compact, estimated_tokens)."""
    threshold = int(context_window * compact_ratio)
    current = estimate_messages_tokens(messages)
    return current > threshold, current


def split_messages_for_compaction(
    messages: list[dict], context_window: int, reserve_ratio: float
) -> tuple[list[dict], list[dict]]:
    """Split messages into (to_compact, to_keep).

    Walks backwards from the end, accumulating tokens until we reach
    reserve_ratio * context_window, then everything before that is compacted.
    The first message (system prompt) is always excluded from compaction.
    """
    reserve_budget = int(context_window * reserve_ratio)
    acc = 0
    split_idx = len(messages)

    for i in range(len(messages) - 1, 0, -1):  # skip index 0 (system prompt)
        msg_tokens = estimate_tokens(_extract_text(messages[i].get("content", ""))) + 4
        acc += msg_tokens
        if acc > reserve_budget:
            split_idx = i + 1
            break

    # to_compact = messages[1:split_idx], to_keep = messages[split_idx:]
    # (messages[0] = system prompt, always preserved separately)
    return messages[1:split_idx], messages[split_idx:]


# ---------------------------------------------------------------------------
# LLM summary generation
# ---------------------------------------------------------------------------
def _format_messages_for_summary(messages: list[dict]) -> str:
    """Format message dicts into readable text for the summariser."""
    lines = []
    for m in messages:
        role = m.get("role", "unknown").upper()
        text = _extract_text(m.get("content", ""))[:2000]  # cap per-message length
        lines.append(f"[{role}]: {text}")
    return "\n".join(lines)


async def generate_summary(
    messages_to_compact: list[dict],
    previous_summary: str | None,
    provider: LLMProvider,
    model: str,
    max_tokens: int = 1024,
) -> str:
    """Call LLM (non-streaming) to produce a concise summary of old messages."""
    from openai import AsyncOpenAI
    from services.llm_stream import DEFAULT_BASE_URLS

    base_url = provider.base_url or DEFAULT_BASE_URLS.get(provider.provider_type.lower())
    client = AsyncOpenAI(api_key=provider.api_key, base_url=base_url)

    user_content_parts = []
    previous_summary and user_content_parts.append(
        f"## Previous Conversation Summary\n{previous_summary}\n"
    )
    user_content_parts.append(
        f"## Messages to Summarize\n{_format_messages_for_summary(messages_to_compact)}"
    )

    try:
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
                {"role": "user", "content": "\n\n".join(user_content_parts)},
            ],
            temperature=0.3,
            max_tokens=max_tokens,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception as e:
        logger.error(f"Summary generation failed: {e}")
        return previous_summary or ""


# ---------------------------------------------------------------------------
# Main compaction entry point
# ---------------------------------------------------------------------------
async def compact_context(
    messages: list[dict],
    agent: Any,
    provider: LLMProvider,
    db: AsyncSession,
    session_id: str,
    session_obj: Any = None,
) -> tuple[list[dict], str | None] | None:
    """Run full compaction pipeline. Returns (new_messages, summary) or None if no compaction needed.

    Args:
        session_obj: Pre-loaded session object (ChatSession or AdminDebugSession).
                     If None, will be loaded from ChatSession table.
    """
    # Load configuration from agent (or use defaults)
    cfg = load_compaction_config_from_agent(agent)

    # Always truncate tool results first (cheap, runs even when compaction disabled)
    truncate_tool_results(
        messages,
        recent_n=cfg.tool_recent_n,
        old_threshold=cfg.tool_old_threshold,
        recent_threshold=cfg.tool_recent_threshold,
    )

    # Skip full compaction when disabled
    if not cfg.enabled:
        return None

    needed, current_tokens = check_compaction_needed(
        messages, agent.context_window, cfg.compact_ratio
    )
    if not needed:
        return None

    logger.info(
        f"[Compaction] Triggered: ~{current_tokens} tokens vs window {agent.context_window} "
        f"(threshold {int(agent.context_window * cfg.compact_ratio)})"
    )

    to_compact, to_keep = split_messages_for_compaction(
        messages, agent.context_window, cfg.reserve_ratio
    )

    if not to_compact:
        return None

    # Load session if not provided
    chat_session = session_obj
    if not chat_session:
        session_result = await db.execute(
            select(ChatSession).filter(ChatSession.id == session_id)
        )
        chat_session = session_result.scalars().first()
    previous_summary = chat_session.compressed_summary if chat_session else None

    # Resolve summary LLM: use configured provider/model or fall back to agent's own
    summary_provider = provider
    summary_model = agent.model
    if cfg.provider_id and cfg.model:
        custom_result = await db.execute(
            select(LLMProvider).filter(LLMProvider.id == cfg.provider_id)
        )
        custom_provider = custom_result.scalars().first()
        if custom_provider and custom_provider.is_active:
            summary_provider = custom_provider
            summary_model = cfg.model

    summary = await generate_summary(
        to_compact, previous_summary, summary_provider, summary_model,
        max_tokens=cfg.max_summary_tokens,
    )
    logger.info(f"[Compaction] Summary generated: {len(summary)} chars from {len(to_compact)} messages")

    # Rebuild messages: [system_prompt (with summary)] + [recent messages]
    system_msg = messages[0]
    summary_block = f"\n\n# Previous Conversation Summary\n{summary}"
    sys_content = system_msg.get("content", "")
    _marker = "\n\n# Previous Conversation Summary\n"
    (_marker in sys_content) and (sys_content := sys_content[:sys_content.index(_marker)])
    system_msg["content"] = sys_content + summary_block

    new_messages = [system_msg] + to_keep

    # Persist to DB
    if chat_session:
        chat_session.compressed_summary = summary
        existing_skip = int(chat_session.compressed_before_id or "0")
        chat_session.compressed_before_id = str(existing_skip + len(to_compact))
        await db.flush()

    logger.info(
        f"[Compaction] Done: {len(to_compact)} messages compacted, "
        f"{len(new_messages)} messages remaining"
    )

    return new_messages, summary
