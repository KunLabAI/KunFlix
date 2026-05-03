"""
Canvas edge rules — mirror of frontend/src/lib/canvas/edgeRules.ts.

规范来源：frontend/src/lib/canvas/edgeRules.md
前端对应：frontend/src/lib/canvas/edgeRules.ts

任何规范变更必须同时改动前端与本文件，否则前后端不一致会导致：
 - 前端放行 → 后端拒绝：用户看到建边成功但 reload 后消失
 - 前端拒绝 → 后端放行：Agent 工具绕过校验

设计原则：
 1. 矩阵写死为纯常量；5x5 结构与前端逐字母一致。
 2. validate_edge 只判定合法性；不处理内容注入（后端当前版本仅做建边）。
 3. 所有检查走早返回，避免嵌套 if。
"""
from __future__ import annotations

from typing import Iterable, Literal, Optional, TypedDict

EdgeLegality = Literal["allow", "deferred", "forbid"]
EdgeRejectReason = Literal[
    "self_loop",
    "same_polarity",
    "duplicate_edge",
    "cycle",
    "forbidden_type_combination",
    "not_supported_yet",
    "unknown_type",
]

NODE_TYPES: tuple[str, ...] = ("text", "image", "video", "audio", "storyboard")

# 5x5 合法性矩阵（Source → Target）——必须与 edgeRules.md 第 4 节逐格对齐。
EDGE_LEGALITY_MATRIX: dict[str, dict[str, EdgeLegality]] = {
    "text": {
        "text": "allow", "image": "allow", "video": "allow", "audio": "allow", "storyboard": "allow",
    },
    "image": {
        "text": "deferred", "image": "allow", "video": "allow", "audio": "forbid", "storyboard": "allow",
    },
    "video": {
        "text": "deferred", "image": "allow", "video": "allow", "audio": "deferred", "storyboard": "allow",
    },
    "audio": {
        "text": "deferred", "image": "forbid", "video": "allow", "audio": "deferred", "storyboard": "allow",
    },
    "storyboard": {
        "text": "allow", "image": "allow", "video": "allow", "audio": "allow", "storyboard": "allow",
    },
}

REJECT_MESSAGES: dict[EdgeRejectReason, str] = {
    "self_loop": "Cannot connect a node to itself",
    "same_polarity": "Invalid handle direction: both endpoints must be on different sides of the nodes",
    "duplicate_edge": "Edge already exists between these nodes",
    "cycle": "Connection would create a cycle",
    "forbidden_type_combination": "This node type combination is not allowed",
    "not_supported_yet": "This edge type is not yet supported",
    "unknown_type": "Unknown node type",
}


class ExistingEdge(TypedDict, total=False):
    """Minimal shape needed for validation (matches TheaterEdge columns)."""
    source_node_id: str
    target_node_id: str
    source_handle: Optional[str]
    target_handle: Optional[str]


class EdgeValidationResult(TypedDict, total=False):
    ok: bool
    reason: EdgeRejectReason
    message: str


def _handle_side(h: Optional[str]) -> Optional[str]:
    """Return 'left' / 'right' / None based on handle id prefix.

    Frontend uses ConnectionMode.Loose with `{side}-source` and `{side}-target` stacked
    at the same position; role suffix is unreliable. Polarity is judged by geometric side.
    """
    if not isinstance(h, str):
        return None
    if h.startswith("left-"):
        return "left"
    if h.startswith("right-"):
        return "right"
    return None


def _has_cycle(edges: Iterable[ExistingEdge], new_source: str, new_target: str) -> bool:
    """简单的 DFS 环检测：加上新边后从 new_target 能否回到 new_source。"""
    adj: dict[str, list[str]] = {}
    for e in edges:
        adj.setdefault(e["source_node_id"], []).append(e["target_node_id"])
    # 模拟加入新边
    adj.setdefault(new_source, []).append(new_target)

    stack = [new_target]
    visited: set[str] = set()
    while stack:
        node = stack.pop()
        if node == new_source:
            return True
        if node in visited:
            continue
        visited.add(node)
        stack.extend(adj.get(node, []))
    return False


def validate_edge(
    *,
    source_id: str,
    target_id: str,
    source_type: Optional[str],
    target_type: Optional[str],
    source_handle: Optional[str],
    target_handle: Optional[str],
    existing_edges: Iterable[ExistingEdge],
) -> EdgeValidationResult:
    """按 self_loop → same_polarity → duplicate → cycle → matrix 顺序校验。"""
    # 1. 自环
    if source_id == target_id:
        return {"ok": False, "reason": "self_loop", "message": REJECT_MESSAGES["self_loop"]}

    # 2. 极性（两端都能识别出侧边时才校验，loose 模式下 role 后缀不可靠）
    src_side = _handle_side(source_handle)
    tgt_side = _handle_side(target_handle)
    polarity_checkable = src_side is not None and tgt_side is not None
    polarity_bad = polarity_checkable and src_side == tgt_side
    if polarity_bad:
        return {"ok": False, "reason": "same_polarity", "message": REJECT_MESSAGES["same_polarity"]}

    # 3. 四元组去重
    edges_list = list(existing_edges)
    is_dup = any(
        e.get("source_node_id") == source_id
        and e.get("target_node_id") == target_id
        and (e.get("source_handle") or None) == (source_handle or None)
        and (e.get("target_handle") or None) == (target_handle or None)
        for e in edges_list
    )
    if is_dup:
        return {"ok": False, "reason": "duplicate_edge", "message": REJECT_MESSAGES["duplicate_edge"]}

    # 4. 拓扑环
    if _has_cycle(edges_list, source_id, target_id):
        return {"ok": False, "reason": "cycle", "message": REJECT_MESSAGES["cycle"]}

    # 5. 矩阵（类型未知时按 allow，兼容 ghost / streaming 等非规范类型）
    both_known = source_type in NODE_TYPES and target_type in NODE_TYPES
    legality: Optional[EdgeLegality] = (
        EDGE_LEGALITY_MATRIX[source_type][target_type] if both_known else None
    )
    if legality == "forbid":
        return {
            "ok": False,
            "reason": "forbidden_type_combination",
            "message": f"{source_type} → {target_type} is not allowed",
        }
    if legality == "deferred":
        return {
            "ok": False,
            "reason": "not_supported_yet",
            "message": f"{source_type} → {target_type} is not supported yet",
        }

    return {"ok": True}
