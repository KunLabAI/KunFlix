"""
ToolManager — unified tool registry, discovery, and dispatch.

Replaces the scattered tool assembly in chat_generation.py / admin_debug.py
and the manual dispatch in chat_tool_dispatch.py.

NOTE: Skills (load_skill) are a peer-level concept and NOT managed here.
Skill orchestration (prompt injection, tool def, enum shrinking) is handled
independently at the chat generation / admin_debug layer.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from services.tool_manager.context import ToolContext
    from services.tool_manager.protocol import ToolProvider

logger = logging.getLogger(__name__)


class ToolManager:
    """Central coordinator for all tool providers."""

    def __init__(self, providers: list[ToolProvider] | None = None) -> None:
        from services.tool_manager.providers import ALL_PROVIDERS
        self._providers: list[ToolProvider] = providers or list(ALL_PROVIDERS)
        self._dispatch_map: dict[str, ToolProvider] = {}
        self._cached_defs: list[dict] | None = None

        # Build dispatch map
        for provider in self._providers:
            for name in provider.tool_names:
                assert name not in self._dispatch_map, f"Duplicate tool name: {name}"
                self._dispatch_map[name] = provider

    # ------------------------------------------------------------------
    # Tool definitions
    # ------------------------------------------------------------------

    async def build_tool_defs(self, ctx: ToolContext) -> list[dict] | None:
        """Build all applicable tool definitions for the current context.

        Returns ``None`` when no tools should be enabled.
        """
        all_defs: list[dict] = []
        for provider in self._providers:
            all_defs.extend(await provider.build_defs(ctx))

        self._cached_defs = all_defs or None
        return self._cached_defs

    def rebuild_after_round(self, ctx: ToolContext) -> list[dict] | None:
        """Rebuild tool definitions after a tool execution round.

        Returns cached defs when nothing changed (static providers always
        return ``None`` from ``rebuild_defs``).
        """
        # Collect rebuild results from all providers (call each exactly once)
        rebuild_results: dict[int, list[dict] | None] = {
            i: p.rebuild_defs(ctx) for i, p in enumerate(self._providers)
        }
        changed = any(v is not None for v in rebuild_results.values())
        return self._cached_defs if not changed else self._splice_defs(rebuild_results)

    def _splice_defs(self, rebuild_results: dict[int, list[dict] | None]) -> list[dict] | None:
        """Replace changed provider segments in the cached tool defs list."""
        changed_tool_names: set[str] = set()
        new_defs_to_append: list[dict] = []
        for i, new_defs in rebuild_results.items():
            (new_defs is not None) and changed_tool_names.update(self._providers[i].tool_names)
            (new_defs is not None) and new_defs_to_append.extend(new_defs)

        kept_defs = [
            d for d in (self._cached_defs or [])
            if d.get("function", {}).get("name") not in changed_tool_names
        ]
        all_defs = kept_defs + new_defs_to_append
        self._cached_defs = all_defs or None
        return self._cached_defs

    # ------------------------------------------------------------------
    # Tool execution
    # ------------------------------------------------------------------

    async def execute_tool(self, name: str, args: dict, ctx: ToolContext) -> str:
        """Dispatch tool execution by name (O(1) lookup)."""
        provider = self._dispatch_map.get(name)
        return await provider.execute(name, args, ctx) if provider else f"Unknown tool: {name}"

    # ------------------------------------------------------------------
    # Registry (admin)
    # ------------------------------------------------------------------

    def get_registry(self) -> list[dict]:
        """Return provider + tool metadata for the admin registry API."""
        return [
            {
                "provider_name": type(p).__name__,
                "display_name": getattr(p, "display_name", type(p).__name__),
                "description": getattr(p, "description", ""),
                "condition": getattr(p, "condition", ""),
                "tools": p.get_tool_metadata(),
            }
            for p in self._providers
        ]
