"""
providers — register all tool providers.
"""
from services.tool_manager.providers.canvas import CanvasProvider
from services.tool_manager.providers.image_gen import ImageGenProvider
from services.tool_manager.providers.image_edit import ImageEditProvider

ALL_PROVIDERS = [CanvasProvider(), ImageGenProvider(), ImageEditProvider()]

__all__ = [
    "ALL_PROVIDERS",
    "CanvasProvider",
    "ImageGenProvider",
    "ImageEditProvider",
]
