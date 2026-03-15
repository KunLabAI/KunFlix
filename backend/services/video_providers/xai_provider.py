"""
xAI 视频生成适配器

支持 Grok 视频生成模型。
REST 端点:
  提交: POST /v1/videos/generations
  轮询: GET  /v1/videos/{request_id}
"""
from __future__ import annotations
from typing import Dict, List, ClassVar
import logging

import httpx

from .base import VideoProviderAdapter, VideoContext, VideoResult

logger = logging.getLogger(__name__)

_XAI_BASE_URL = "https://api.x.ai/v1"


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
    }
    
    def __init__(self):
        self._mode_handlers = {
            "text_to_video": self._submit_text_to_video,
            "image_to_video": self._submit_image_to_video,
            "edit": self._submit_image_to_video,  # edit 复用 image_to_video 逻辑
        }
    
    async def submit(self, ctx: VideoContext) -> VideoResult:
        """提交视频生成任务"""
        handler = self._mode_handlers.get(ctx.video_mode)
        handler or logger.error(f"Unknown video mode: {ctx.video_mode}")
        return await handler(ctx) if handler else VideoResult(status="failed", error=f"Unknown video mode: {ctx.video_mode}")
    
    def _build_base_payload(self, ctx: VideoContext) -> dict:
        """构建通用请求 payload"""
        return {
            "model": ctx.model,
            "prompt": ctx.prompt,
            "duration": ctx.duration,
            "resolution": ctx.quality,
            "aspect_ratio": ctx.aspect_ratio,
        }
    
    async def _submit_text_to_video(self, ctx: VideoContext) -> VideoResult:
        """文本生成视频"""
        return await self._call_submit(ctx, self._build_base_payload(ctx))
    
    async def _submit_image_to_video(self, ctx: VideoContext) -> VideoResult:
        """图片生成视频 / 视频编辑"""
        payload = self._build_base_payload(ctx)
        ctx.image_url and payload.update({"image": {"image_url": ctx.image_url}})
        return await self._call_submit(ctx, payload)
    
    async def _call_submit(self, ctx: VideoContext, payload: dict) -> VideoResult:
        """POST /v1/videos/generations"""
        headers = {
            "Authorization": f"Bearer {ctx.api_key}",
            "Content-Type": "application/json",
        }
        
        # 日志不打印完整 image 数据
        log_payload = {k: (v if k != "image" else "{image_url: <...>}") for k, v in payload.items()}
        logger.info(f"xAI video submit — mode={ctx.video_mode}, payload={log_payload}")
        
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{_XAI_BASE_URL}/videos/generations",
                    headers=headers,
                    json=payload,
                )
                resp.status_code >= 400 and logger.error(
                    f"xAI submit error {resp.status_code}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()
            
            request_id = data.get("request_id", data.get("id", ""))
            logger.info(f"xAI video submit OK — request_id={request_id}")
            return VideoResult(task_id=request_id, status="pending")
        
        except Exception as e:
            logger.error(f"{ctx.video_mode} submit failed: {e}")
            return VideoResult(status="failed", error=str(e))
    
    async def poll(self, task_id: str) -> VideoResult:
        """轮询任务状态 — GET /v1/videos/{request_id}"""
        headers = {"Authorization": f"Bearer {self._api_key}"}
        
        # 注意: poll 需要 api_key，通过实例属性传递
        # 实际使用时应在 submit 后保存 api_key
        pass
    
    async def poll_with_key(self, api_key: str, task_id: str) -> VideoResult:
        """带 API key 的轮询方法"""
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
            
            logger.info(f"xAI video poll response: {data}")
            
            raw_status = data.get("status", "pending")
            mapped_status = self._map_status(raw_status)
            
            result = VideoResult(task_id=task_id, status=mapped_status)
            
            # 完成时提取视频 URL 和时长
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
                result, "error", data.get("error", data.get("message", "Unknown error"))
            )
            
            return result
        
        except Exception as e:
            logger.error(f"poll_video_task failed for {task_id}: {e}")
            return VideoResult(task_id=task_id, status="pending", error=str(e))
