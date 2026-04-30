"""Realtime gateway: WebSocket connection management + cross-instance fan-out.

设计要点：
- 单实例内：`ConnectionManager` 维护 user_id -> set[WebSocket]，O(1) 路由
- 多实例：所有节点订阅同一个 Pub/Sub 总线 `kf:user_events`，本地命中即推送
- 鉴权：WebSocket 握手时通过 query string `?token=<jwt>` 携带，复用 decode_token_checked
- 心跳：客户端可发送任意文本作为 ping；服务端默认每 25s 主动 ping 检测断连
- 失活清理：disconnect 时回收空集合，避免 user_id 内存泄漏
"""

from realtime.manager import ConnectionManager, manager
from realtime.gateway import websocket_endpoint
from realtime.dispatcher import start_user_event_listener, push_to_user
from realtime.resume import (
    stream_key,
    new_stream_id,
    append_event,
    read_events,
    sse_tee,
)

__all__ = [
    "ConnectionManager",
    "manager",
    "websocket_endpoint",
    "start_user_event_listener",
    "push_to_user",
    "stream_key",
    "new_stream_id",
    "append_event",
    "read_events",
    "sse_tee",
]
