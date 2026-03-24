"""
Canvas tools — CRUD operations for theater nodes.

Architecture:
- Tool definitions: OpenAI-format dicts for LLM registration
- Execution functions: async database operations
- Dispatcher: lookup-map based routing (no if chains)
"""
import json
import logging
import uuid
from typing import Any

from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import TheaterNode, TheaterEdge

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CANVAS_TOOL_NAMES = {"list_canvas_nodes", "get_canvas_node", "create_canvas_node", "update_canvas_node", "delete_canvas_node"}

# Legacy node type migration mapping (old -> new)
NODE_TYPE_MIGRATION = {
    "script": "text",
    "character": "image",
}


def _migrate_node_type(node_type: str) -> str:
    """Migrate legacy node type names to current names."""
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
    "storyboard": {
        "description": "分镜节点：用于分镜脚本、镜头设计等多维表格内容。JSON格式，支持自定义字段。",
        "fields": {
            "shotNumber": "镜头号，字符串类型，如'1-1', '2-3'",
            "description": "镜头描述，字符串类型，描述画面内容",
            "duration": "时长，整数类型，单位为秒",
            "pivotConfig": "多维表格配置，JSON格式，可自定义字段类型和显示方式"
        },
        "example": {"shotNumber": "1-1", "description": "全景：城市夜景", "duration": 5, "pivotConfig": {"columns": [{"key": "camera", "label": "机位", "type": "text"}]}}
    }
}

# Schema for validation (simplified)
NODE_TYPE_SCHEMA = {
    "text":     {"title": str, "content": str, "tags": list},
    "image":  {"name": str, "description": str, "imageUrl": str, "fitMode": str},
    "video":      {"name": str, "description": str, "videoUrl": str, "fitMode": str},
    "storyboard": {"shotNumber": str, "description": str, "duration": int, "pivotConfig": Any},
}

_DEFAULT_NODE_WIDTH = 420
_DEFAULT_NODE_HEIGHT = 300
_DEFAULT_X_OFFSET = 460


