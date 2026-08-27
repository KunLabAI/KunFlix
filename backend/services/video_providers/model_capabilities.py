"""
视频生成模型能力配置

定义每个视频生成模型支持的参数和能力。
"""
from typing import Dict, List, TypedDict


class _VideoModelCapabilitiesBase(TypedDict):
    """视频模型能力配置 — 所有模型必填项"""
    provider: str
    modes: List[str]
    durations: List[int]
    resolutions: List[str]
    supports_first_frame: bool
    supports_last_frame: bool
    supports_reference_images: bool
    supports_video_extension: bool
    supports_video_edit: bool
    supports_audio: bool
    max_reference_images: int
    supports_prompt_optimizer: bool
    supports_fast_pretreatment: bool
    aspect_ratios: List[str]


class VideoModelCapabilities(_VideoModelCapabilitiesBase, total=False):
    """视频模型能力配置 — 含仅部分模型声明的可选能力"""
    supports_reference_videos: bool
    max_reference_videos: int
    supports_reference_audios: bool
    max_reference_audios: int
    supports_reference_files: bool  # 文件参考生视频 (Wan3.0)
    supports_reference_links: bool  # 网页链接参考生视频 (Wan3.0)
    supports_return_last_frame: bool
    supports_web_search: bool
    supports_auto_duration: bool


