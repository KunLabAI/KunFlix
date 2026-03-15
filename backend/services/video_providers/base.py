"""
视频生成供应商适配器基类

定义统一接口，所有供应商适配器必须实现此接口。
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, ClassVar
import logging

logger = logging.getLogger(__name__)


@dataclass
class VideoContext:
    """视频生成请求上下文 (供应商无关)"""
    api_key: str
    model: str
    prompt: str
    provider_type: str = "xai"  # xai / minimax
    image_url: str | None = None  # 首帧图片
    last_frame_image: str | None = None  # 尾帧图片 (MiniMax 支持)
    duration: int = 6  # 秒
    quality: str = "720p"  # 480p / 720p / 768P / 1080P
    aspect_ratio: str = "16:9"
    mode: str = "normal"  # 前端保留字段
    video_mode: str = "text_to_video"  # text_to_video / image_to_video / edit
    # MiniMax 特有配置
    prompt_optimizer: bool = True
    fast_pretreatment: bool = False
    # 主题参考 (MiniMax S2V-01)
    subject_reference: List[Dict] = field(default_factory=list)


@dataclass
class VideoResult:
    """视频生成结果 (供应商无关)"""
    task_id: str = ""  # 供应商返回的任务 ID
    status: str = "pending"  # pending / processing / completed / failed
    video_url: str = ""  # 视频下载 URL
    file_id: str = ""  # MiniMax 返回的文件 ID
    duration_seconds: float = 0
    video_width: int = 0
    video_height: int = 0
    error: str = ""


class VideoProviderAdapter(ABC):
    """
    视频生成供应商适配器抽象基类
    
    所有供应商适配器必须实现以下方法:
    - submit: 提交视频生成任务
    - poll: 轮询任务状态
    - get_video_url: 获取视频下载链接 (部分供应商需要)
    """
    
    # 子类需定义支持的模型列表
    SUPPORTED_MODELS: ClassVar[List[str]] = []
    
    # 子类需定义状态映射表
    STATUS_MAP: ClassVar[Dict[str, str]] = {}
    
    @classmethod
    def supports_model(cls, model: str) -> bool:
        """检查是否支持指定模型"""
        return any(model.startswith(m) or model == m for m in cls.SUPPORTED_MODELS)
    
    @abstractmethod
    async def submit(self, ctx: VideoContext) -> VideoResult:
        """
        提交视频生成任务
        
        Args:
            ctx: 视频生成上下文
            
        Returns:
            VideoResult: 包含任务 ID 的结果
        """
        pass
    
    @abstractmethod
    async def poll(self, task_id: str) -> VideoResult:
        """
        轮询任务状态
        
        Args:
            task_id: 供应商返回的任务 ID
            
        Returns:
            VideoResult: 包含最新状态的结果
        """
        pass
    
    async def get_video_url(self, file_id: str) -> str:
        """
        获取视频下载链接
        
        部分供应商 (如 MiniMax) 需要额外调用 API 获取下载链接。
        xAI 等供应商直接在 poll 结果中返回 URL，无需实现此方法。
        
        Args:
            file_id: 文件 ID
            
        Returns:
            str: 视频下载 URL
        """
        return ""
    
    def _map_status(self, raw_status: str) -> str:
        """将供应商状态映射为内部状态"""
        return self.STATUS_MAP.get(raw_status, "pending")
