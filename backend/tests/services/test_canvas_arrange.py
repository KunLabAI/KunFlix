"""Tests for the canvas auto-arrange tool (`arrange_canvas_nodes`).

Covers the pure shelf/waterfall layout algorithm (``_compute_flow_layout``) and
the async executor (``_exec_arrange_nodes``) with a fake DB session, plus
registration invariants (tool set / executors / read-only whitelist).
"""
from __future__ import annotations

import json

import pytest

from services.tool_manager.providers import canvas
from security.permission import READ_ONLY_TOOLS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _boxes_disjoint(a: tuple, b: tuple) -> bool:
    """True when two (x, y, w, h) boxes do NOT overlap."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return (ax + aw <= bx) or (bx + bw <= ax) or (ay + ah <= by) or (by + bh <= ay)


class _FakeNode:
    def __init__(self, id, node_type, x, y, w, h):
        self.id = id
        self.node_type = node_type
        self.position_x = x
        self.position_y = y
        self.width = w
        self.height = h


class _FakeResult:
    def __init__(self, nodes):
        self._nodes = nodes

    def scalars(self):
        return self

    def all(self):
        return self._nodes


class _FakeDB:
    """execute() ignores the query and always returns the seeded nodes."""

    def __init__(self, nodes):
        self._nodes = nodes

    async def execute(self, _query):
        return _FakeResult(self._nodes)


# ---------------------------------------------------------------------------
# _compute_flow_layout — pure algorithm
# ---------------------------------------------------------------------------

class TestComputeFlowLayout:
    def test_empty_returns_empty(self):
        assert canvas._compute_flow_layout([]) == {}

    def test_single_node_at_origin(self):
        layout = canvas._compute_flow_layout([("n1", 999.0, 999.0, 420, 300)])
        assert layout["n1"] == (canvas._GRID_ORIGIN_X, canvas._GRID_ORIGIN_Y)

    def test_two_nodes_share_first_row(self):
        layout = canvas._compute_flow_layout([
            ("n1", 0.0, 0.0, 420, 300),
            ("n2", 0.0, 0.0, 420, 300),
        ])
        x1, y1 = layout["n1"]
        x2, y2 = layout["n2"]
        assert y1 == y2 == canvas._GRID_ORIGIN_Y
        assert x2 == x1 + 420 + canvas._GRID_GAP_X

    def test_reading_order_top_left_first(self):
        # n_low sits lower on canvas; n_high is higher → n_high must be placed first
        layout = canvas._compute_flow_layout([
            ("n_low", 0.0, 800.0, 420, 300),
            ("n_high", 0.0, 100.0, 420, 300),
        ])
        assert layout["n_high"] == (canvas._GRID_ORIGIN_X, canvas._GRID_ORIGIN_Y)
        assert layout["n_low"][0] == canvas._GRID_ORIGIN_X + 420 + canvas._GRID_GAP_X

    def test_wraps_to_new_row_beyond_max_width(self):
        # 6 default-width nodes: 5 fit in row 1, the 6th wraps to a new shelf
        boxes = [(f"n{i}", 0.0, 0.0, None, None) for i in range(6)]
        layout = canvas._compute_flow_layout(boxes)
        ys = {layout[f"n{i}"][1] for i in range(5)}
        assert ys == {canvas._GRID_ORIGIN_Y}
        # 6th node wrapped below
        assert layout["n5"][0] == canvas._GRID_ORIGIN_X
        assert layout["n5"][1] == canvas._GRID_ORIGIN_Y + canvas._DEFAULT_NODE_HEIGHT + canvas._GRID_GAP_Y

    def test_no_overlaps_for_messy_input(self):
        # Nodes all dumped at the same overlapping spot with varied sizes
        sizes = [(420, 300), (512, 384), (360, 200), (398, 256), (420, 800)]
        boxes = [(f"n{i}", 100.0, 100.0, w, h) for i, (w, h) in enumerate(sizes)]
        layout = canvas._compute_flow_layout(boxes)
        placed = [(layout[f"n{i}"][0], layout[f"n{i}"][1], sizes[i][0], sizes[i][1])
                  for i in range(len(sizes))]
        for i in range(len(placed)):
            for j in range(i + 1, len(placed)):
                assert _boxes_disjoint(placed[i], placed[j]), f"overlap between n{i} and n{j}"

    def test_missing_dims_use_defaults(self):
        layout = canvas._compute_flow_layout([("n1", 0.0, 0.0, None, None)])
        assert layout["n1"] == (canvas._GRID_ORIGIN_X, canvas._GRID_ORIGIN_Y)


# ---------------------------------------------------------------------------
# _exec_arrange_nodes — async executor with fake DB
# ---------------------------------------------------------------------------

class TestExecArrangeNodes:
    @pytest.fixture(autouse=True)
    def _patch_commit(self, monkeypatch):
        async def _noop(_db):
            return None
        monkeypatch.setattr(canvas, "safe_commit", _noop)

    async def test_arranges_and_persists_positions(self):
        nodes = [
            _FakeNode("a", "text", 500.0, 500.0, 420, 300),
            _FakeNode("b", "image", 500.0, 500.0, 420, 300),
        ]
        db = _FakeDB(nodes)
        result = await canvas._exec_arrange_nodes({}, "th1", ["text", "image"], db)
        payload = json.loads(result)

        assert payload["success"] is True
        assert payload["arranged"] == 2
        # Positions were rewritten in place on the ORM objects
        assert nodes[0].position_x == canvas._GRID_ORIGIN_X
        assert nodes[0].position_y == canvas._GRID_ORIGIN_Y
        # Returned positions mirror the new layout
        returned = {p["id"]: p["position"] for p in payload["positions"]}
        assert returned["a"] == {"x": canvas._GRID_ORIGIN_X, "y": canvas._GRID_ORIGIN_Y}

    async def test_empty_canvas_returns_zero(self):
        db = _FakeDB([])
        result = await canvas._exec_arrange_nodes({}, "th1", [], db)
        payload = json.loads(result)
        assert payload == {"success": True, "arranged": 0, "positions": []}


# ---------------------------------------------------------------------------
# Registration invariants
# ---------------------------------------------------------------------------

class TestRegistration:
    def test_in_canvas_tool_names(self):
        assert "arrange_canvas_nodes" in canvas.CANVAS_TOOL_NAMES_SET

    def test_has_executor(self):
        assert canvas._EXECUTORS["arrange_canvas_nodes"] is canvas._exec_arrange_nodes

    def test_not_read_only(self):
        # arrange mutates positions → must NOT be whitelisted for EXPLORE mode
        assert "arrange_canvas_nodes" not in READ_ONLY_TOOLS

    def test_tool_def_is_built(self):
        defs = canvas._build_canvas_tool_defs(["text", "image"])
        names = {d["function"]["name"] for d in defs}
        assert "arrange_canvas_nodes" in names
        arrange = next(d for d in defs if d["function"]["name"] == "arrange_canvas_nodes")
        assert arrange["function"]["parameters"]["required"] == []


# ---------------------------------------------------------------------------
# Node type coverage — tts must be a first-class canvas node type
# ---------------------------------------------------------------------------

class TestTtsNodeTypeCoverage:
    def test_tts_in_schema_and_all_types(self):
        assert "tts" in canvas.NODE_TYPE_SCHEMA
        assert "tts" in canvas.CanvasProvider._ALL_NODE_TYPES

    def test_every_schema_type_appears_in_create_enum(self):
        defs = canvas._build_canvas_tool_defs(list(canvas.NODE_TYPE_SCHEMA.keys()))
        create = next(d for d in defs if d["function"]["name"] == "create_canvas_node")
        enum = create["function"]["parameters"]["properties"]["node_type"]["enum"]
        assert set(enum) == set(canvas.NODE_TYPE_SCHEMA.keys())

    def test_tts_summary_includes_name(self):
        node = _FakeNode("t1", "tts", 0.0, 0.0, 420, 300)
        node.data = {"name": "Voice 1", "audioUrl": "/media/a.wav", "text": "hi"}
        summary = canvas._node_summary(node)
        assert summary["name"] == "Voice 1"

    async def test_arrange_moves_tts_nodes(self, monkeypatch):
        async def _noop(_db):
            return None
        monkeypatch.setattr(canvas, "safe_commit", _noop)
        nodes = [
            _FakeNode("t1", "tts", 700.0, 700.0, 420, 300),
            _FakeNode("a1", "audio", 700.0, 700.0, 420, 300),
        ]
        result = await canvas._exec_arrange_nodes(
            {}, "th1", ["tts", "audio"], _FakeDB(nodes)
        )
        payload = json.loads(result)
        assert payload["arranged"] == 2
        assert nodes[0].position_x == canvas._GRID_ORIGIN_X
        assert nodes[0].position_y == canvas._GRID_ORIGIN_Y
