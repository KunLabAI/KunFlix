"""
Gemini Veo 视频生成适配器

支持 Google Gemini Veo 系列视频生成模型。

REST 端点:
  提交: POST /v1beta/models/{model}:predictLongRunning
  轮询: GET  /v1beta/{operation_name}
  下载: 从 response.generateVideoResponse.generatedSamples[0].video.uri 获取

模型系列:
  - veo-3.1-generate-preview (T2V, I2V, 首尾帧, 参考图片, 视频扩展, 原生音频)
  - veo-3.1-fast-generate-preview (快速版本)
  - veo-2.0-generate-001 (T2V, I2V, 无声)

API 文档: https://ai.google.dev/gemini-api/docs/video
"""
from __future__ import annotations
from typing import Dict, List, ClassVar, Optional
import logging

import httpx

from .base import VideoProviderAdapter, VideoContext, VideoResult

logger = logging.getLogger(__name__)

_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


class GeminiVeoAdapter(VideoProviderAdapter):
    """Gemini Veo 视频生成适配器"""
    
    SUPPORTED_MODELS: ClassVar[List[str]] = [
        "veo-3.1-generate-preview",
        "veo-3.1-fast-generate-preview",
        "veo-2.0-generate-001",
    ]
    
    STATUS_MAP: ClassVar[Dict[str, str]] = {
        "false": "processing",  # done: false
        "true": "completed",    # done: true
    }
    
    # 分辨率映射: 内部 quality -> Veo resolution
    RESOLUTION_MAP: ClassVar[Dict[str, str]] = {
        "720p": "720p",
        "1080p": "1080p",
        "4k": "4k",
    }
    
    # 宽高比映射
    ASPECT_RATIO_MAP: ClassVar[Dict[str, str]] = {
        "16:9": "16:9",
        "9:16": "9:16",
    }
    
    def __init__(self):
        # 支持原生音频的模型 (Veo 3+)
        self._audio_models = {
            "veo-3.1-generate-preview",
            "veo-3.1-fast-generate-preview",
        }
        # 支持首尾帧的模型 (Veo 3.1+)
        self._first_last_frame_models = {
            "veo-3.1-generate-preview",
            "veo-3.1-fast-generate-preview",
        }
        # 支持参考图片的模型 (Veo 3.1+)
        self._reference_image_models = {
            "veo-3.1-generate-preview",
            "veo-3.1-fast-generate-preview",
        }
        # 支持视频扩展的模型 (Veo 3.1+)
        self._video_extension_models = {
            "veo-3.1-generate-preview",
            "veo-3.1-fast-generate-preview",
        }
    
    async def submit(self, ctx: VideoContext) -> VideoResult:
        """提交视频生成任务"""
        payload = self._build_payload(ctx)
        return await self._call_submit(ctx, payload)
    
    def _build_payload(self, ctx: VideoContext) -> dict:
        """构建 Gemini Veo 请求 payload"""
        # 基础 instances
        instance: Dict = {
            "prompt": ctx.prompt,
        }
        
        # 首帧图片 (图生视频)
        ctx.image_url and instance.update({
            "image": {"imageUrl": ctx.image_url}
        })
        
        # 尾帧图片 (仅 Veo 3.1+)
        supports_last_frame = ctx.model in self._first_last_frame_models
        (supports_last_frame and ctx.last_frame_image) and instance.update({
            "lastFrame": {"imageUrl": ctx.last_frame_image}
        })
        
        # parameters
        parameters: Dict = {}
        
        # 宽高比
        aspect_ratio = self.ASPECT_RATIO_MAP.get(ctx.aspect_ratio, "16:9")
        parameters["aspectRatio"] = aspect_ratio
        
        # 分辨率 (Veo 3.1 支持 720p, 1080p, 4k)
        resolution = self.RESOLUTION_MAP.get(ctx.quality.lower())
        resolution and parameters.update({"resolution": resolution})
        
        # 时长 (4, 6, 8 秒) - 必须是数字类型
        duration = ctx.duration
        duration in (4, 6, 8) and parameters.update({"durationSeconds": duration})
        
        # 构建最终 payload (注意: numberOfVideos 参数不被 Veo 模型支持)
        payload: Dict = {
            "instances": [instance],
            "parameters": parameters,
        }
        
        return payload
    
    async def _call_submit(self, ctx: VideoContext, payload: dict) -> VideoResult:
        """POST /v1beta/models/{model}:predictLongRunning"""
        headers = {
            "x-goog-api-key": ctx.api_key,
            "Content-Type": "application/json",
        }
        
        model = ctx.model
        url = f"{_GEMINI_BASE_URL}/models/{model}:predictLongRunning"
        
        # 日志不打印完整图片数据
        log_payload = self._sanitize_payload_for_logging(payload)
        logger.info(f"Gemini Veo submit — model={model}, payload={log_payload}")
        
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.status_code >= 400 and logger.error(
                    f"Gemini submit error {resp.status_code}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()
            
            # 获取 operation name
            operation_name = data.get("name", "")
            logger.info(f"Gemini Veo submit OK — operation={operation_name}")
            
            return VideoResult(
                task_id=operation_name,
                status="pending",
            )
        
        except Exception as e:
            logger.error(f"Gemini Veo submit failed: {e}")
            return VideoResult(status="failed", error=str(e))
    
    def _sanitize_payload_for_logging(self, payload: dict) -> dict:
        """清理 payload 用于日志记录 (移除图片数据)"""
        import copy
        log_payload = copy.deepcopy(payload)
        
        instances = log_payload.get("instances", [])
        for instance in instances:
            instance.get("image") and instance.update({"image": "<image_data>"})
            instance.get("lastFrame") and instance.update({"lastFrame": "<image_data>"})
        
        return log_payload
    
    async def poll(self, task_id: str) -> VideoResult:
        """轮询需要通过 poll_with_key 传递 api_key"""
        pass
    
    async def poll_with_key(self, api_key: str, operation_name: str) -> VideoResult:
        """带 API key 的轮询方法 — GET /v1beta/{operation_name}"""
        headers = {"x-goog-api-key": api_key}
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{_GEMINI_BASE_URL}/{operation_name}",
                    headers=headers,
                )
                resp.status_code >= 400 and logger.error(
                    f"Gemini poll error {resp.status_code} for {operation_name}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()
            
            logger.debug(f"Gemini Veo poll response: {data}")
            
            # 检查 done 字段
            is_done = data.get("done", False)
            mapped_status = "completed" if is_done else "processing"
            
            result = VideoResult(
                task_id=operation_name,
                status=mapped_status,
            )
            
            # 完成时提取视频 URL
            is_done and self._extract_video_info(data, result)
            
            # 失败处理
            error_info = data.get("error", {})
            (error_info and mapped_status != "completed") and setattr(
                result, "status", "failed"
            )
            error_info and setattr(result, "error", error_info.get("message", "Unknown error"))
            
            return result
        
        except Exception as e:
            logger.error(f"Gemini Veo poll failed for {operation_name}: {e}")
            return VideoResult(task_id=operation_name, status="pending", error=str(e))
    
    def _extract_video_info(self, data: dict, result: VideoResult) -> None:
        """从响应中提取视频信息"""
        response_data = data.get("response", {})
        video_response = response_data.get("generateVideoResponse", {})
        generated_samples = video_response.get("generatedSamples", [])
        
        generated_samples and self._process_first_sample(generated_samples[0], result)
    
    def _process_first_sample(self, sample: dict, result: VideoResult) -> None:
        """处理第一个生成的视频样本"""
        video_info = sample.get("video", {})
        
        # 视频 URI (需要下载)
        video_uri = video_info.get("uri", "")
        video_uri and setattr(result, "video_url", video_uri)
        
        # 视频字节 (如果有)
        video_bytes = video_info.get("videoBytes", "")
        
        # 尝试获取尺寸信息 (Gemini API 可能不直接返回)
        # 从 sample 中获取其他元数据
        sample.get("generationConfig") and logger.debug(
            f"Video generation config: {sample.get('generationConfig')}"
        )
    
    async def download_video(self, video_uri: str, api_key: str) -> bytes:
        """
        下载视频文件
        
        Gemini 返回的 video.uri 需要通过 API key 下载
        """
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.get(
                    video_uri,
                    headers={"x-goog-api-key": api_key},
                    follow_redirects=True,
                )
                resp.raise_for_status()
                return resp.content
        
        except Exception as e:
            logger.error(f"Gemini video download failed: {e}")
            return b""
