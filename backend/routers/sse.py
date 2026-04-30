"""通用 SSE 可恢复流路由。

客户端场景：SSE 连接意外中断后，带 `Last-Event-ID` 头调用
`GET /api/sse/resume/{scope}/{ref_id}`，服务端从 Redis Stream 增量回放剩余事件。

Stream key 规范：`kf:sse:{user_id}:{scope}:{ref_id}`
- scope：业务域（orchestrate / chat / image 等）
- ref_id：流引用 id（首次响应通过 `X-Stream-Id` 头下发）

未配置 REDIS_URL 时，`read_events` 返回空列表，端点仍返回 200 但无数据。
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import StreamingResponse

from auth import get_current_active_user
from config import settings
from models import User
from ratelimit import limiter
from realtime import read_events, stream_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sse", tags=["sse"])


@router.get("/resume/{scope}/{ref_id}")
@limiter.limit("30/minute")
async def resume_sse(
    request: Request,
    scope: str,
    ref_id: str,
    last_event_id: Optional[str] = Header(default=None, alias="Last-Event-ID"),
    current_user: User = Depends(get_current_active_user),
):
    """按 `Last-Event-ID` 从 Redis Stream 增量回放 SSE 事件。

    scope 不做强校验：key 中已包含 user_id 且非本人的 ref_id 自然获取不到。
    """
    key = stream_key(current_user.id, scope, ref_id)
    last_id = (last_event_id or "0").strip() or "0"
    frames = await read_events(key, last_id=last_id, count=settings.SSE_RESUME_MAX_COUNT)

    async def gen():
        for frame in frames:
            yield frame
        # 结束标记帧，让客户端感知回放完成
        yield "event: resume_end\ndata: {}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Stream-Id": ref_id,
        },
    )
