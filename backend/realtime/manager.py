"""WebSocket connection registry per process.

关键约束：
- 每个 user_id 可有多个连接（多端登录）；广播向该 user 时全部触达
- 写失败立即剔除，避免半死连接占用资源
- 全部接口 async，避免在同步路径中竞争事件循环
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """进程内 WebSocket 连接注册表。"""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._connections.setdefault(user_id, set()).add(ws)
        logger.debug("WS connect user=%s total=%d", user_id, self.size_for(user_id))

    async def disconnect(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            bucket = self._connections.get(user_id)
            bucket and bucket.discard(ws)
            (bucket is not None and not bucket) and self._connections.pop(user_id, None)

    def size_for(self, user_id: str) -> int:
        return len(self._connections.get(user_id, ()))

    def total(self) -> int:
        return sum(len(s) for s in self._connections.values())

    async def send_to_user(self, user_id: str, payload: Any) -> int:
        """向指定 user 的所有本地连接广播；返回成功条数。"""
        bucket = list(self._connections.get(user_id, ()))
        if not bucket:
            return 0
        text = json.dumps(payload, ensure_ascii=False, default=str)
        ok = 0
        dead: list[WebSocket] = []
        for ws in bucket:
            try:
                await ws.send_text(text)
                ok += 1
            except Exception as exc:  # noqa: BLE001
                logger.debug("WS send failed user=%s: %s", user_id, exc)
                dead.append(ws)
        # 异步剔除死连接
        for ws in dead:
            await self.disconnect(user_id, ws)
        return ok


# 单例
manager = ConnectionManager()
