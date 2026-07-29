"""P1-3 integration tests for ToolManager × security.permission.

验证 ``ToolManager.execute_tool`` 会在 dispatch 前调用
``check_tool_permission``，EXPLORE 模式下写工具被拒绝且返回结构化 error 字符串，
BYPASS/DEFAULT 模式下正常放行。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from unittest.mock import AsyncMock

import pytest

from services.tool_manager.manager import ToolManager


# =============================================================================
# Fake ToolProvider —— 只实现 execute，其他方法返回空
# =============================================================================


class _FakeToolProvider:
    """满足 ToolProvider 协议的最小实现，用于隔离测试。"""

    display_name = "FakeProvider"
    description = "test-only"
    condition = "always"

    def __init__(self, names: set[str]):
        self._names = frozenset(names)
        self.executed_names: list[str] = []

    @property
    def tool_names(self) -> frozenset[str]:
        return self._names

    async def build_defs(self, ctx):
        return []

    async def execute(self, name: str, args: dict, ctx) -> str:
        self.executed_names.append(name)
        return f"ok:{name}"

    def rebuild_defs(self, ctx):
        return None

    def get_tool_metadata(self):
        return []


@dataclass
class _FakeCtx:
    """裸的 ToolContext 替身，只提供 permission_mode 字段。"""

    permission_mode: str = "default"


# =============================================================================
# Tests
# =============================================================================


class TestToolManagerPermissionGate:
    def _make_manager(self):
        provider = _FakeToolProvider({
            "list_canvas_nodes",     # 只读白名单
            "get_canvas_node",       # 只读白名单
            "create_canvas_node",    # 写
            "generate_image",        # 写
        })
        # 传入自定义 providers 列表可跳过默认 providers（避免拉起真实依赖）
        manager = ToolManager(providers=[provider])
        return manager, provider

    async def test_default_mode_allows_write(self):
        manager, provider = self._make_manager()
        ctx = _FakeCtx(permission_mode="default")
        result = await manager.execute_tool("generate_image", {}, ctx)
        assert result == "ok:generate_image"
        assert provider.executed_names == ["generate_image"]

    async def test_bypass_mode_allows_write(self):
        manager, provider = self._make_manager()
        ctx = _FakeCtx(permission_mode="bypass")
        result = await manager.execute_tool("create_canvas_node", {}, ctx)
        assert result == "ok:create_canvas_node"
        assert provider.executed_names == ["create_canvas_node"]

    async def test_explore_mode_allows_read_only_whitelist(self):
        manager, provider = self._make_manager()
        ctx = _FakeCtx(permission_mode="explore")
        result = await manager.execute_tool("list_canvas_nodes", {}, ctx)
        assert result == "ok:list_canvas_nodes"
        assert provider.executed_names == ["list_canvas_nodes"]

    async def test_explore_mode_denies_write_and_provider_not_dispatched(self):
        manager, provider = self._make_manager()
        ctx = _FakeCtx(permission_mode="explore")
        result = await manager.execute_tool("generate_image", {}, ctx)
        # 返回结构化 error，且 provider.execute 未被调用
        assert result.startswith("[permission_denied]")
        assert "generate_image" in result
        assert provider.executed_names == [], "Provider must NOT be dispatched when denied"

    async def test_explore_mode_denies_create_canvas(self):
        manager, provider = self._make_manager()
        ctx = _FakeCtx(permission_mode="explore")
        result = await manager.execute_tool("create_canvas_node", {}, ctx)
        assert result.startswith("[permission_denied]")
        assert provider.executed_names == []

    async def test_missing_permission_mode_falls_back_to_default(self):
        manager, provider = self._make_manager()
        # 用一个没有 permission_mode 属性的 ctx —— getattr 兜底 "default"
        class _MinimalCtx:
            pass
        ctx = _MinimalCtx()
        result = await manager.execute_tool("generate_image", {}, ctx)
        assert result == "ok:generate_image"

    async def test_unknown_tool_returns_unknown_message(self):
        manager, _provider = self._make_manager()
        ctx = _FakeCtx(permission_mode="default")
        result = await manager.execute_tool("nonexistent_tool", {}, ctx)
        # DEFAULT 下 permission 放行，但 dispatch_map miss → 返回 "Unknown tool"
        assert "Unknown tool" in result
