"""WebSocket gateway endpoint with JWT auth + heartbeat.

握手流程：
1. 客户端连接 /api/ws?token=<jwt>
2. 解码 + 黑名单校验失败 → 1008
3. 加入 ConnectionManager
4. 循环接收任意消息（视为客户端心跳/订阅意图，当前简化为 echo "ack"）
5. 任何异常关闭连接并清理
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect, status

from auth import decode_token_checked
from realtime.manager import manager

logger = logging.getLogger(__name__)

# 服务端主动 ping 间隔（秒）
_PING_INTERVAL = 25.0


async def _authenticate(ws: WebSocket) -> Optional[str]:
    """从 query string 提取 token 并解析出 user_id；失败返回 None。"""
    token = ws.query_params.get("token") or ""
    if not token:
        return None
    try:
        payload = await decode_token_checked(token)
    except Exception as exc:  # noqa: BLE001
        logger.debug("WS auth decode error: %s", exc)
        return None
    sub = payload.get("sub")
    return sub if (sub and payload.get("type") == "access") else None


async def _ping_loop(ws: WebSocket) -> None:
    """周期 ping，断连自动抛出退出协程。"""
    while True:
        await asyncio.sleep(_PING_INTERVAL)
        await ws.send_text('{"type":"ping"}')


async def websocket_endpoint(ws: WebSocket) -> None:
    user_id = await _authenticate(ws)
    if not user_id:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(user_id, ws)
    ping_task = asyncio.create_task(_ping_loop(ws))
    try:
        while True:
            # 客户端可发送任意 JSON 作为 ack/订阅意图，当前简化为读取后忽略
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.warning("WS loop error user=%s: %s", user_id, exc)
    finally:
        ping_task.cancel()
        try:
            await ping_task
        except (asyncio.CancelledError, Exception):
            pass
        await manager.disconnect(user_id, ws)
