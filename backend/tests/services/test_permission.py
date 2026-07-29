"""P1-3 unit tests for security.permission —— 极简权限决策。

覆盖：
- PermissionMode / PermissionBehavior / PermissionDecision 基础语义
- _coerce_mode 各种输入（str / enum / None / 未知值 → 兜底）
- check_tool_permission 三档 mode × 白名单命中/未命中
- PermissionDecision.as_error_message / denied 属性
"""
from __future__ import annotations

import pytest

from security.permission import (
    PermissionBehavior,
    PermissionDecision,
    PermissionMode,
    READ_ONLY_TOOLS,
    check_tool_permission,
    _coerce_mode,
)


# =============================================================================
# 枚举 & 数据类基础
# =============================================================================


class TestPermissionEnums:
    def test_mode_values(self):
        assert PermissionMode.EXPLORE.value == "explore"
        assert PermissionMode.DEFAULT.value == "default"
        assert PermissionMode.BYPASS.value == "bypass"

    def test_mode_is_str_enum(self):
        # 便于 DB / JSON 存取
        assert PermissionMode.EXPLORE == "explore"
        assert isinstance(PermissionMode.EXPLORE, str)

    def test_behavior_values(self):
        assert PermissionBehavior.ALLOW.value == "allow"
        assert PermissionBehavior.DENY.value == "deny"


class TestPermissionDecision:
    def test_allow_not_denied(self):
        d = PermissionDecision(behavior=PermissionBehavior.ALLOW, reason="ok")
        assert d.denied is False

    def test_deny_flag(self):
        d = PermissionDecision(behavior=PermissionBehavior.DENY, reason="blocked")
        assert d.denied is True

    def test_error_message_format(self):
        d = PermissionDecision(behavior=PermissionBehavior.DENY, reason="not allowed")
        msg = d.as_error_message("generate_image")
        assert "[permission_denied]" in msg
        assert "generate_image" in msg
        assert "not allowed" in msg

    def test_frozen(self):
        # frozen=True 保证决策不可变
        d = PermissionDecision(behavior=PermissionBehavior.ALLOW)
        with pytest.raises(Exception):
            d.behavior = PermissionBehavior.DENY  # type: ignore[misc]


# =============================================================================
# _coerce_mode —— 输入归一
# =============================================================================


class TestCoerceMode:
    def test_from_enum(self):
        assert _coerce_mode(PermissionMode.EXPLORE) == PermissionMode.EXPLORE

    def test_from_string_lowercase(self):
        assert _coerce_mode("explore") == PermissionMode.EXPLORE
        assert _coerce_mode("default") == PermissionMode.DEFAULT
        assert _coerce_mode("bypass") == PermissionMode.BYPASS

    def test_from_string_uppercase_normalized(self):
        # _coerce_mode 使用 lower() 归一化
        assert _coerce_mode("EXPLORE") == PermissionMode.EXPLORE

    def test_none_fallback_to_default(self):
        assert _coerce_mode(None) == PermissionMode.DEFAULT

    def test_empty_string_fallback_to_default(self):
        assert _coerce_mode("") == PermissionMode.DEFAULT

    def test_unknown_fallback_to_default(self):
        # 未知策略字符串必须走默认，避免异常传播
        assert _coerce_mode("unknown_mode") == PermissionMode.DEFAULT


# =============================================================================
# check_tool_permission —— 核心决策矩阵
# =============================================================================


class TestCheckToolPermission:
    # ---- BYPASS ----

    def test_bypass_allows_any_tool(self):
        d = check_tool_permission("bypass", "generate_image")
        assert d.behavior == PermissionBehavior.ALLOW
        assert "bypass" in d.reason.lower()

    def test_bypass_allows_read_only_tool(self):
        d = check_tool_permission("bypass", "list_canvas_nodes")
        assert d.behavior == PermissionBehavior.ALLOW

    def test_bypass_allows_write_tool(self):
        d = check_tool_permission("bypass", "delete_canvas_node")
        assert d.behavior == PermissionBehavior.ALLOW

    # ---- EXPLORE ----

    def test_explore_allows_read_only_whitelist(self):
        for tool in READ_ONLY_TOOLS:
            d = check_tool_permission("explore", tool)
            assert d.behavior == PermissionBehavior.ALLOW, f"tool {tool} should be allowed"

    def test_explore_denies_write_tools(self):
        for tool in ["generate_image", "edit_image", "create_canvas_node",
                     "update_canvas_node", "delete_canvas_node", "generate_video",
                     "generate_music"]:
            d = check_tool_permission("explore", tool)
            assert d.behavior == PermissionBehavior.DENY, f"tool {tool} should be denied"
            assert tool in d.reason
            assert "explore" in d.reason.lower()

    def test_explore_denies_unknown_tool(self):
        d = check_tool_permission("explore", "some_new_write_tool")
        assert d.behavior == PermissionBehavior.DENY

    # ---- DEFAULT ----

    def test_default_allows_all_via_delegation(self):
        # DEFAULT 委托给 skill_gate + tool 内部检查；本层不额外拦截
        d = check_tool_permission("default", "generate_image")
        assert d.behavior == PermissionBehavior.ALLOW
        assert "default" in d.reason.lower()

    def test_default_allows_read_only(self):
        d = check_tool_permission("default", "list_canvas_nodes")
        assert d.behavior == PermissionBehavior.ALLOW

    # ---- None / 未知输入 ----

    def test_none_mode_treated_as_default(self):
        d = check_tool_permission(None, "generate_image")
        assert d.behavior == PermissionBehavior.ALLOW

    def test_unknown_mode_treated_as_default(self):
        d = check_tool_permission("nonexistent_mode", "generate_image")
        assert d.behavior == PermissionBehavior.ALLOW

    def test_enum_input_accepted(self):
        # 支持直接传 PermissionMode 枚举而非字符串
        d = check_tool_permission(PermissionMode.EXPLORE, "generate_image")
        assert d.behavior == PermissionBehavior.DENY


# =============================================================================
# 白名单一致性
# =============================================================================


class TestReadOnlyWhitelist:
    def test_whitelist_is_frozenset(self):
        # frozenset 保证运行时不会被意外修改
        assert isinstance(READ_ONLY_TOOLS, frozenset)

    def test_whitelist_contains_canvas_read_ops(self):
        assert "list_canvas_nodes" in READ_ONLY_TOOLS
        assert "get_canvas_node" in READ_ONLY_TOOLS

    def test_whitelist_does_not_include_writes(self):
        # 显式白名单必须不含写操作
        for write_tool in ["create_canvas_node", "update_canvas_node",
                           "delete_canvas_node", "generate_image", "edit_image"]:
            assert write_tool not in READ_ONLY_TOOLS
