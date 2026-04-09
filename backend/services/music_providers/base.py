"""
music_providers.base — 音乐生成服务的基础数据类和抽象适配器。
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class MusicContext:
    """音乐生成请求上下文（供应商无关）。"""

    api_key: str
    model: str                                    # lyria-3-clip-preview / lyria-3-pro-preview
    prompt: str
    provider_type: str = "gemini"
    output_format: str = "mp3"                    # mp3 / wav (wav 仅 Pro)
    reference_images: list[dict] = field(default_factory=list)  # [{"url": "data:...", "mime_type": "image/jpeg"}]


@dataclass
class MusicResult:
    """音乐生成结果。"""

    status: str = "completed"                     # completed / failed
    audio_data: bytes = b""                       # 原始音频字节（临时，保存后清空）
    lyrics: str = ""                              # 生成的歌词/结构文本
    mime_type: str = "audio/mp3"                  # audio/mp3 / audio/wav
    error: str = ""


class MusicProviderAdapter(ABC):
    """音乐生成供应商适配器抽象基类。"""

    @abstractmethod
    async def generate(self, ctx: MusicContext) -> MusicResult:
        """执行音乐生成，返回 MusicResult。"""
        ...
