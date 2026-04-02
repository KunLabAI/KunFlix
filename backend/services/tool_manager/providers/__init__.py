"""
providers — register all tool providers.
"""
from services.tool_manager.providers.canvas import CanvasProvider
from services.tool_manager.providers.image_gen import ImageGenProvider
from services.tool_manager.providers.image_edit import ImageEditProvider
from services.tool_manager.providers.video_gen import VideoGenProvider
from services.tool_manager.providers.video_edit import VideoEditProvider

ALL_PROVIDERS = [
    CanvasProvider(),
    ImageGenProvider(),
    ImageEditProvider(),
    VideoGenProvider(),
    VideoEditProvider(),
]

__all__ = [
    "ALL_PROVIDERS",
    "CanvasProvider",
    "ImageGenProvider",
    "ImageEditProvider",
    "VideoGenProvider",
    "VideoEditProvider",
]
