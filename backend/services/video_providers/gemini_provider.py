"""
Gemini Veo 视频生成适配器

支持 Google Gemini Veo 系列视频生成模型。

REST 端点:
  提交: POST /v1beta/models/{model}:predictLongRunning
  轮询: GET  /v1beta/{operation_name}
  下载: 从 response.generateVideoResponse.generatedSamples[0].video.uri 获取

模型系列:
  - veo-3.1-generate-preview       (T2V, I2V, 首尾帧, 参考图片, 视频扩展, 原生音频)
  - veo-3.1-fast-generate-preview  (快速版本, 与 3.1 同等能力)
  - veo-3.1-lite-generate-preview  (轻量版, 无参考图片, 无视频扩展, 无 4k)
  - veo-3.0-generate-001           (稳定版, T2V/I2V, 原生音频, 仅 8s)
  - veo-3.0-fast-generate-001      (快速稳定版)
  - veo-2.0-generate-001           (基础版, T2V/I2V, 无声)

输入模式:
  - text_to_video:     prompt → 视频
  - image_to_video:    prompt + image (首帧) → 视频
  - reference_images:  prompt + referenceImages (最多 3 张) → 视频 (仅 Veo 3.1/3.1 Fast)
  - video_extension:   prompt + video (前次生成) → 扩展视频 (仅 Veo 3.1/3.1 Fast)

首尾帧插值: image (首帧) + lastFrame (尾帧) → 插值视频 (Veo 3.1 系列)

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
        "veo-3.1-lite-generate-preview",
        "veo-3.0-generate-001",
        "veo-3.0-fast-generate-001",
        "veo-2.0-generate-001",
    ]
    
    STATUS_MAP: ClassVar[Dict[str, str]] = {
        "false": "processing",  # done: false
        "true": "completed",    # done: true
    }
    
    # 分辨率映射
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
    
    # 模型能力集合 — 避免运行时 if 判断, 用集合查找
    _REFERENCE_IMAGE_MODELS: ClassVar[set] = {
        "veo-3.1-generate-preview",
        "veo-3.1-fast-generate-preview",
    }
    
    _VIDEO_EXTENSION_MODELS: ClassVar[set] = {
        "veo-3.1-generate-preview",
        "veo-3.1-fast-generate-preview",
    }
    
    _FIRST_LAST_FRAME_MODELS: ClassVar[set] = {
        "veo-3.1-generate-preview",
        "veo-3.1-fast-generate-preview",
        "veo-3.1-lite-generate-preview",
        "veo-3.0-generate-001",
        "veo-3.0-fast-generate-001",
        "veo-2.0-generate-001",
    }
    
    _SEED_MODELS: ClassVar[set] = {
        "veo-3.1-generate-preview",
        "veo-3.1-fast-generate-preview",
        "veo-3.1-lite-generate-preview",
        "veo-3.0-generate-001",
        "veo-3.0-fast-generate-001",
    }
    
    async def submit(self, ctx: VideoContext) -> VideoResult:
        """提交视频生成任务"""
        payload = self._build_payload(ctx)
        return await self._call_submit(ctx, payload)
    
    def _build_payload(self, ctx: VideoContext) -> dict:
        """构建 Gemini Veo 请求 payload"""
        instance: Dict = {
            "prompt": ctx.prompt,
        }
        
        # 首帧图片 (图生视频 / 首尾帧插值的首帧)
        ctx.image_url and instance.update(
            self._build_image_field("image", ctx.image_url)
        )
        
        # 尾帧图片 (首尾帧插值, Veo 3.1 系列支持)
        (ctx.last_frame_image and ctx.model in self._FIRST_LAST_FRAME_MODELS) and instance.update(
            self._build_image_field("lastFrame", ctx.last_frame_image)
        )
        
        # 参考图片 (仅 Veo 3.1 / 3.1 Fast)
        (ctx.reference_images and ctx.model in self._REFERENCE_IMAGE_MODELS) and instance.update({
            "referenceImages": [
                self._build_reference_image(img) for img in ctx.reference_images[:3]
            ],
        })
        
        # 视频扩展 (仅 Veo 3.1 / 3.1 Fast)
        (ctx.extension_video_url and ctx.model in self._VIDEO_EXTENSION_MODELS) and instance.update(
            self._build_video_field(ctx.extension_video_url)
        )
        
        # parameters
        parameters: Dict = {}
        
        # 宽高比
        parameters["aspectRatio"] = self.ASPECT_RATIO_MAP.get(ctx.aspect_ratio, "16:9")
        
        # 分辨率
        resolution = self.RESOLUTION_MAP.get(ctx.quality.lower())
        resolution and parameters.update({"resolution": resolution})
        
        # 时长 — API 硬性约束:
        #   1080p/4k/参考图片/视频扩展/首尾帧插值: 强制 8 秒
        #   其余保留用户设定 (合法值: 4/5/6/8, 其中 5 仅 Veo 2.0)
        has_constraint = resolution in ("1080p", "4k") or ctx.last_frame_image or ctx.reference_images or ctx.extension_video_url
        duration = 8 * bool(has_constraint) or ctx.duration
        duration in (4, 5, 6, 8) and parameters.update({"durationSeconds": duration})
        
        # personGeneration 参数 — Gemini Veo API 硬性约束:
        #   text_to_video / video_extension: "allow_all" only
        #   image_to_video / interpolation / reference_images: "allow_adult" only
        _IMAGE_MODES = {"image_to_video", "reference_images"}
        person_gen = ctx.person_generation or (
            "allow_adult" * (ctx.video_mode in _IMAGE_MODES) or "allow_all"
        )
        parameters["personGeneration"] = person_gen
        
        # seed 参数 (Veo 3+ 支持)
        (ctx.seed is not None and ctx.model in self._SEED_MODELS) and parameters.update({
            "seed": ctx.seed,
        })
        
        # 视频扩展模式: 强制 720p, 1 个视频
        (ctx.extension_video_url and ctx.model in self._VIDEO_EXTENSION_MODELS) and parameters.update({
            "resolution": "720p",
            "numberOfVideos": 1,
        })
        
        payload: Dict = {
            "instances": [instance],
            "parameters": parameters,
        }
        
        return payload
    
    def _build_image_field(self, field_name: str, image_source: str) -> dict:
        """构建图片字段 — 自动识别 URL 或 base64

        使用 bytesBase64Encoded 格式 (Vertex AI 兼容),
        避免 inlineData 格式在部分模型上不被支持的问题。
        """
        is_data_uri = image_source.startswith("data:")
        is_url = image_source.startswith("http")

        result = {}
        # base64 data URI → bytesBase64Encoded + mimeType
        is_data_uri and result.update({
            field_name: self._parse_data_uri(image_source)
        })
        # HTTP URL → imageUrl (Gemini REST 格式)
        (not is_data_uri and is_url) and result.update({
            field_name: {"imageUrl": image_source}
        })
        return result

    def _parse_data_uri(self, data_uri: str) -> dict:
        """解析 data URI 为 bytesBase64Encoded 格式 (Vertex AI 兼容)"""
        # data:image/png;base64,iVBOR...
        header, data = data_uri.split(",", 1)
        mime_type = header.split(":")[1].split(";")[0]
        return {"bytesBase64Encoded": data, "mimeType": mime_type}
    
    def _build_reference_image(self, img: dict) -> dict:
        """构建单个参考图片对象"""
        url = img.get("url", img.get("image_url", ""))
        reference_type = img.get("reference_type", "asset")

        image_field = {}
        url.startswith("data:") and image_field.update(
            self._parse_data_uri(url)
        )
        (not url.startswith("data:") and url.startswith("http")) and image_field.update(
            {"imageUrl": url}
        )

        return {
            "image": image_field,
            "referenceType": reference_type,
        }

    def _build_video_field(self, video_source: str) -> dict:
        """构建视频字段 — 用于视频扩展"""
        result = {}
        video_source.startswith("data:") and result.update({
            "video": self._parse_data_uri(video_source)
        })
        (not video_source.startswith("data:") and video_source.startswith("http")) and result.update({
            "video": {"videoUrl": video_source}
        })
        return result
    
    async def _call_submit(self, ctx: VideoContext, payload: dict) -> VideoResult:
        """POST /v1beta/models/{model}:predictLongRunning"""
        headers = {
            "x-goog-api-key": ctx.api_key,
            "Content-Type": "application/json",
        }
        
        model = ctx.model
        url = f"{_GEMINI_BASE_URL}/models/{model}:predictLongRunning"
        
        # 日志不打印完整图片/视频数据
        log_payload = self._sanitize_payload_for_logging(payload)
        logger.info(f"Gemini Veo submit — model={model}, mode={ctx.video_mode}, payload={log_payload}")
        
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.status_code >= 400 and logger.error(
                    f"Gemini submit error {resp.status_code}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()
            
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
        """清理 payload 用于日志记录 (移除图片/视频数据)"""
        import copy
        log_payload = copy.deepcopy(payload)
        
        _SENSITIVE_KEYS = {"image", "lastFrame", "referenceImages", "video"}
        
        instances = log_payload.get("instances", [])
        for instance in instances:
            for key in _SENSITIVE_KEYS & set(instance.keys()):
                instance[key] = f"<{key}_data>"
        
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
            mapped_status = "completed" * is_done or "processing"
            
            is_done and logger.info(f"Gemini Veo completed, response keys: {list(data.keys())}")
            
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
        
        # 兜底: 直接在 response 下查找 generatedSamples (无 generateVideoResponse 包裹)
        (not generated_samples) and (
            generated_samples := response_data.get("generatedSamples", [])
        )
        
        # RAI 安全过滤: 视频被内容审核拦截
        rai_count = video_response.get("raiMediaFilteredCount", 0)
        rai_reasons = video_response.get("raiMediaFilteredReasons", [])
        (rai_count or rai_reasons) and not generated_samples and (
            setattr(result, "status", "failed"),
            setattr(result, "error", f"Video blocked by safety filter: {', '.join(rai_reasons) or 'content policy violation'}"),
            logger.warning(f"Gemini Veo RAI filtered: count={rai_count}, reasons={rai_reasons}"),
        )
        
        generated_samples and self._process_first_sample(generated_samples[0], result)
    
    def _process_first_sample(self, sample: dict, result: VideoResult) -> None:
        """处理第一个生成的视频样本"""
        video_info = sample.get("video", {})
        
        # 视频 URI
        video_uri = video_info.get("uri", "") if isinstance(video_info, dict) else ""
        video_uri and setattr(result, "video_url", video_uri)
        video_uri and logger.info(f"Gemini Veo extracted video URI: {video_uri[:100]}...")
        (not video_uri) and logger.warning(f"Gemini Veo: no URI in video_info: {video_info}")
    
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
