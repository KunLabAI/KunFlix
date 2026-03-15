"""
视频生成模型能力配置

定义每个视频生成模型支持的参数和能力。
"""
from typing import Dict, List, TypedDict


class VideoModelCapabilities(TypedDict):
    """视频模型能力配置"""
    provider: str
    modes: List[str]
    durations: List[int]
    resolutions: List[str]
    supports_first_frame: bool
    supports_last_frame: bool
    supports_prompt_optimizer: bool
    supports_fast_pretreatment: bool
    aspect_ratios: List[str]


# 视频生成模型能力配置表
VIDEO_MODEL_CAPABILITIES: Dict[str, VideoModelCapabilities] = {
    # =========================================================================
    # MiniMax 模型
    # =========================================================================
    
    # MiniMax-Hailuo-2.3: 多功能模型，支持 T2V 和 I2V
    "MiniMax-Hailuo-2.3": {
        "provider": "minimax",
        "modes": ["text_to_video", "image_to_video"],
        "durations": [6, 10],
        "resolutions": ["768p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": False,
        "supports_prompt_optimizer": True,
        "supports_fast_pretreatment": True,
        "aspect_ratios": ["16:9", "9:16", "1:1"],
    },
    
    # MiniMax-Hailuo-2.3-Fast: I2V 专用模型，仅支持图片生成视频
    "MiniMax-Hailuo-2.3-Fast": {
        "provider": "minimax",
        "modes": ["image_to_video"],  # 仅支持图片生成
        "durations": [6, 10],
        "resolutions": ["768p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": False,
        "supports_prompt_optimizer": True,
        "supports_fast_pretreatment": True,
        "aspect_ratios": ["16:9", "9:16", "1:1"],
    },
    
    # MiniMax-Hailuo-02: 多功能模型，支持首尾帧
    "MiniMax-Hailuo-02": {
        "provider": "minimax",
        "modes": ["text_to_video", "image_to_video"],
        "durations": [6, 10],
        "resolutions": ["512p", "768p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": True,  # 支持首尾帧
        "supports_prompt_optimizer": True,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "1:1"],
    },
    
    # T2V-01: 纯文本生成视频
    "T2V-01": {
        "provider": "minimax",
        "modes": ["text_to_video"],
        "durations": [6],
        "resolutions": ["720p"],
        "supports_first_frame": False,
        "supports_last_frame": False,
        "supports_prompt_optimizer": True,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "1:1"],
    },
    
    # T2V-01-Director: 纯文本生成视频，支持镜头控制
    "T2V-01-Director": {
        "provider": "minimax",
        "modes": ["text_to_video"],
        "durations": [6],
        "resolutions": ["720p"],
        "supports_first_frame": False,
        "supports_last_frame": False,
        "supports_prompt_optimizer": True,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "1:1"],
    },
    
    # I2V-01: 图片生成视频
    "I2V-01": {
        "provider": "minimax",
        "modes": ["image_to_video"],
        "durations": [6],
        "resolutions": ["720p"],
        "supports_first_frame": True,
        "supports_last_frame": False,
        "supports_prompt_optimizer": True,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "1:1"],
    },
    
    # I2V-01-Director: 图片生成视频，支持镜头控制
    "I2V-01-Director": {
        "provider": "minimax",
        "modes": ["image_to_video"],
        "durations": [6],
        "resolutions": ["720p"],
        "supports_first_frame": True,
        "supports_last_frame": False,
        "supports_prompt_optimizer": True,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "1:1"],
    },
    
    # I2V-01-live: 图片生成视频，支持动态效果
    "I2V-01-live": {
        "provider": "minimax",
        "modes": ["image_to_video"],
        "durations": [6],
        "resolutions": ["720p"],
        "supports_first_frame": True,
        "supports_last_frame": False,
        "supports_prompt_optimizer": True,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "1:1"],
    },
    
    # S2V-01: 主题参考生成视频
    "S2V-01": {
        "provider": "minimax",
        "modes": ["subject_reference"],
        "durations": [6],
        "resolutions": ["720p"],
        "supports_first_frame": False,
        "supports_last_frame": False,
        "supports_prompt_optimizer": True,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "1:1"],
    },
    
    # =========================================================================
    # xAI 模型
    # =========================================================================
    
    # Grok Imagine Video: xAI 视频生成模型
    "grok-imagine-video": {
        "provider": "xai",
        "modes": ["text_to_video", "image_to_video", "edit"],
        "durations": list(range(1, 16)),  # 1-15 秒
        "resolutions": ["480p", "720p"],
        "supports_first_frame": True,
        "supports_last_frame": False,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "1:1"],
    },
}


def get_model_capabilities(model_name: str) -> VideoModelCapabilities | None:
    """获取指定模型的能力配置"""
    return VIDEO_MODEL_CAPABILITIES.get(model_name)


def get_supported_models() -> List[str]:
    """获取所有支持的模型列表"""
    return list(VIDEO_MODEL_CAPABILITIES.keys())


def get_models_by_provider(provider: str) -> List[str]:
    """获取指定供应商的所有模型"""
    return [
        model for model, caps in VIDEO_MODEL_CAPABILITIES.items()
        if caps["provider"] == provider
    ]
