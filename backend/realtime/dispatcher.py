"""User event dispatcher: 跨实例 Pub/Sub 监听 + 本地路由。

启动：在 startup.lifespan 后台任务中调用 start_user_event_listener()
关闭：通过取消该协程任务自然退出
"""
from __future__ import annotations

import logging
from typing import Any

from cache.pubsub import (
    CHANNEL_USER_EVENTS,
    publish_user_event,
    subscribe,
)
from realtime.manager import manager

logger = logging.getLogger(__name__)


async def push_to_user(user_id: str, event_type: str, data: Any) -> None:
    """业务侧推送入口：发布到总线，由各实例的 listener 路由到本地连接。

    不再本地直推，避免与 listener 双发。有 Redis 时路径统一，
    无 Redis 时 publish 返回 0 并静默（退化为单实例不可跨点推送）。
    """
    sent = await publish_user_event(user_id, event_type, data)
    # 当未发心跳总线时（sent==0 且无 Redis）退化本地推送，保证开发环境仍可用
    sent or await manager.send_to_user(user_id, {"type": event_type, "data": data})


async def start_user_event_listener() -> None:
    """常驻订阅 `kf:user_events` 总线，把消息分发给本地 WS。

    与 push_to_user 配合使用：业务侧只需调用 publish_user_event/push_to_user。
    """
    logger.info("user-event listener started channel=%s", CHANNEL_USER_EVENTS)
    async for _channel, payload in subscribe(CHANNEL_USER_EVENTS):
        try:
            uid = (payload or {}).get("user_id")
            if not uid:
                continue
            event_type = (payload or {}).get("type", "message")
            data = (payload or {}).get("data")
            await manager.send_to_user(uid, {"type": event_type, "data": data})
        except Exception as exc:  # noqa: BLE001
            logger.warning("user-event dispatch error: %s", exc)
