"""SSE 可恢复流 —— 基于 Redis Stream 的增量重放

设计要点：
- stream_key 规范：`kf:sse:{user_id}:{scope}:{ref_id}`
- `sse_tee(stream_key, gen)` 异步生成器包装器：边 yield 给客户端，边 XADD 到 Redis Stream
- `read_events(stream_key, last_id)` 使用 XRANGE 按 last-event-id 增量拉取，供重连端点使用
- 无 Redis 时全部静默降级为 no-op / 空列表，调用方无需额外分支
- 所有 Stream 通过 XADD MAXLEN ~ N 控制长度，并在首次写入设置 TTL
- 为避免 pickle 或复杂协议，event 以 {"event": str, "data": str, "id": str} 的 bytes 字段写入
"""
from __future__ import annotations

import logging
import uuid
from typing import AsyncIterator, Optional

from config import settings
from cache.client import get_redis

logger = logging.getLogger(__name__)

# 固定字段名（bytes）
_F_EVENT = b"event"
_F_DATA = b"data"
_F_SSE_ID = b"sse_id"


def stream_key(user_id: str, scope: str, ref_id: str) -> str:
    """构造 Redis Stream key。"""
    return f"kf:sse:{user_id}:{scope}:{ref_id}"


def new_stream_id() -> str:
    """生成新的 SSE 流引用 id（给客户端作为 X-Stream-Id 使用）。"""
    return uuid.uuid4().hex


async def append_event(
    key: str,
    event: Optional[str],
    data: str,
    *,
    sse_id: Optional[str] = None,
    maxlen: Optional[int] = None,
    ttl_sec: Optional[int] = None,
) -> None:
    """向 Redis Stream 追加一条事件；无 Redis 时 no-op。"""
    redis = get_redis()
    if redis is None:
        return
    fields: dict = {_F_DATA: data.encode("utf-8")}
    event and fields.update({_F_EVENT: event.encode("utf-8")})
    sse_id and fields.update({_F_SSE_ID: sse_id.encode("utf-8")})
    maxlen_eff = maxlen or settings.SSE_STREAM_MAXLEN
    ttl_eff = ttl_sec or settings.SSE_STREAM_TTL_SEC
    try:
        await redis.xadd(key, fields, maxlen=maxlen_eff, approximate=True)
        ttl_eff and await redis.expire(key, ttl_eff)
    except Exception as exc:  # noqa: BLE001
        logger.warning("SSE stream append failed key=%s err=%s", key, exc)


def _format_sse(event: Optional[str], data: str, sse_id: Optional[str]) -> str:
    """按 SSE 协议格式化一条文本帧。"""
    parts = []
    sse_id and parts.append(f"id: {sse_id}")
    event and parts.append(f"event: {event}")
    # data 可能跨行，按 SSE 规范每行加 "data: "
    for line in (data or "").splitlines() or [""]:
        parts.append(f"data: {line}")
    parts.append("")
    parts.append("")
    return "\n".join(parts)


async def read_events(
    key: str,
    last_id: str = "0",
    count: int = 500,
) -> list[str]:
    """按 last-event-id 增量读取并格式化为 SSE 文本列表；无 Redis 时返回空列表。"""
    redis = get_redis()
    if redis is None:
        return []
    try:
        # XRANGE key (last_id+1] +，使用 "(" 表示开区间
        start = f"({last_id}" if last_id and last_id != "0" else "-"
        entries = await redis.xrange(key, min=start, max="+", count=count)
    except Exception as exc:  # noqa: BLE001
        logger.warning("SSE stream read failed key=%s err=%s", key, exc)
        return []
    out: list[str] = []
    for entry_id, fields in entries:
        entry_id_s = entry_id.decode() if isinstance(entry_id, bytes) else str(entry_id)
        event = fields.get(_F_EVENT)
        data = fields.get(_F_DATA, b"")
        event_s = event.decode("utf-8") if isinstance(event, bytes) else event
        data_s = data.decode("utf-8") if isinstance(data, bytes) else (data or "")
        out.append(_format_sse(event_s, data_s, entry_id_s))
    return out


def _parse_sse_chunk(chunk: str) -> tuple[Optional[str], str]:
    """从已组装的 SSE 文本帧提取 (event, data) 用于回写 Stream。

    orchestrate.execute 产出的帧格式为：
        event: xxx\ndata: {...}\n\n
    若不含 event 行，返回 (None, raw_data)
    """
    event: Optional[str] = None
    data_lines: list[str] = []
    for raw in chunk.splitlines():
        raw.startswith("event:") and (event := raw[6:].strip()) is not None  # noqa: E501
        raw.startswith("data:") and data_lines.append(raw[5:].lstrip())
    return event, "\n".join(data_lines)


async def sse_tee(key: str, gen: AsyncIterator[str]) -> AsyncIterator[str]:
    """包装 SSE 异步生成器：边 yield 边落 Redis Stream。

    降级策略：get_redis() 返回 None 时直接透传，不引入额外开销。
    """
    redis = get_redis()
    tee_enabled = redis is not None
    async for chunk in gen:
        yield chunk
        tee_enabled and await _safe_append_chunk(key, chunk)


async def _safe_append_chunk(key: str, chunk: str) -> None:
    event, data = _parse_sse_chunk(chunk)
    # 空帧（心跳 "\n\n"）不入流
    (event or data) and await append_event(key, event, data)


__all__ = [
    "stream_key",
    "new_stream_id",
    "append_event",
    "read_events",
    "sse_tee",
]