# 视频生成模型能力配置表
VIDEO_MODEL_CAPABILITIES: Dict[str, VideoModelCapabilities] = {
    # =========================================================================
    # MiniMax 模型
    # =========================================================================
    
    # MiniMax-H3 (Hailuo-03): v2 多模态接口 — T2V / I2V(首尾帧) / 多模态参考, 2K 输出, 4-15 秒
    "MiniMax-H3": {
        "provider": "minimax",
        "modes": ["text_to_video", "image_to_video", "reference_images"],
        "durations": list(range(4, 16)),  # 4-15 秒
        "resolutions": ["2k"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": True,
        "supports_reference_videos": True,
        "max_reference_videos": 3,
        "supports_reference_audios": True,
        "max_reference_audios": 3,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": True,
        "max_reference_images": 9,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        # adaptive 由输入素材决定; 文生视频场景适配器会把 adaptive 归一到 16:9
        "aspect_ratios": ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9", "adaptive"],
    },
    
    # MiniMax-Hailuo-2.3: 多功能模型，支持 T2V 和 I2V
    "MiniMax-Hailuo-2.3": {
        "provider": "minimax",
        "modes": ["text_to_video", "image_to_video"],
        "durations": [6, 10],
        "resolutions": ["768p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": False,
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
        "supports_prompt_optimizer": True,
        "supports_fast_pretreatment": True,
        "aspect_ratios": ["16:9", "9:16", "1:1"],
    },
    
    # MiniMax-Hailuo-2.3-Fast: I2V 专用模型，仅支持图片生成视频
    "MiniMax-Hailuo-2.3-Fast": {
        "provider": "minimax",
        "modes": ["image_to_video"],
        "durations": [6, 10],
        "resolutions": ["768p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": False,
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
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
        "supports_last_frame": True,
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
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
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
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
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
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
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
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
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
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
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
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
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
        "supports_prompt_optimizer": True,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "1:1"],
    },
    
    # =========================================================================
    # xAI (Grok) 模型
    # =========================================================================
    
    # Grok Imagine Video: T2V, I2V, 参考图片, 视频编辑, 视频扩展
    "grok-imagine-video": {
        "provider": "xai",
        "modes": ["text_to_video", "image_to_video", "reference_images", "edit", "video_extension"],
        "durations": list(range(1, 16)),  # 1-15 秒 (生成); 编辑不支持自定义时长; 扩展 2-10 秒
        "resolutions": ["480p", "720p"],
        "supports_first_frame": True,
        "supports_last_frame": False,
        "supports_reference_images": True,
        "supports_video_extension": True,
        "supports_video_edit": True,
        "supports_audio": False,
        "max_reference_images": 3,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"],
    },
    
    # =========================================================================
    # Gemini Veo 模型
    # =========================================================================
    
    # Veo 3.1 Preview: 原生音频, T2V, I2V, 首尾帧, 参考图片, 视频扩展
    "veo-3.1-generate-preview": {
        "provider": "gemini",
        "modes": ["text_to_video", "image_to_video", "reference_images", "video_extension"],
        "durations": [4, 6, 8],
        "resolutions": ["720p", "1080p", "4k"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": True,
        "supports_video_extension": True,
        "supports_video_edit": False,
        "supports_audio": True,
        "max_reference_images": 3,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16"],
    },
    
    # Veo 3.1 Fast Preview: 快速版本, 与 3.1 同等能力
    "veo-3.1-fast-generate-preview": {
        "provider": "gemini",
        "modes": ["text_to_video", "image_to_video", "reference_images", "video_extension"],
        "durations": [4, 6, 8],
        "resolutions": ["720p", "1080p", "4k"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": True,
        "supports_video_extension": True,
        "supports_video_edit": False,
        "supports_audio": True,
        "max_reference_images": 3,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16"],
    },
    
    # Veo 3.1 Lite Preview: 轻量版, 无参考图片, 无视频扩展, 无 4k
    "veo-3.1-lite-generate-preview": {
        "provider": "gemini",
        "modes": ["text_to_video", "image_to_video"],
        "durations": [4, 6, 8],
        "resolutions": ["720p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": True,
        "max_reference_images": 0,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16"],
    },
    
    # Veo 3.0: 稳定版, T2V/I2V, 原生音频, 仅 8 秒
    "veo-3.0-generate-001": {
        "provider": "gemini",
        "modes": ["text_to_video", "image_to_video"],
        "durations": [8],
        "resolutions": ["720p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": True,
        "max_reference_images": 0,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16"],
    },
    
    # Veo 3.0 Fast: 快速稳定版
    "veo-3.0-fast-generate-001": {
        "provider": "gemini",
        "modes": ["text_to_video", "image_to_video"],
        "durations": [8],
        "resolutions": ["720p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": True,
        "max_reference_images": 0,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16"],
    },
    
    # Veo 2.0: 基础版本, 无声
    "veo-2.0-generate-001": {
        "provider": "gemini",
        "modes": ["text_to_video", "image_to_video"],
        "durations": [5, 6, 8],
        "resolutions": ["720p"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16"],
    },
    
    # =========================================================================
    # 火山方舟 Seedance 模型
    # =========================================================================
    
    # Seedance 2.0: T2V, I2V, 首尾帧, 多模态参考(图/视频/音频), 编辑, 延长, 有声视频
    "doubao-seedance-2-0-260128": {
        "provider": "ark",
        "modes": ["text_to_video", "image_to_video", "reference_images", "video_extension"],
        "durations": [-1] + list(range(4, 16)),  # -1 智能选时长, 4-15 秒
        "resolutions": ["480p", "720p"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": True,
        "supports_reference_videos": True,
        "max_reference_videos": 3,
        "supports_reference_audios": True,
        "max_reference_audios": 3,
        "supports_video_extension": True,
        "supports_video_edit": True,
        "supports_audio": True,
        "max_reference_images": 9,
        "supports_return_last_frame": True,
        "supports_web_search": True,
        "supports_auto_duration": True,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9", "adaptive"],
    },
    
    # Seedance 2.0 Fast: 快速版, 与 2.0 同等能力
    "doubao-seedance-2-0-fast-260128": {
        "provider": "ark",
        "modes": ["text_to_video", "image_to_video", "reference_images", "video_extension"],
        "durations": [-1] + list(range(4, 16)),
        "resolutions": ["480p", "720p"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": True,
        "supports_reference_videos": True,
        "max_reference_videos": 3,
        "supports_reference_audios": True,
        "max_reference_audios": 3,
        "supports_video_extension": True,
        "supports_video_edit": True,
        "supports_audio": True,
        "max_reference_images": 9,
        "supports_return_last_frame": True,
        "supports_web_search": True,
        "supports_auto_duration": True,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9", "adaptive"],
    },
    
    # Seedance 1.5 Pro: T2V, I2V, 首尾帧, 有声视频
    "doubao-seedance-1-5-pro-251215": {
        "provider": "ark",
        "modes": ["text_to_video", "image_to_video"],
        "durations": list(range(4, 13)),  # 4-12 秒
        "resolutions": ["480p", "720p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": True,
        "max_reference_images": 0,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
    },
    
    # Seedance 1.0 Pro: T2V, I2V, 首尾帧
    "doubao-seedance-1-0-pro-250801": {
        "provider": "ark",
        "modes": ["text_to_video", "image_to_video"],
        "durations": list(range(2, 13)),  # 2-12 秒
        "resolutions": ["480p", "720p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
    },
    
    # Seedance 1.0 Pro Fast: 快速版, 首帧 + T2V
    "doubao-seedance-1-0-pro-fast-250801": {
        "provider": "ark",
        "modes": ["text_to_video", "image_to_video"],
        "durations": list(range(2, 13)),
        "resolutions": ["480p", "720p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": False,
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
    },
    
    # Seedance 1.0 Lite T2V: 纯文本生成视频
    "doubao-seedance-1-0-lite-t2v": {
        "provider": "ark",
        "modes": ["text_to_video"],
        "durations": list(range(2, 13)),
        "resolutions": ["480p", "720p"],
        "supports_first_frame": False,
        "supports_last_frame": False,
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
    },
    
    # Seedance 1.0 Lite I2V: 首帧, 首尾帧, 参考图 (1-4张)
    "doubao-seedance-1-0-lite-i2v": {
        "provider": "ark",
        "modes": ["text_to_video", "image_to_video", "reference_images"],
        "durations": list(range(2, 13)),
        "resolutions": ["480p", "720p"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": True,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 4,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
    },

    # =========================================================================
    # 阿里云 DashScope 百炼 HappyHorse 模型
    # =========================================================================

    # HappyHorse 1.0 T2V: 文生视频
    "happyhorse-1.0-t2v": {
        "provider": "dashscope",
        "modes": ["text_to_video"],
        "durations": list(range(3, 16)),  # 3-15 秒
        "resolutions": ["720p", "1080p"],
        "supports_first_frame": False,
        "supports_last_frame": False,
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4"],
    },

    # HappyHorse 1.0 I2V: 图生视频 (首帧)
    "happyhorse-1.0-i2v": {
        "provider": "dashscope",
        "modes": ["image_to_video"],
        "durations": list(range(3, 16)),
        "resolutions": ["720p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": False,
        "supports_reference_images": False,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 0,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        # 宽高比跟随首帧图像, 此处声明为 adaptive
        "aspect_ratios": ["adaptive"],
    },

    # HappyHorse 1.0 R2V: 参考生视频 (1-9 张参考图)
    "happyhorse-1.0-r2v": {
        "provider": "dashscope",
        "modes": ["reference_images"],
        "durations": list(range(3, 16)),
        "resolutions": ["720p", "1080p"],
        "supports_first_frame": False,
        "supports_last_frame": False,
        "supports_reference_images": True,
        "supports_video_extension": False,
        "supports_video_edit": False,
        "supports_audio": False,
        "max_reference_images": 9,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        "aspect_ratios": ["16:9", "9:16", "1:1", "4:3", "3:4"],
    },

    # HappyHorse 1.0 Video Edit: 视频编辑 (视频 + 0-5 张参考图)
    "happyhorse-1.0-video-edit": {
        "provider": "dashscope",
        "modes": ["edit"],
        "durations": list(range(3, 16)),  # 输出跟随输入视频长度
        "resolutions": ["720p", "1080p"],
        "supports_first_frame": False,
        "supports_last_frame": False,
        "supports_reference_images": True,
        "supports_video_extension": False,
        "supports_video_edit": True,
        "supports_audio": True,
        "max_reference_images": 5,
        "supports_prompt_optimizer": False,
        "supports_fast_pretreatment": False,
        # 宽高比跟随输入视频
        "aspect_ratios": ["adaptive"],
    },

    # =========================================================================
    # 阿里云百炼 Wan3.0 全能参考视频模型 (All-in-One)
    # =========================================================================

    # Wan3.0 Prime (高速版): 能力对齐标准版, 端到端速度显著提升。
    # 统一支持文生视频 / 图生视频(首尾帧) / 多模态参考(图/视频/音频/文件/网页) / 编辑 / 延长,
    # 最长 30 秒 (无视频输入 2-30 秒, -1 智能时长; 有视频输入时输入+输出 ≤ 30 秒), 30fps, 默认有声。
    "wan3.0-video-prime": {
        "provider": "dashscope",
        "modes": ["text_to_video", "image_to_video", "reference_images", "edit", "video_extension"],
        "durations": [-1] + list(range(2, 31)),
        "resolutions": ["480p", "720p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": True,
        "supports_reference_videos": True,
        "max_reference_videos": 5,  # 参考视频总时长 ≤ 15 秒
        "supports_reference_audios": True,
        "max_reference_audios": 5,  # 参考音频总时长 ≤ 15 秒
        "supports_reference_files": True,
        "supports_reference_links": True,
        "supports_video_extension": True,
        "supports_video_edit": True,
        "supports_audio": True,
        "max_reference_images": 10,
        "supports_prompt_optimizer": True,  # 映射 prompt_extend 智能改写
        "supports_fast_pretreatment": False,
        "supports_auto_duration": True,
        "aspect_ratios": ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"],
    },

    # Wan3.0 (标准版): 与高速版同等能力 (全能参考 / 首尾帧 / 编辑 / 延长)
    "wan3.0-video": {
        "provider": "dashscope",
        "modes": ["text_to_video", "image_to_video", "reference_images", "edit", "video_extension"],
        "durations": [-1] + list(range(2, 31)),
        "resolutions": ["480p", "720p", "1080p"],
        "supports_first_frame": True,
        "supports_last_frame": True,
        "supports_reference_images": True,
        "supports_reference_videos": True,
        "max_reference_videos": 5,
        "supports_reference_audios": True,
        "max_reference_audios": 5,
        "supports_reference_files": True,
        "supports_reference_links": True,
        "supports_video_extension": True,
        "supports_video_edit": True,
        "supports_audio": True,
        "max_reference_images": 10,
        "supports_prompt_optimizer": True,
        "supports_fast_pretreatment": False,
        "supports_auto_duration": True,
        "aspect_ratios": ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"],
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