def _estimate_text_node_size(data: dict) -> tuple[int, int]:
    """Estimate appropriate node dimensions for text content."""
    content = data.get("content", "") or ""
    content_len = len(content)
    # ~35 CJK chars per line at 420px width, 14px font
    line_count = max(content.count('\n') + 1, content_len // 35 + 1)
    chrome_px = 120  # title bar + padding + margins
    estimated_height = line_count * 24 + chrome_px
    return 420, max(300, min(800, estimated_height))

# ---------------------------------------------------------------------------
# Tool Definitions (OpenAI format)
# ---------------------------------------------------------------------------

def _build_node_type_description() -> str:
    """Build a detailed description of node types for the Agent."""
    lines = ["节点类型说明："]
    for node_type, info in NODE_TYPE_INFO.items():
        lines.append(f"\n**{node_type}**: {info['description']}")
        lines.append("字段说明：")
        for field, desc in info['fields'].items():
            lines.append(f"  - {field}: {desc}")
        if "example" in info:
            lines.append("示例：")
            lines.append(f"  {info['example']}")
    return "\n".join(lines)


def build_canvas_tool_defs(target_node_types: list[str]) -> list[dict]:
    """Return OpenAI-format tool definitions for canvas tools.
    
    Args:
        target_node_types: List of node types this agent can control.
    
    Returns:
        List of 5 tool definitions with node_type enums restricted to target_node_types.
    """
    # Migrate legacy node type names to current names
    migrated_types = [_migrate_node_type(t) for t in target_node_types] if target_node_types else []
    type_enum = migrated_types or list(NODE_TYPE_SCHEMA.keys())
    node_type_desc = _build_node_type_description()
    
    return [
        {
            "type": "function",
            "function": {
                "name": "list_canvas_nodes",
                "description": (
                    "列出画布上的所有节点。可以按节点类型筛选。"
                    "返回节点摘要，包含id、类型、位置和关键数据字段。"
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_type": {
                            "type": "string",
                            "description": "按节点类型筛选，留空则列出所有可访问的节点。",
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
                "description": (
                    "获取指定节点的完整详情。"
                    "返回节点的所有数据字段。"
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_id": {
                            "type": "string",
                            "description": "要获取的节点UUID。",
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
                "description": (
                    "在画布上创建新节点。指定节点类型和数据。"
                    "位置可选，如未提供则自动放置在现有节点右侧。\n\n"
                    f"{node_type_desc}"
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_type": {
                            "type": "string",
                            "description": "要创建的节点类型。",
                            "enum": type_enum,
                        },
                        "data": {
                            "type": "object",
                            "description": "节点数据，根据节点类型提供相应字段。参考上方节点类型说明。",
                        },
                        "position_x": {
                            "type": "number",
                            "description": "画布X坐标，可选。",
                        },
                        "position_y": {
                            "type": "number",
                            "description": "画布Y坐标，可选。",
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
                "description": (
                    "更新现有节点的数据。只需提供要修改的字段，会与现有数据合并。\n\n"
                    f"{node_type_desc}"
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_id": {
                            "type": "string",
                            "description": "要更新的节点UUID。",
                        },
                        "data": {
                            "type": "object",
                            "description": "要更新的字段，会与现有数据合并。参考上方节点类型说明。",
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
                "description": (
                    "从画布上删除节点。同时会删除与该节点相连的所有连线。"
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_id": {
                            "type": "string",
                            "description": "要删除的节点UUID。",
                        },
                    },
                    "required": ["node_id"],
                },
            },
        },
    ]


# ---------------------------------------------------------------------------
# Execution Functions
# ---------------------------------------------------------------------------

def _json_result(data: Any) -> str:
    """Serialize result to JSON string."""
    return json.dumps(data, ensure_ascii=False, default=str)


def _error_result(message: str) -> str:
    """Return a JSON error message."""
    return _json_result({"error": message})


def _node_summary(node: TheaterNode) -> dict:
    """Extract summary fields from a node."""
    data = node.data or {}
    # Key fields vary by type
    key_fields_map = {
        "text": ["title", "tags"],
        "image": ["name"],
        "video": ["name"],
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
    """Convert node to full dict representation."""
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


async def _exec_list_nodes(
    args: dict, theater_id: str, target_node_types: list[str], db: AsyncSession
) -> str:
    """List nodes, optionally filtered by node_type."""
    node_type_filter = _migrate_node_type(args.get("node_type", "")) if args.get("node_type") else None
    
    # Migrate target_node_types for validation
    migrated_target_types = [_migrate_node_type(t) for t in target_node_types] if target_node_types else []
    
    query = select(TheaterNode).where(TheaterNode.theater_id == theater_id)
    
    # Apply type filter if specified and valid
    valid_filter = node_type_filter and node_type_filter in migrated_target_types
    query = query.where(TheaterNode.node_type == node_type_filter) if valid_filter else query
    
    # Only list nodes of types we can control
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
    """Get full details of a single node."""
    node_id = args.get("node_id", "")
    
    # Migrate target_node_types for validation
    migrated_target_types = [_migrate_node_type(t) for t in target_node_types] if target_node_types else []
    
    query = select(TheaterNode).where(
        TheaterNode.id == node_id,
        TheaterNode.theater_id == theater_id,
    )
    result = await db.execute(query)
    node = result.scalar_one_or_none()
    
    # Validation
    return _error_result("Node not found") if not node else (
        _error_result(f"Cannot access node of type '{node.node_type}'")
        if migrated_target_types and node.node_type not in migrated_target_types
        else _json_result(_node_full(node))
    )


async def _exec_create_node(
    args: dict, theater_id: str, target_node_types: list[str], db: AsyncSession, agent_id: str | None = None
) -> str:
    """Create a new node on the canvas."""
    node_type = _migrate_node_type(args.get("node_type", ""))
    data = args.get("data", {})
    position_x = args.get("position_x")
    position_y = args.get("position_y")
    
    # Migrate target_node_types for validation
    migrated_target_types = [_migrate_node_type(t) for t in target_node_types] if target_node_types else []
    # Validate node_type
    type_allowed = node_type in migrated_target_types
    return _error_result(f"Node type '{node_type}' not allowed") if not type_allowed else await _do_create_node(
        node_type, data, position_x, position_y, theater_id, agent_id, db
    )


async def _do_create_node(
    node_type: str, data: dict, position_x: float | None, position_y: float | None,
    theater_id: str, agent_id: str | None, db: AsyncSession
) -> str:
    """Actual node creation logic."""
    # Auto-calculate position if not specified
    final_x, final_y = position_x, position_y
    needs_auto_position = position_x is None or position_y is None
    
    auto_x, auto_y = await _calculate_auto_position(theater_id, db) if needs_auto_position else (0, 0)
    final_x = final_x if final_x is not None else auto_x
    final_y = final_y if final_y is not None else auto_y
    
    # Dynamic size estimation for text nodes, default for others
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
    """Calculate auto position for new node (to the right of existing nodes)."""
    query = select(func.max(TheaterNode.position_x)).where(TheaterNode.theater_id == theater_id)
    result = await db.execute(query)
    max_x = result.scalar()
    
    new_x = (max_x + _DEFAULT_X_OFFSET) if max_x is not None else 100
    return new_x, 100


async def _exec_update_node(
    args: dict, theater_id: str, target_node_types: list[str], db: AsyncSession
) -> str:
    """Update an existing node's data (merge)."""
    node_id = args.get("node_id", "")
    new_data = args.get("data", {})
    
    # Migrate target_node_types for validation
    migrated_target_types = [_migrate_node_type(t) for t in target_node_types] if target_node_types else []
    
    # Fetch node
    query = select(TheaterNode).where(
        TheaterNode.id == node_id,
        TheaterNode.theater_id == theater_id,
    )
    result = await db.execute(query)
    node = result.scalar_one_or_none()
    
    # Validation
    return _error_result("Node not found") if not node else (
        _error_result(f"Cannot update node of type '{node.node_type}'")
        if node.node_type not in migrated_target_types
        else await _do_update_node(node, new_data, db)
    )


async def _do_update_node(node: TheaterNode, new_data: dict, db: AsyncSession) -> str:
    """Actual node update logic."""
    # Filter out None values to prevent overwriting existing data
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
    """Delete a node and its associated edges."""
    node_id = args.get("node_id", "")
    
    # Migrate target_node_types for validation
    migrated_target_types = [_migrate_node_type(t) for t in target_node_types] if target_node_types else []
    
    # Fetch node
    query = select(TheaterNode).where(
        TheaterNode.id == node_id,
        TheaterNode.theater_id == theater_id,
    )
    result = await db.execute(query)
    node = result.scalar_one_or_none()
    
    # Validation
    return _error_result("Node not found") if not node else (
        _error_result(f"Cannot delete node of type '{node.node_type}'")
        if node.node_type not in migrated_target_types
        else await _do_delete_node(node, node_id, theater_id, db)
    )


async def _do_delete_node(node: TheaterNode, node_id: str, theater_id: str, db: AsyncSession) -> str:
    """Actual node deletion logic."""
    # Delete associated edges
    edge_delete = delete(TheaterEdge).where(
        TheaterEdge.theater_id == theater_id,
        (TheaterEdge.source_node_id == node_id) | (TheaterEdge.target_node_id == node_id)
    )
    await db.execute(edge_delete)
    
    # Delete node
    await db.delete(node)
    await db.commit()
    
    logger.info("Deleted node %s and associated edges", node_id)
    return _json_result({
        "success": True,
        "deleted_node_id": node_id,
    })


# ---------------------------------------------------------------------------
# Dispatcher (lookup map)
# ---------------------------------------------------------------------------

_EXECUTORS: dict[str, callable] = {
    "list_canvas_nodes": _exec_list_nodes,
    "get_canvas_node": _exec_get_node,
    "create_canvas_node": _exec_create_node,
    "update_canvas_node": _exec_update_node,
    "delete_canvas_node": _exec_delete_node,
}


async def execute_canvas_tool(
    tool_name: str,
    args: dict,
    theater_id: str,
    target_node_types: list[str],
    db: AsyncSession,
    agent_id: str | None = None,
) -> str:
    """Execute a canvas tool by name.
    
    Args:
        tool_name: One of CANVAS_TOOL_NAMES.
        args: Tool arguments from LLM.
        theater_id: Current theater scope.
        target_node_types: Node types this agent can control.
        db: Async database session.
        agent_id: Optional agent ID for tracking node creation.
    
    Returns:
        JSON string result.
    """
    executor = _EXECUTORS.get(tool_name)
    
    # Unknown tool
    unknown = not executor
    return _error_result(f"Unknown canvas tool: {tool_name}") if unknown else await _run_executor(
        executor, tool_name, args, theater_id, target_node_types, db, agent_id
    )


async def _run_executor(
    executor: callable,
    tool_name: str,
    args: dict,
    theater_id: str,
    target_node_types: list[str],
    db: AsyncSession,
    agent_id: str | None,
) -> str:
    """Run the executor with appropriate arguments."""
    try:
        # create_canvas_node needs agent_id
        needs_agent_id = tool_name == "create_canvas_node"
        result = (
            await executor(args, theater_id, target_node_types, db, agent_id)
            if needs_agent_id
            else await executor(args, theater_id, target_node_types, db)
        )
        logger.info("execute_canvas_tool(%s) -> %d chars", tool_name, len(result))
        return result
    except Exception as exc:
        logger.error("Canvas tool error (%s): %s", tool_name, exc)
        return _error_result(f"Tool execution failed: {exc}")
