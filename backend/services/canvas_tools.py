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

NODE_TYPE_SCHEMA = {
    "script":     {"title": str, "description": str, "content": Any, "tags": list},
    "character":  {"name": str, "description": str, "imageUrl": str},
    "video":      {"name": str, "description": str, "videoUrl": str},
    "storyboard": {"shotNumber": str, "description": str, "duration": int, "pivotConfig": Any},
}

_DEFAULT_NODE_WIDTH = 280
_DEFAULT_NODE_HEIGHT = 200
_DEFAULT_X_OFFSET = 300

# ---------------------------------------------------------------------------
# Tool Definitions (OpenAI format)
# ---------------------------------------------------------------------------

def build_canvas_tool_defs(target_node_types: list[str]) -> list[dict]:
    """Return OpenAI-format tool definitions for canvas tools.
    
    Args:
        target_node_types: List of node types this agent can control.
    
    Returns:
        List of 5 tool definitions with node_type enums restricted to target_node_types.
    """
    type_enum = target_node_types or list(NODE_TYPE_SCHEMA.keys())
    
    return [
        {
            "type": "function",
            "function": {
                "name": "list_canvas_nodes",
                "description": (
                    "List all nodes on the canvas. Use this to see what content exists. "
                    "Can filter by node_type. Returns a summary with id, type, position, and key data fields."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_type": {
                            "type": "string",
                            "description": "Filter by node type. Leave empty to list all accessible nodes.",
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
                    "Get the full details of a specific node by its ID. "
                    "Returns complete node data including all fields."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_id": {
                            "type": "string",
                            "description": "The UUID of the node to retrieve.",
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
                    "Create a new node on the canvas. Specify the node type and data. "
                    "Position is optional - if not provided, the node will be placed to the right of existing nodes."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_type": {
                            "type": "string",
                            "description": "The type of node to create.",
                            "enum": type_enum,
                        },
                        "data": {
                            "type": "object",
                            "description": "Node-specific data (e.g., title, content for script; name, imageUrl for character).",
                        },
                        "position_x": {
                            "type": "number",
                            "description": "X coordinate on the canvas. Optional.",
                        },
                        "position_y": {
                            "type": "number",
                            "description": "Y coordinate on the canvas. Optional.",
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
                    "Update an existing node's data. Provide only the fields you want to change - "
                    "they will be merged with existing data."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_id": {
                            "type": "string",
                            "description": "The UUID of the node to update.",
                        },
                        "data": {
                            "type": "object",
                            "description": "Fields to update. Will be merged with existing node data.",
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
                    "Delete a node from the canvas. This will also remove any edges connected to this node."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_id": {
                            "type": "string",
                            "description": "The UUID of the node to delete.",
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
        "script": ["title", "tags"],
        "character": ["name"],
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
    node_type_filter = args.get("node_type")
    
    query = select(TheaterNode).where(TheaterNode.theater_id == theater_id)
    
    # Apply type filter if specified and valid
    valid_filter = node_type_filter and node_type_filter in target_node_types
    query = query.where(TheaterNode.node_type == node_type_filter) if valid_filter else query
    
    # Only list nodes of types we can control
    query = query.where(TheaterNode.node_type.in_(target_node_types)) if target_node_types else query
    
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
    
    query = select(TheaterNode).where(
        TheaterNode.id == node_id,
        TheaterNode.theater_id == theater_id,
    )
    result = await db.execute(query)
    node = result.scalar_one_or_none()
    
    # Validation
    return _error_result("Node not found") if not node else (
        _error_result(f"Cannot access node of type '{node.node_type}'")
        if target_node_types and node.node_type not in target_node_types
        else _json_result(_node_full(node))
    )


async def _exec_create_node(
    args: dict, theater_id: str, target_node_types: list[str], db: AsyncSession, agent_id: str | None = None
) -> str:
    """Create a new node on the canvas."""
    node_type = args.get("node_type", "")
    data = args.get("data", {})
    position_x = args.get("position_x")
    position_y = args.get("position_y")
    
    # Validate node_type
    type_allowed = node_type in target_node_types
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
    
    node = TheaterNode(
        id=str(uuid.uuid4()),
        theater_id=theater_id,
        node_type=node_type,
        position_x=final_x,
        position_y=final_y,
        width=_DEFAULT_NODE_WIDTH,
        height=_DEFAULT_NODE_HEIGHT,
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
        if node.node_type not in target_node_types
        else await _do_update_node(node, new_data, db)
    )


async def _do_update_node(node: TheaterNode, new_data: dict, db: AsyncSession) -> str:
    """Actual node update logic."""
    merged_data = {**(node.data or {}), **new_data}
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
        if node.node_type not in target_node_types
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
