"""
xAI 视频生成适配器

支持 Grok 视频生成模型。

REST 端点:
  生成:   POST /v1/videos/generations   (T2V, I2V, 参考图片)
  编辑:   POST /v1/videos/edits         (视频编辑)
  扩展:   POST /v1/videos/extensions    (视频扩展)
  轮询:   GET  /v1/videos/{request_id}  (通用)

请求模式 (互斥):
  - text_to_video:     prompt only
  - image_to_video:    prompt + image
  - reference_images:  prompt + reference_images (最多 3 张)
  - edit:              prompt + video → /v1/videos/edits
  - video_extension:   prompt + video → /v1/videos/extensions

注意: image + reference_images 不能同时使用 (400 错误)
"""
from __future__ import annotations
from typing import Dict, List, ClassVar
import logging

import httpx

from .base import VideoProviderAdapter, VideoContext, VideoResult

logger = logging.getLogger(__name__)

_XAI_BASE_URL = "https://api.x.ai/v1"

# 视频模式 -> 端点路径
_ENDPOINT_MAP: Dict[str, str] = {
    "text_to_video": "/videos/generations",
    "image_to_video": "/videos/generations",
    "reference_images": "/videos/generations",
    "edit": "/videos/edits",
    "video_extension": "/videos/extensions",
}


class XAIVideoAdapter(VideoProviderAdapter):
    """xAI 视频生成适配器"""
    
    SUPPORTED_MODELS: ClassVar[List[str]] = [
        "grok-imagine-video",
    ]
    
    STATUS_MAP: ClassVar[Dict[str, str]] = {
        "queued": "pending",
        "pending": "pending",
        "in_progress": "processing",
        "processing": "processing",
        "succeeded": "completed",
        "completed": "completed",
        "done": "completed",
        "failed": "failed",
        "expired": "failed",
    }
    
    async def submit(self, ctx: VideoContext) -> VideoResult:
        """提交视频生成任务，根据 video_mode 路由到对应端点"""
        endpoint = _ENDPOINT_MAP.get(ctx.video_mode)
        endpoint or logger.error(f"Unknown video mode: {ctx.video_mode}")
        return await self._call_submit(ctx, self._build_payload(ctx), endpoint) if endpoint else VideoResult(
            status="failed", error=f"Unknown video mode: {ctx.video_mode}"
        )
    
    def _build_payload(self, ctx: VideoContext) -> dict:
        """统一构建请求 payload，根据 video_mode 添加不同字段"""
        payload: Dict = {
            "model": ctx.model,
            "prompt": ctx.prompt,
        }
        
        # 生成/参考图片模式: 添加 duration, resolution, aspect_ratio
        # 编辑模式: 不支持自定义 duration/resolution/aspect_ratio
        # 扩展模式: duration 仅控制扩展长度
        _GENERATION_MODES = {"text_to_video", "image_to_video", "reference_images", "video_extension"}
        (ctx.video_mode in _GENERATION_MODES) and payload.update({
            "duration": ctx.duration,
            "resolution": ctx.quality,
            "aspect_ratio": ctx.aspect_ratio,
        })
        
        # 图生视频: 添加 image 字段
        ctx.image_url and ctx.video_mode == "image_to_video" and payload.update({
            "image": {"url": ctx.image_url},
        })
        
        # 参考图片: 添加 reference_images 字段
        ctx.reference_images and ctx.video_mode == "reference_images" and payload.update({
            "reference_images": [
                {"url": img.get("url", img.get("image_url", ""))} for img in ctx.reference_images
            ],
        })
        
        # 视频编辑/扩展: 添加 video 字段
        ctx.extension_video_url and ctx.video_mode in ("edit", "video_extension") and payload.update({
            "video": {"url": ctx.extension_video_url},
        })
        
        return payload
    
    async def _call_submit(self, ctx: VideoContext, payload: dict, endpoint: str) -> VideoResult:
        """发送 POST 请求到指定端点"""
        headers = {
            "Authorization": f"Bearer {ctx.api_key}",
            "Content-Type": "application/json",
        }
        
        url = f"{_XAI_BASE_URL}{endpoint}"
        
        # 日志: 移除敏感图片数据
        log_payload = self._sanitize_payload_for_logging(payload)
        logger.info(f"xAI video submit — mode={ctx.video_mode}, endpoint={endpoint}, payload={log_payload}")
        
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.status_code >= 400 and logger.error(
                    f"xAI submit error {resp.status_code}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()
            
            request_id = data.get("request_id", data.get("id", ""))
            logger.info(f"xAI video submit OK — request_id={request_id}")
            return VideoResult(task_id=request_id, status="pending")
        
        except Exception as e:
            logger.error(f"xAI {ctx.video_mode} submit failed: {e}")
            return VideoResult(status="failed", error=str(e))
    
    def _sanitize_payload_for_logging(self, payload: dict) -> dict:
        """清理 payload 用于日志记录"""
        sanitize_keys = {"image", "reference_images", "video"}
        return {
            k: (f"<{k}_data>" if k in sanitize_keys else v)
            for k, v in payload.items()
        }
    
    async def poll(self, task_id: str) -> VideoResult:
        """轮询需要通过 poll_with_key 传递 api_key"""
        pass
    
    async def poll_with_key(self, api_key: str, task_id: str) -> VideoResult:
        """带 API key 的轮询方法 — GET /v1/videos/{request_id}"""
        headers = {"Authorization": f"Bearer {api_key}"}
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{_XAI_BASE_URL}/videos/{task_id}",
                    headers=headers,
                )
                resp.status_code >= 400 and logger.error(
                    f"xAI poll error {resp.status_code} for {task_id}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()
            
            logger.debug(f"xAI video poll response: {data}")
            
            raw_status = data.get("status", "pending")
            mapped_status = self._map_status(raw_status)
            
            result = VideoResult(task_id=task_id, status=mapped_status)
            
            # 提取视频数据
            video_data = data.get("video") or data.get("response", {}).get("video", {})
            
            # 内容审核检查
            moderation_ok = video_data.get("respect_moderation", True) if video_data else True
            
            (mapped_status == "completed" and not moderation_ok) and (
                setattr(result, "status", "failed"),
                setattr(result, "error", "Generated video rejected by content moderation"),
                logger.warning(f"Video {task_id} rejected by content moderation")
            )
            
            # 正常完成
            (mapped_status == "completed" and moderation_ok and video_data) and (
                setattr(result, "video_url", video_data.get("url", "")),
                setattr(result, "duration_seconds", video_data.get("duration", 0))
            )
            
            # 失败处理
            (mapped_status == "failed") and setattr(
                result, "error", self._extract_error_message(data)
            )
            
            return result
        
        except Exception as e:
            logger.error(f"xAI poll failed for {task_id}: {e}")
            return VideoResult(task_id=task_id, status="pending", error=str(e))

    @staticmethod
    def _extract_error_message(data: dict) -> str:
        """从 xAI 响应中提取错误信息字符串
        
        xAI error 字段可能是 str 或 dict {'code': '...', 'message': '...'}
        """
        raw = data.get("error", data.get("message", "Unknown error"))
        return raw.get("message", str(raw)) if isinstance(raw, dict) else str(raw)
