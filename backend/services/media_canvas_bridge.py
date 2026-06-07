"""
media_canvas_bridge — 媒体生成工具到画布节点的自动桥接。

当对话处于画布上下文（theater_id 存在）时，媒体工具执行后自动创建对应类型的画布节点：
- 图像：同步生成后即时创建完整 image 节点
- 视频/音频：异步任务提交后创建占位节点（_generating: true），任务完成后回填真实 URL
"""
from __future__ import annotations

import logging
import uuid as _uuid
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import TheaterNode

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# Default node sizes (aligned with canvas provider)
_DEFAULT_NODE_WIDTH = 420
_DEFAULT_NODE_HEIGHT = 300


async def _auto_position(theater_id: str, db: AsyncSession) -> tuple[float, float]:
    """Calculate auto position using the canvas provider's algorithm."""
    from services.tool_manager.providers.canvas import _calculate_auto_position
    return await _calculate_auto_position(theater_id, db)


async def create_image_nodes(
    image_urls: list[str],
    theater_id: str,
    prompt: str,
    db: AsyncSession,
) -> list[str]:
    """为生成的图像创建画布 image 节点，返回创建的 node_id 列表。"""
    node_ids: list[str] = []

    for idx, url in enumerate(image_urls):
        pos_x, pos_y = await _auto_position(theater_id, db)
        name = f"AI Generated {idx + 1}" if len(image_urls) > 1 else "AI Generated"
        data = {
            "name": name,
            "description": (prompt[:80] + "...") if len(prompt) > 80 else prompt,
            "imageUrl": url,
            "fitMode": "cover",
        }

        node = TheaterNode(
            id=str(_uuid.uuid4()),
            theater_id=theater_id,
            node_type="image",
            position_x=pos_x,
            position_y=pos_y,
            width=_DEFAULT_NODE_WIDTH,
            height=_DEFAULT_NODE_HEIGHT,
            z_index=0,
            data=data,
        )
        db.add(node)
        await db.commit()
        await db.refresh(node)
        node_ids.append(node.id)
        logger.info("Bridge: created image node %s in theater %s", node.id, theater_id)

    return node_ids


async def create_placeholder_node(
    node_type: str,
    name: str,
    prompt: str,
    theater_id: str,
    db: AsyncSession,
) -> str:
    """创建占位节点（视频/音频生成中），返回 node_id。

    node_type: "video" | "audio"
    占位节点的 data 中包含 _generating: true 标记，前端据此显示加载状态。
    """
    pos_x, pos_y = await _auto_position(theater_id, db)

    _data_builders = {
        "video": lambda: {
            "name": name,
            "description": (prompt[:80] + "...") if len(prompt) > 80 else prompt,
            "videoUrl": "",
            "fitMode": "cover",
            "_generating": True,
        },
        "audio": lambda: {
            "name": name,
            "description": (prompt[:80] + "...") if len(prompt) > 80 else prompt,
            "audioUrl": "",
            "lyrics": "",
            "_generating": True,
        },
    }
    data = _data_builders.get(node_type, _data_builders["video"])()

    node = TheaterNode(
        id=str(_uuid.uuid4()),
        theater_id=theater_id,
        node_type=node_type,
        position_x=pos_x,
        position_y=pos_y,
        width=_DEFAULT_NODE_WIDTH,
        height=_DEFAULT_NODE_HEIGHT,
        z_index=0,
        data=data,
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)
    logger.info("Bridge: created placeholder %s node %s in theater %s", node_type, node.id, theater_id)
    return node.id


async def update_placeholder_node(
    node_id: str,
    updates: dict,
    db: AsyncSession,
) -> bool:
    """任务完成后更新占位节点的数据，移除 _generating 标记。

    updates 示例：
      视频: {"videoUrl": "/api/media/...", "name": "..."}
      音频: {"audioUrl": "/api/media/...", "lyrics": "..."}

    返回是否成功更新。
    """
    result = await db.execute(
        select(TheaterNode).where(TheaterNode.id == node_id)
    )
    node = result.scalar_one_or_none()
    if not node:
        logger.warning("Bridge: placeholder node %s not found for update", node_id)
        return False

    current_data = dict(node.data or {})
    current_data.update(updates)
    current_data.pop("_generating", None)
    node.data = current_data
    await db.commit()
    logger.info("Bridge: updated placeholder node %s with media URL", node_id)
    return True
