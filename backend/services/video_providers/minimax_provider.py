"""
MiniMax 视频生成适配器

支持 MiniMax Hailuo 系列视频生成模型。

REST 端点:
  提交: POST /v1/video_generation
  轮询: GET  /v1/query/video_generation?task_id=xxx
  下载: GET  /v1/files/retrieve?file_id=xxx

模型系列:
  - MiniMax-Hailuo-2.3, MiniMax-Hailuo-02 (T2V, I2V, 首尾帧)
  - T2V-01-Director, T2V-01 (纯文本)
  - I2V-01-Director, I2V-01-live, I2V-01 (图片)
  - S2V-01 (主题参考)
"""
from __future__ import annotations
from typing import Dict, List, ClassVar, Optional
import logging

import httpx

from .base import VideoProviderAdapter, VideoContext, VideoResult

logger = logging.getLogger(__name__)

_MINIMAX_BASE_URL = "https://api.minimax.io"


class MiniMaxVideoAdapter(VideoProviderAdapter):
    """MiniMax 视频生成适配器"""
    
    SUPPORTED_MODELS: ClassVar[List[str]] = [
        "MiniMax-Hailuo-2.3",
        "MiniMax-Hailuo-2.3-Fast",
        "MiniMax-Hailuo-02",
        "T2V-01-Director",
        "T2V-01",
        "I2V-01-Director",
        "I2V-01-live",
        "I2V-01",
        "S2V-01",
    ]
    
    STATUS_MAP: ClassVar[Dict[str, str]] = {
        "Preparing": "pending",
        "Queueing": "pending",
        "Processing": "processing",
        "Success": "completed",
        "Fail": "failed",
    }
    
    # 分辨率映射: 内部 quality -> MiniMax resolution
    RESOLUTION_MAP: ClassVar[Dict[str, str]] = {
        "480p": "512P",
        "512p": "512P",
        "720p": "720P",
        "768p": "768P",
        "1080p": "1080P",
    }
    
    # 支持的时长 (根据模型和分辨率有所不同)
    SUPPORTED_DURATIONS = [6, 10]
    
    def __init__(self):
        # 模型能力分类
        # T2V 模型 (纯文本生成视频)
        self._t2v_models = {
            "MiniMax-Hailuo-2.3",
            "MiniMax-Hailuo-02",
            "T2V-01-Director",
            "T2V-01",
        }
        # I2V 模型 (图片生成视频) - 需要 first_frame_image
        self._i2v_models = {
            "MiniMax-Hailuo-2.3-Fast",  # Fast 版本是 I2V 模型
            "I2V-01-Director",
            "I2V-01-live",
            "I2V-01",
        }
        # S2V 模型 (主题参考)
        self._s2v_models = {
            "S2V-01",
        }
        # 支持首尾帧的模型
        self._first_last_frame_models = {
            "MiniMax-Hailuo-02",
        }
    
    async def submit(self, ctx: VideoContext) -> VideoResult:
        """提交视频生成任务"""
        # 模型能力检查
        self._validate_model_capability(ctx)
        
        # I2V 模型必须有首帧图片，否则提前返回错误
        (ctx.model in self._i2v_models and not ctx.image_url) and logger.error(
            f"I2V model {ctx.model} requires image_url, returning error without API call"
        )
        # I2V 模型没有图片时直接返回错误 (链式条件无法 return，通过 payload 检查处理)
        
        payload = self._build_payload(ctx)
        
        # 检查 I2V 模型是否缺少必需的图片
        (ctx.model in self._i2v_models and "first_frame_image" not in payload) and (
            logger.error(f"Missing first_frame_image for I2V model {ctx.model}")
        )
        (ctx.model in self._i2v_models and "first_frame_image" not in payload) and None
        
        return await self._call_submit(ctx, payload)
    
    def _validate_model_capability(self, ctx: VideoContext) -> str:
        """检查模型是否支持当前模式，返回错误信息或空字符串"""
        model = ctx.model
        mode = ctx.video_mode
        
        # I2V 模型: 必须有首帧图片
        (model in self._i2v_models) and setattr(ctx, 'video_mode', 'image_to_video')
        (model in self._i2v_models and not ctx.image_url) and logger.warning(
            f"Model {model} is I2V-only, requires image_url"
        )
        
        # T2V 模型: 自动切换到 text_to_video
        (model in self._t2v_models and mode in ("image_to_video", "edit")) and (
            setattr(ctx, 'video_mode', 'text_to_video'),
            logger.warning(f"Model {model} is T2V-only, switched to text_to_video")
        )
        
        # S2V 模型检查
        (model in self._s2v_models and not ctx.subject_reference) and logger.warning(
            f"Model {model} requires subject_reference"
        )
        
        return ""
    
    def _build_payload(self, ctx: VideoContext) -> dict:
        """构建请求 payload"""
        payload = {
            "model": ctx.model,
            "prompt": ctx.prompt,
            "prompt_optimizer": ctx.prompt_optimizer,
        }
        
        # 分辨率映射
        resolution = self.RESOLUTION_MAP.get(ctx.quality.lower(), "768P")
        payload["resolution"] = resolution
        
        # 时长约束 (MiniMax 只支持 6 或 10)
        duration = 6 if ctx.duration <= 6 else 10
        payload["duration"] = duration
        
        # 快速预处理 (仅部分模型支持)
        ctx.fast_pretreatment and payload.update({"fast_pretreatment": True})
        
        # 根据模型类型添加图片参数
        is_i2v_model = ctx.model in self._i2v_models
        is_t2v_model = ctx.model in self._t2v_models
        is_s2v_model = ctx.model in self._s2v_models
        supports_first_last = ctx.model in self._first_last_frame_models
        
        # I2V 模型必须有首帧图片
        (is_i2v_model and ctx.image_url) and payload.update({
            "first_frame_image": ctx.image_url
        })
        
        # T2V 模型 (Hailuo-2.3/02) 可选首帧图片
        (is_t2v_model and ctx.image_url and ctx.video_mode in ("image_to_video", "edit")) and payload.update({
            "first_frame_image": ctx.image_url
        })
        
        # 尾帧图片 (仅 MiniMax-Hailuo-02 支持)
        (supports_first_last and ctx.last_frame_image) and payload.update({
            "last_frame_image": ctx.last_frame_image
        })
        
        # 主题参考 (S2V-01 模型)
        (is_s2v_model and ctx.subject_reference) and payload.update({
            "subject_reference": ctx.subject_reference
        })
        
        return payload
    
    async def _call_submit(self, ctx: VideoContext, payload: dict) -> VideoResult:
        """POST /v1/video_generation"""
        headers = {
            "Authorization": f"Bearer {ctx.api_key}",
            "Content-Type": "application/json",
        }
        
        # 日志不打印完整图片数据
        log_payload = {
            k: (v if k not in ("first_frame_image", "last_frame_image") else "<image_data>")
            for k, v in payload.items()
        }
        logger.info(f"MiniMax video submit — mode={ctx.video_mode}, payload={log_payload}")
        
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{_MINIMAX_BASE_URL}/v1/video_generation",
                    headers=headers,
                    json=payload,
                )
                resp.status_code >= 400 and logger.error(
                    f"MiniMax submit error {resp.status_code}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()
            
            # 检查 base_resp
            base_resp = data.get("base_resp", {})
            status_code = base_resp.get("status_code", 0)
            error_msg = base_resp.get("status_msg", "")
            
            (status_code != 0) and logger.error(
                f"MiniMax API error: status_code={status_code}, msg={error_msg}"
            )
            
            # 翻译常见错误消息
            ("does not support Text-to-Video" in error_msg) and (
                error_msg := f"模型 {ctx.model} 是图片生成视频模型，需要提供首帧图片 (image_url)"
            )
            ("does not support Image-to-Video" in error_msg) and (
                error_msg := f"模型 {ctx.model} 是纯文本生成视频模型，不支持图片输入"
            )
            
            task_id = data.get("task_id", "")
            logger.info(f"MiniMax video submit OK — task_id={task_id}")
            
            return VideoResult(
                task_id=task_id,
                status="pending" if status_code == 0 else "failed",
                error=error_msg if status_code != 0 else ""
            )
        
        except Exception as e:
            logger.error(f"MiniMax submit failed: {e}")
            return VideoResult(status="failed", error=str(e))
    
    async def poll(self, task_id: str) -> VideoResult:
        """轮询 — 需要通过 poll_with_key 传递 api_key"""
        pass
    
    async def poll_with_key(self, api_key: str, task_id: str) -> VideoResult:
        """带 API key 的轮询方法 — GET /v1/query/video_generation?task_id=xxx"""
        headers = {"Authorization": f"Bearer {api_key}"}
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{_MINIMAX_BASE_URL}/v1/query/video_generation",
                    params={"task_id": task_id},
                    headers=headers,
                )
                resp.status_code >= 400 and logger.error(
                    f"MiniMax poll error {resp.status_code} for {task_id}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()
            
            logger.info(f"MiniMax video poll response: {data}")
            
            raw_status = data.get("status", "Queueing")
            mapped_status = self._map_status(raw_status)
            
            result = VideoResult(
                task_id=task_id,
                status=mapped_status,
            )
            
            # 完成时提取 file_id 和视频尺寸
            (mapped_status == "completed") and (
                setattr(result, "file_id", data.get("file_id", "")),
                setattr(result, "video_width", data.get("video_width", 0)),
                setattr(result, "video_height", data.get("video_height", 0))
            )
            
            # 失败处理
            (mapped_status == "failed") and setattr(
                result, "error", data.get("base_resp", {}).get("status_msg", "Unknown error")
            )
            
            return result
        
        except Exception as e:
            logger.error(f"MiniMax poll failed for {task_id}: {e}")
            return VideoResult(task_id=task_id, status="pending", error=str(e))
    
    async def get_video_url(self, api_key: str, file_id: str) -> str:
        """
        获取视频下载链接 — GET /v1/files/retrieve?file_id=xxx
        
        MiniMax 返回的 download_url 有效期为 1 小时。
        """
        headers = {"Authorization": f"Bearer {api_key}"}
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{_MINIMAX_BASE_URL}/v1/files/retrieve",
                    params={"file_id": file_id},
                    headers=headers,
                )
                resp.status_code >= 400 and logger.error(
                    f"MiniMax files/retrieve error {resp.status_code}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()
            
            file_data = data.get("file", {})
            download_url = file_data.get("download_url", "")
            
            logger.info(f"MiniMax video download URL obtained: {download_url[:50]}...")
            return download_url
        
        except Exception as e:
            logger.error(f"MiniMax get_video_url failed: {e}")
            return ""
