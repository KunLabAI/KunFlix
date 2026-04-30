"""Lightweight Pub/Sub helpers built on shared Redis client.

约定：
- channel 命名统一以 `kf:` 开头：
    kf:invalidate:{namespace}    -> 缓存失效广播
    kf:user:{uid}:{topic}        -> 用户级实时事件（视频/任务/通知）
- payload 统一 JSON 序列化（utf-8）
- subscribe() 返回异步生成器；外层 task 退出即取消订阅
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncGenerator

from cache.client import get_redis

logger = logging.getLogger(__name__)

CHANNEL_INVALIDATE = "kf:invalidate"
CHANNEL_USER = "kf:user"
CHANNEL_USER_EVENTS = "kf:user_events"  # 统一的用户事件总线（带 user_id 路由）


def channel_invalidate(namespace: str) -> str:
    return f"{CHANNEL_INVALIDATE}:{namespace}"


def channel_user(user_id: str, topic: str) -> str:
    return f"{CHANNEL_USER}:{user_id}:{topic}"


async def publish_user_event(user_id: str, event_type: str, data: Any) -> int:
    """发布一条用户级事件到统一总线。质量以达：多实例 WS 网关都能收到。"""
    return await publish(CHANNEL_USER_EVENTS, {"user_id": user_id, "type": event_type, "data": data})


async def publish(channel: str, payload: Any) -> int:
    """发布消息；未连接 Redis 时静默返回 0。"""
    client = get_redis()
    if client is None:
        return 0
    try:
        data = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        return int(await client.publish(channel, data))
    except Exception as exc:  # noqa: BLE001
        logger.warning("PubSub publish error channel=%s: %s", channel, exc)
        return 0


async def invalidate(namespace: str, key: str) -> None:
    """便捷封装：发布缓存失效事件。"""
    await publish(channel_invalidate(namespace), {"key": key})


async def subscribe(*channels: str) -> AsyncGenerator[tuple[str, Any], None]:
    """订阅一组频道；yield (channel, payload)。
    无 Redis 时立即返回（生成器为空）。
    """
    client = get_redis()
    if client is None or not channels:
        return
    pubsub = client.pubsub()
    try:
        await pubsub.subscribe(*channels)
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=30)
            if msg is None:
                # heartbeat: 让出控制权，便于上层取消
                await asyncio.sleep(0)
                continue
            ch_raw = msg.get("channel")
            data_raw = msg.get("data")
            ch = ch_raw.decode("utf-8") if isinstance(ch_raw, (bytes, bytearray)) else str(ch_raw or "")
            payload: Any
            try:
                payload = json.loads(
                    data_raw.decode("utf-8") if isinstance(data_raw, (bytes, bytearray)) else str(data_raw)
                )
            except Exception:  # noqa: BLE001
                payload = data_raw
            yield ch, payload
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning("PubSub subscribe error channels=%s: %s", channels, exc)
    finally:
        try:
            await pubsub.unsubscribe(*channels)
            await pubsub.aclose()
        except Exception as exc:  # noqa: BLE001
            logger.debug("PubSub close error: %s", exc)


__all__ = [
    "publish",
    "subscribe",
    "invalidate",
    "publish_user_event",
    "channel_invalidate",
    "channel_user",
    "CHANNEL_INVALIDATE",
    "CHANNEL_USER",
    "CHANNEL_USER_EVENTS",
]
