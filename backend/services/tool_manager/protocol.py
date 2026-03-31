"""
ToolProvider Protocol — the contract every tool provider must satisfy.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from services.tool_manager.context import ToolContext


@runtime_checkable
class ToolProvider(Protocol):
    """Describes a pluggable tool category (base, canvas, image-gen, ...)."""

    @property
    def tool_names(self) -> frozenset[str]:
        """Tool names this provider handles (used for dispatch routing)."""
        ...

    async def build_defs(self, ctx: ToolContext) -> list[dict]:
        """Return OpenAI-format tool definitions for the current context.

        Return ``[]`` when this provider is not applicable.
        """
        ...

    async def execute(self, name: str, args: dict, ctx: ToolContext) -> str:
        """Execute *name* with *args* and return the result string."""
        ...

    def rebuild_defs(self, ctx: ToolContext) -> list[dict] | None:
        """Re-build definitions after a tool round if needed.

        Return ``None`` when nothing changed (ToolManager reuses cached defs).
        """
        ...

    def get_tool_metadata(self) -> list[dict]:
        """Return simplified metadata for admin registry display.

        Each dict has ``name``, ``description``, ``parameters``.
        """
        ...
