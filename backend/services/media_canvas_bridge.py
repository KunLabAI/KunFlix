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

from database import safe_commit
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
        await safe_commit(db)
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
    await safe_commit(db)
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
    await safe_commit(db)
    logger.info("Bridge: updated placeholder node %s with media URL", node_id)
    return True


async def flush_canvas_image_queue(ctx, theater_id: str) -> None:
    """将 ctx.canvas_image_queue 中累积的 URL 顺序落地为画布 image 节点。

    单智能体 chat_generation 与多智能体 orchestrator 共用此入口，
    避免多路径重复实现导致「多智能体生成图片不入画布」这类漏刷问题。

    会话选择策略（避免 SQLite 写锁竞争）：
    - 直接使用 ctx.db（调用方已持有写锁时复用同一连接提交，无需争抢）
    - finally 清空队列（成功/失败均清，防止累积重复写入）
    - theater_id 为空或队列为空时静默返回
    """
    if not theater_id:
        return
    queue = getattr(ctx, "canvas_image_queue", None) or []
    if not queue:
        return
    try:
        urls = [item["url"] for item in queue]
        prompt = queue[0]["prompt"] if queue else ""
        # 优先复用 ctx.db：多智能体路径 orchestrator 的 self.db 已持有 SQLite WAL
        # 写锁（safe_flush 留下的未提交事务），若开新会话写入必然等锁超时。
        # 复用同一连接可直接在已有事务中追加 INSERT + COMMIT，绕开锁竞争。
        # 单智能体路径 ctx.db 来自 FastAPI 请求 session，不存在锁竞争，同样可复用。
        ctx_db = getattr(ctx, "db", None)
        await create_image_nodes(urls, theater_id, prompt, ctx_db)
    except Exception as e:
        logger.error("Flush canvas image queue failed: %s", e)
    finally:
        ctx.canvas_image_queue.clear()
