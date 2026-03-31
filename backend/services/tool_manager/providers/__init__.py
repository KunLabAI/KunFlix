"""
providers — register all tool providers.
"""
from services.tool_manager.providers.canvas import CanvasProvider
from services.tool_manager.providers.image_gen import ImageGenProvider

ALL_PROVIDERS = [CanvasProvider(), ImageGenProvider()]

__all__ = [
    "ALL_PROVIDERS",
    "CanvasProvider",
    "ImageGenProvider",
]
