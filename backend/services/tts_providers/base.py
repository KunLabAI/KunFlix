"""
tts_providers.base — TTS 语音合成服务的基础数据类和抽象适配器。
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class TTSSpeaker:
    """多说话人配置中的一个角色。"""

    speaker: str                                    # 角色名（与文本中说话人标签对应）
    voice: str = ""                                 # 音色名（预置音色 / voice_... 自定义音色 ID）
    text: str = ""                                  # 该角色的台词文本
    style: str = ""                                 # 该角色的语气风格（可选）


@dataclass
class TTSContext:
    """TTS 生成请求上下文（供应商无关）。"""

    api_key: str
    model: str                                    # gemini-3.8-flash-tts / gemini-3.8-flash-lite-tts ...
    text: str                                     # 单说话人模式的逐字朗读文本
    provider_type: str = "gemini"
    voice: str = ""                                # 单说话人音色（空 = 自动，由模型自行选择）
    style: str = ""                               # 语气/风格描述（speech_metadata.style）
    speakers: list[TTSSpeaker] = field(default_factory=list)  # 多说话人配置（非空时启用 conversational 模式）
    output_mime: str = "audio/wav"                # audio/wav / audio/l16
    sample_rate: int = 24000                      # 24000 / 16000 / 8000


@dataclass
class TTSResult:
    """TTS 生成结果。"""

    status: str = "completed"                     # completed / failed
    audio_data: bytes = b""                       # WAV 音频字节（临时，保存后清空）
    mime_type: str = "audio/wav"
    error: str = ""


class TTSProviderAdapter(ABC):
    """TTS 供应商适配器抽象基类。"""

    @abstractmethod
    async def generate(self, ctx: TTSContext) -> TTSResult:
        """执行语音合成，返回 TTSResult。"""
        ...
