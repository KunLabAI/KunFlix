"""
tool_manager — unified tool management module.

Provides:
- ToolManager: central registry, discovery, and dispatch
- ToolContext: unified context for tool operations
- ToolProvider: protocol for pluggable tool providers

Constants re-exported for backward compatibility:
- CANVAS_TOOL_NAMES (set alias)
- IMAGE_GEN_TOOL_NAME
"""
from services.tool_manager.context import ToolContext
from services.tool_manager.manager import ToolManager
from services.tool_manager.protocol import ToolProvider
from services.tool_manager.providers.canvas import CANVAS_TOOL_NAMES_SET
from services.tool_manager.providers.image_gen import IMAGE_GEN_TOOL_NAME

# Backward-compatible alias (old code used a plain set named CANVAS_TOOL_NAMES)
CANVAS_TOOL_NAMES = CANVAS_TOOL_NAMES_SET

__all__ = [
    "ToolManager",
    "ToolContext",
    "ToolProvider",
    "CANVAS_TOOL_NAMES",
    "IMAGE_GEN_TOOL_NAME",
]
