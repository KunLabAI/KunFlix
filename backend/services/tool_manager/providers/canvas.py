"""
CanvasProvider — CRUD operations for theater canvas nodes.

Migrated from services/canvas_tools.py.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import TheaterNode, TheaterEdge
from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CANVAS_TOOL_NAMES_SET = frozenset({
    "list_canvas_nodes", "get_canvas_node", "create_canvas_node",
    "update_canvas_node", "delete_canvas_node",
    "list_canvas_edges", "create_canvas_edge", "delete_canvas_edge",
})

# Legacy node type migration mapping (old -> new)
NODE_TYPE_MIGRATION = {
    "script": "text",
    "character": "image",
}


def _migrate_node_type(node_type: str) -> str:
    return NODE_TYPE_MIGRATION.get(node_type, node_type)


# Node type definitions with descriptions for Agent understanding
NODE_TYPE_INFO = {
    "text": {
        "description": "文本节点：用于剧本、文案、广告等文字内容。支持富文本格式。",
        "fields": {
            "title": "标题，字符串类型，必填",
            "content": "正文内容，Markdown格式字符串。支持标题(#/##/###)、段落、加粗(**text**)、斜体(*text*)、代码块等Markdown语法。创建节点时必须提供此字段，更新节点时如果不需要修改内容则不要包含此字段。",
            "tags": "标签列表，数组类型，可选，用于分类和筛选"
        },
        "example": {
            "title": "故事大纲",
            "content": "# 第一章\n\n故事开始...\n\n## 场景一\n\n主角登场。",
            "tags": ["大纲", "第一章"]
        }
    },
    "image": {
        "description": "图像节点：用于角色设定、场景、海报等图像内容。需要调用生图模型生成图像，支持JPEG/PNG/JPG格式图像。",
        "fields": {
            "name": "图像名称，字符串类型",
            "description": "图像描述，字符串类型，包含场景、人物等信息",
            "imageUrl": "图片URL地址，字符串类型，支持jpeg/png/jpg格式",
            "fitMode": "图片适配模式，字符串类型，可选值为cover(填充)或contain(适应)"
        },
        "example": {"name": "小明", "description": "主角，18岁，性格开朗", "imageUrl": "/media/xxx.jpg", "fitMode": "cover"}
    },
    "video": {
        "description": "视频节点：用于动画、短片、视频内容。需要调用视频处理模型生成视频，支持MP4格式视频。",
        "fields": {
            "name": "视频名称，字符串类型",
            "description": "视频描述，字符串类型，包含场景、时长等信息",
            "videoUrl": "视频URL地址，字符串类型，支持mp4格式",
            "fitMode": "视频适配模式，字符串类型，可选值为cover(填充)或contain(适应)"
        },
        "example": {"name": "开场动画", "description": "城市夜景转场", "videoUrl": "/media/xxx.mp4", "fitMode": "cover"}
    },
    "audio": {
        "description": "音频节点：用于背景音乐、音效、配音等音频内容。支持MP3/WAV/OGG格式。",
        "fields": {
            "name": "音频名称，字符串类型",
            "description": "音频描述，字符串类型，包含风格、用途等信息",
            "audioUrl": "音频URL地址，字符串类型，支持mp3/wav/ogg格式",
            "lyrics": "歌词文本，字符串类型，可选"
        },
        "example": {"name": "背景音乐", "description": "城市夜景氛围音乐", "audioUrl": "/media/xxx.mp3"}
    },
    "storyboard": {
        "description": "分镜节点：用于分镜脚本、镜头设计等多维表格内容。支持自定义表格数据，支持在单元格内引用图片、视频、音频。",
        "fields": {
            "shotNumber": "镜头号，字符串类型，如'1-1', '2-3'",
            "description": "镜头描述，字符串类型，描述画面内容",
            "duration": "时长，整数类型，单位为秒",
            "tableData": "表格数据行，数组类型，每个元素是一个对象代表一行数据。媒体列的值应为媒体URL路径（如'/api/media/xxx.jpg'）。例如：[{\"scene\": \"城市夜景\", \"type\": \"全景\", \"duration\": 5, \"ref_image\": \"/api/media/abc.jpg\"}]",
            "tableColumns": "表格列定义，数组类型，每个元素包含key(字段名)、label(显示名)、type(列类型)。type支持: text(文本)、number(数字)、image(图片缩略图)、video(视频缩略图)、audio(音频播放器)。媒体类型列的值应为/api/media/路径或完整URL。例如：[{\"key\": \"scene\", \"label\": \"场景\", \"type\": \"text\"}, {\"key\": \"ref_image\", \"label\": \"参考图\", \"type\": \"image\"}]"
        },
        "example": {
            "shotNumber": "1-1",
            "description": "全景：城市夜景",
            "duration": 5,
            "tableColumns": [{"key": "scene", "label": "场景", "type": "text"}, {"key": "type", "label": "镜头类型", "type": "text"}, {"key": "duration", "label": "时长", "type": "number"}, {"key": "ref_image", "label": "参考图", "type": "image"}],
            "tableData": [{"scene": "城市夜景", "type": "全景", "duration": 5, "ref_image": "/api/media/example1.jpg"}, {"scene": "主角特写", "type": "近景", "duration": 3, "ref_image": "/api/media/example2.jpg"}]
        }
    }
}

# Schema for validation (simplified)
NODE_TYPE_SCHEMA = {
    "text":       {"title": str, "content": str, "tags": list},
    "image":      {"name": str, "description": str, "imageUrl": str, "fitMode": str},
    "video":      {"name": str, "description": str, "videoUrl": str, "fitMode": str},
    "audio":      {"name": str, "description": str, "audioUrl": str, "lyrics": str},
    "storyboard": {"shotNumber": str, "description": str, "duration": int, "pivotConfig": Any, "tableData": Any, "tableColumns": Any},
}

_DEFAULT_NODE_WIDTH = 420
_DEFAULT_NODE_HEIGHT = 300
_DEFAULT_X_OFFSET = 460


def _estimate_text_node_size(data: dict) -> tuple[int, int]:
    content = data.get("content", "") or ""
    content_len = len(content)
    line_count = max(content.count('\n') + 1, content_len // 35 + 1)
    chrome_px = 120
    estimated_height = line_count * 24 + chrome_px
    return 420, max(300, min(800, estimated_height))


# ---------------------------------------------------------------------------
# Tool Definitions (OpenAI format)
# ---------------------------------------------------------------------------

def _build_node_type_description() -> str:
    lines = ["节点类型说明："]
    for node_type, info in NODE_TYPE_INFO.items():
        lines.append(f"\n**{node_type}**: {info['description']}")
        lines.append("字段说明：")
        for field, desc in info['fields'].items():
            lines.append(f"  - {field}: {desc}")
        lines.append("示例：") if "example" in info else None
        ("example" in info) and lines.append(f"  {info['example']}")
    return "\n".join(lines)


def _build_canvas_tool_defs(target_node_types: list[str]) -> list[dict]:
    migrated_types = [_migrate_node_type(t) for t in target_node_types] if target_node_types else []
    type_enum = migrated_types or list(NODE_TYPE_SCHEMA.keys())

    return [
        {
            "type": "function",
            "function": {
                "name": "list_canvas_nodes",
                "description": "列出画布上的所有节点，返回节点摘要列表。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_type": {
                            "type": "string",
                            "description": "按节点类型筛选，留空则列出全部。",
                            "enum": type_enum,
                        },
                    },
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_canvas_node",
                "description": "获取指定节点的完整详情。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_id": {
                            "type": "string",
                            "description": "节点UUID。",
                        },
                    },
                    "required": ["node_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_canvas_node",
                "description": "在画布上创建新节点。字段结构参见 Skill 文档中的节点类型说明。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_type": {
                            "type": "string",
                            "description": "节点类型。",
                            "enum": type_enum,
                        },
                        "data": {
                            "type": "object",
                            "description": "节点数据，按节点类型提供对应字段。",
                        },
                        "position_x": {
                            "type": "number",
                            "description": "X坐标，可选，省略则自动放置。",
                        },
                        "position_y": {
                            "type": "number",
                            "description": "Y坐标，可选。",
                        },
                    },
                    "required": ["node_type", "data"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "update_canvas_node",
                "description": "更新节点数据，只需提供要修改的字段（增量合并）。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_id": {
                            "type": "string",
                            "description": "节点UUID。",
                        },
                        "data": {
                            "type": "object",
                            "description": "要更新的字段。",
                        },
                    },
                    "required": ["node_id", "data"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "delete_canvas_node",
                "description": "删除节点及其所有关联连线。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_id": {
                            "type": "string",
                            "description": "节点UUID。",
                        },
                    },
                    "required": ["node_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_canvas_edges",
                "description": "列出画布上所有连线。",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": [],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "create_canvas_edge",
                "description": "在两个节点之间创建连线。标准方向：source_handle='right-source', target_handle='left-target'。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "source_node_id": {
                            "type": "string",
                            "description": "源节点UUID。",
                        },
                        "target_node_id": {
                            "type": "string",
                            "description": "目标节点UUID。",
                        },
                        "source_handle": {
                            "type": "string",
                            "description": "源节点连接点。默认 'right-source'。",
                            "enum": ["left-source", "right-source"],
                        },
                        "target_handle": {
                            "type": "string",
                            "description": "目标节点连接点。默认 'left-target'。",
                            "enum": ["left-target", "right-target"],
                        },
                    },
                    "required": ["source_node_id", "target_node_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "delete_canvas_edge",
                "description": "删除两个节点之间的连线。",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "source_node_id": {
                            "type": "string",
                            "description": "源节点UUID。",
                        },
                        "target_node_id": {
                            "type": "string",
                            "description": "目标节点UUID。",
                        },
                    },
                    "required": ["source_node_id", "target_node_id"],
                },
            },
        },
    ]


# ---------------------------------------------------------------------------
# Execution helpers
# ---------------------------------------------------------------------------

def _json_result(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)


def _error_result(message: str) -> str:
    return _json_result({"error": message})


def _node_summary(node: TheaterNode) -> dict:
    data = node.data or {}
    key_fields_map = {
        "text": ["title", "tags"],
        "image": ["name"],
        "video": ["name"],
        "audio": ["name"],
        "storyboard": ["shotNumber", "description"],
    }
    key_fields = key_fields_map.get(node.node_type, [])
    summary_data = {k: data.get(k) for k in key_fields if k in data}

    return {
        "id": node.id,
        "node_type": node.node_type,
        "position": {"x": node.position_x, "y": node.position_y},
        **summary_data,
    }


def _node_full(node: TheaterNode) -> dict:
    return {
        "id": node.id,
        "theater_id": node.theater_id,
        "node_type": node.node_type,
        "position_x": node.position_x,
        "position_y": node.position_y,
        "width": node.width,
        "height": node.height,
        "z_index": node.z_index,
        "data": node.data,
        "created_by_agent_id": node.created_by_agent_id,
        "created_at": node.created_at,
        "updated_at": node.updated_at,
    }


def _edge_summary(edge: TheaterEdge) -> dict:
    return {
        "id": edge.id,
        "source_node_id": edge.source_node_id,
        "target_node_id": edge.target_node_id,
        "source_handle": edge.source_handle,
        "target_handle": edge.target_handle,
        "edge_type": edge.edge_type,
    }


# ---------------------------------------------------------------------------
# Async execution functions
# ---------------------------------------------------------------------------

async def _exec_list_nodes(
    args: dict, theater_id: str, target_node_types: list[str], db: AsyncSession
) -> str:
    node_type_filter = _migrate_node_type(args.get("node_type", "")) if args.get("node_type") else None
    migrated_target_types = [_migrate_node_type(t) for t in target_node_types] if target_node_types else []

    query = select(TheaterNode).where(TheaterNode.theater_id == theater_id)

    valid_filter = node_type_filter and node_type_filter in migrated_target_types
    query = query.where(TheaterNode.node_type == node_type_filter) if valid_filter else query
    query = query.where(TheaterNode.node_type.in_(migrated_target_types)) if migrated_target_types else query

    result = await db.execute(query.order_by(TheaterNode.created_at))
    nodes = result.scalars().all()

    return _json_result({
        "count": len(nodes),
        "nodes": [_node_summary(n) for n in nodes],
    })


async def _exec_get_node(
    args: dict, theater_id: str, target_node_types: list[str], db: AsyncSession
) -> str:
    node_id = args.get("node_id", "")
    migrated_target_types = [_migrate_node_type(t) for t in target_node_types] if target_node_types else []

    query = select(TheaterNode).where(
        TheaterNode.id == node_id,
        TheaterNode.theater_id == theater_id,
    )
    result = await db.execute(query)
    node = result.scalar_one_or_none()

    return _error_result("Node not found") if not node else (
        _error_result(f"Cannot access node of type '{node.node_type}'")
        if migrated_target_types and node.node_type not in migrated_target_types
        else _json_result(_node_full(node))
    )


async def _exec_create_node(
    args: dict, theater_id: str, target_node_types: list[str], db: AsyncSession, agent_id: str | None = None
) -> str:
    node_type = _migrate_node_type(args.get("node_type", ""))
    data = args.get("data", {})
    position_x = args.get("position_x")
    position_y = args.get("position_y")

    migrated_target_types = [_migrate_node_type(t) for t in target_node_types] if target_node_types else []
    type_allowed = node_type in migrated_target_types
    return _error_result(f"Node type '{node_type}' not allowed") if not type_allowed else await _do_create_node(
        node_type, data, position_x, position_y, theater_id, agent_id, db
    )


async def _do_create_node(
    node_type: str, data: dict, position_x: float | None, position_y: float | None,
    theater_id: str, agent_id: str | None, db: AsyncSession
) -> str:
    final_x, final_y = position_x, position_y
    needs_auto_position = position_x is None or position_y is None

    auto_x, auto_y = await _calculate_auto_position(theater_id, db) if needs_auto_position else (0, 0)
    final_x = final_x if final_x is not None else auto_x
    final_y = final_y if final_y is not None else auto_y

    _size_estimators = {"text": _estimate_text_node_size}
    estimator = _size_estimators.get(node_type)
    width, height = estimator(data) if estimator else (_DEFAULT_NODE_WIDTH, _DEFAULT_NODE_HEIGHT)

    node = TheaterNode(
        id=str(uuid.uuid4()),
        theater_id=theater_id,
        node_type=node_type,
        position_x=final_x,
        position_y=final_y,
        width=width,
        height=height,
        z_index=0,
        data=data,
        created_by_agent_id=agent_id,
    )

    db.add(node)
    await db.commit()
    await db.refresh(node)

    logger.info("Created node %s (type=%s) in theater %s", node.id, node_type, theater_id)
    return _json_result({
        "success": True,
        "node": _node_full(node),
    })


async def _calculate_auto_position(theater_id: str, db: AsyncSession) -> tuple[float, float]:
    query = select(func.max(TheaterNode.position_x)).where(TheaterNode.theater_id == theater_id)
    result = await db.execute(query)
    max_x = result.scalar()

    new_x = (max_x + _DEFAULT_X_OFFSET) if max_x is not None else 100
    return new_x, 100


async def _exec_update_node(
    args: dict, theater_id: str, target_node_types: list[str], db: AsyncSession
) -> str:
    node_id = args.get("node_id", "")
    new_data = args.get("data", {})
    migrated_target_types = [_migrate_node_type(t) for t in target_node_types] if target_node_types else []

    query = select(TheaterNode).where(
        TheaterNode.id == node_id,
        TheaterNode.theater_id == theater_id,
    )
    result = await db.execute(query)
    node = result.scalar_one_or_none()

    return _error_result("Node not found") if not node else (
        _error_result(f"Cannot update node of type '{node.node_type}'")
        if node.node_type not in migrated_target_types
        else await _do_update_node(node, new_data, db)
    )


async def _do_update_node(node: TheaterNode, new_data: dict, db: AsyncSession) -> str:
    filtered_new_data = {k: v for k, v in new_data.items() if v is not None}
    merged_data = {**(node.data or {}), **filtered_new_data}
    node.data = merged_data

    await db.commit()
    await db.refresh(node)

    logger.info("Updated node %s", node.id)
    return _json_result({
        "success": True,
        "node": _node_full(node),
    })


async def _exec_delete_node(
    args: dict, theater_id: str, target_node_types: list[str], db: AsyncSession
) -> str:
    node_id = args.get("node_id", "")
    migrated_target_types = [_migrate_node_type(t) for t in target_node_types] if target_node_types else []

    query = select(TheaterNode).where(
        TheaterNode.id == node_id,
        TheaterNode.theater_id == theater_id,
    )
    result = await db.execute(query)
    node = result.scalar_one_or_none()

    return _error_result("Node not found") if not node else (
        _error_result(f"Cannot delete node of type '{node.node_type}'")
        if node.node_type not in migrated_target_types
        else await _do_delete_node(node, node_id, theater_id, db)
    )


async def _do_delete_node(node: TheaterNode, node_id: str, theater_id: str, db: AsyncSession) -> str:
    edge_delete = delete(TheaterEdge).where(
        TheaterEdge.theater_id == theater_id,
        (TheaterEdge.source_node_id == node_id) | (TheaterEdge.target_node_id == node_id)
    )
    await db.execute(edge_delete)

    await db.delete(node)
    await db.commit()

    logger.info("Deleted node %s and associated edges", node_id)
    return _json_result({
        "success": True,
        "deleted_node_id": node_id,
    })


# ---------------------------------------------------------------------------
# Edge execution functions
# ---------------------------------------------------------------------------

async def _exec_list_edges(
    args: dict, theater_id: str, target_node_types: list[str], db: AsyncSession
) -> str:
    query = select(TheaterEdge).where(TheaterEdge.theater_id == theater_id)
    result = await db.execute(query.order_by(TheaterEdge.created_at))
    edges = result.scalars().all()

    return _json_result({
        "count": len(edges),
        "edges": [_edge_summary(e) for e in edges],
    })


async def _exec_create_edge(
    args: dict, theater_id: str, target_node_types: list[str], db: AsyncSession
) -> str:
    source_node_id = args.get("source_node_id", "")
    target_node_id = args.get("target_node_id", "")
    source_handle = args.get("source_handle", "")
    target_handle = args.get("target_handle", "")

    # 验证节点存在且类型允许
    migrated_target_types = [_migrate_node_type(t) for t in target_node_types] if target_node_types else []

    source_query = select(TheaterNode).where(
        TheaterNode.id == source_node_id,
        TheaterNode.theater_id == theater_id,
    )
    target_query = select(TheaterNode).where(
        TheaterNode.id == target_node_id,
        TheaterNode.theater_id == theater_id,
    )

    source_result = await db.execute(source_query)
    target_result = await db.execute(target_query)
    source_node = source_result.scalar_one_or_none()
    target_node = target_result.scalar_one_or_none()

    if not source_node:
        return _error_result(f"Source node not found: {source_node_id}")
    if not target_node:
        return _error_result(f"Target node not found: {target_node_id}")

    if migrated_target_types:
        if source_node.node_type not in migrated_target_types:
            return _error_result(f"Cannot connect from node of type '{source_node.node_type}'")
        if target_node.node_type not in migrated_target_types:
            return _error_result(f"Cannot connect to node of type '{target_node.node_type}'")

    # 检查是否已存在相同连线
    existing_query = select(TheaterEdge).where(
        TheaterEdge.theater_id == theater_id,
        TheaterEdge.source_node_id == source_node_id,
        TheaterEdge.target_node_id == target_node_id,
    )
    existing_result = await db.execute(existing_query)
    if existing_result.scalar_one_or_none():
        return _error_result("Edge already exists between these nodes")

    # 创建连线
    edge = TheaterEdge(
        id=str(uuid.uuid4()),
        theater_id=theater_id,
        source_node_id=source_node_id,
        target_node_id=target_node_id,
        source_handle=source_handle or "right-source",
        target_handle=target_handle or "left-target",
        edge_type="custom",
        animated=True,
    )

    db.add(edge)
    await db.commit()
    await db.refresh(edge)

    logger.info(
        "Created edge %s from %s to %s in theater %s",
        edge.id, source_node_id, target_node_id, theater_id
    )
    return _json_result({
        "success": True,
        "edge": _edge_summary(edge),
    })


async def _exec_delete_edge(
    args: dict, theater_id: str, target_node_types: list[str], db: AsyncSession
) -> str:
    source_node_id = args.get("source_node_id", "")
    target_node_id = args.get("target_node_id", "")

    query = select(TheaterEdge).where(
        TheaterEdge.theater_id == theater_id,
        TheaterEdge.source_node_id == source_node_id,
        TheaterEdge.target_node_id == target_node_id,
    )
    result = await db.execute(query)
    edge = result.scalar_one_or_none()

    if not edge:
        return _error_result("Edge not found")

    await db.delete(edge)
    await db.commit()

    logger.info("Deleted edge from %s to %s", source_node_id, target_node_id)
    return _json_result({
        "success": True,
        "deleted_edge": {
            "source_node_id": source_node_id,
            "target_node_id": target_node_id,
        },
    })


# ---------------------------------------------------------------------------
# Executor lookup map
# ---------------------------------------------------------------------------

_EXECUTORS: dict[str, callable] = {
    "list_canvas_nodes": _exec_list_nodes,
    "get_canvas_node": _exec_get_node,
    "create_canvas_node": _exec_create_node,
    "update_canvas_node": _exec_update_node,
    "delete_canvas_node": _exec_delete_node,
    "list_canvas_edges": _exec_list_edges,
    "create_canvas_edge": _exec_create_edge,
    "delete_canvas_edge": _exec_delete_edge,
}


async def _run_executor(
    executor: callable, tool_name: str, args: dict,
    theater_id: str, target_node_types: list[str],
    db: AsyncSession, agent_id: str | None,
) -> str:
    try:
        needs_agent_id = tool_name == "create_canvas_node"
        result = (
            await executor(args, theater_id, target_node_types, db, agent_id)
            if needs_agent_id
            else await executor(args, theater_id, target_node_types, db)
        )
        logger.info("CanvasProvider.execute(%s) -> %d chars", tool_name, len(result))
        return result
    except Exception as exc:
        logger.error("Canvas tool error (%s): %s", tool_name, exc)
        return _error_result(f"Tool execution failed: {exc}")


# ---------------------------------------------------------------------------
# CanvasProvider class
# ---------------------------------------------------------------------------

class CanvasProvider:
    """Provider for theater canvas node CRUD tools."""

    display_name = "画布工具"
    description = "画布节点的增删改查（text/image/video/storyboard）"
    condition = "需要 theater_id 且 target_node_types 非空（或 canvas_tools skill 已加载）"

    # 全节点类型列表（canvas_tools skill 加载后的默认值）
    _ALL_NODE_TYPES = list(NODE_TYPE_SCHEMA.keys())

    @property
    def tool_names(self) -> frozenset[str]:
        return CANVAS_TOOL_NAMES_SET

    def _effective_node_types(self, ctx: ToolContext) -> list[str]:
        """canvas_tools skill 加载后授予全节点类型访问权限，否则使用 agent 配置。"""
        skill_loaded = "canvas_tools" in ctx.loaded_tool_skills
        return self._ALL_NODE_TYPES if skill_loaded else (ctx.agent.target_node_types or [])

    async def build_defs(self, ctx: ToolContext) -> list[dict]:
        # Skill-gate: 如果 canvas_tools skill 已配置但未加载，延迟注入
        if ctx.is_skill_gated("canvas_tools"):
            return []

        target_types = self._effective_node_types(ctx)
        has_context = ctx.theater_id and target_types
        return _build_canvas_tool_defs(target_types) if has_context else []

    async def execute(self, name: str, args: dict, ctx: ToolContext) -> str:
        target_types = self._effective_node_types(ctx)
        executor = _EXECUTORS.get(name)
        return _error_result(f"Unknown canvas tool: {name}") if not executor else await _run_executor(
            executor, name, args, ctx.theater_id, target_types, ctx.db, agent_id=ctx.agent.id
        )

    def rebuild_defs(self, ctx: ToolContext) -> list[dict] | None:
        return None

    def get_tool_metadata(self) -> list[dict]:
        """Return full-capability metadata (all node types) for registry display."""
        all_types = list(NODE_TYPE_SCHEMA.keys())
        defs = _build_canvas_tool_defs(all_types)
        return [
            {
                "name": d["function"]["name"],
                "description": d["function"]["description"],
                "parameters": d["function"]["parameters"],
            }
            for d in defs
        ]
