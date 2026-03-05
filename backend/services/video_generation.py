"""
xAI 视频生成服务 — httpx REST API
支持: text_to_video, image_to_video, edit

REST 端点:
  提交: POST /v1/videos/generations
  轮询: GET  /v1/videos/{request_id}

图片格式（基于 protobuf GenerateVideoRequest 定义）:
  image: { image_url: "data:image/jpeg;base64,..." }
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict
import logging

import httpx

logger = logging.getLogger(__name__)

# xAI 任务状态 → 内部状态映射表
XAI_STATUS_MAP: Dict[str, str] = {
    "queued": "pending",
    "pending": "pending",
    "in_progress": "processing",
    "processing": "processing",
    "succeeded": "completed",
    "completed": "completed",
    "done": "completed",
    "failed": "failed",
}

_XAI_BASE_URL = "https://api.x.ai/v1"


@dataclass
class VideoContext:
    """视频生成请求上下文"""
    api_key: str
    model: str = "grok-imagine-video"
    prompt: str = ""
    image_url: str | None = None
    duration: int = 5           # 1-15 秒
    quality: str = "720p"       # 480p / 720p
    aspect_ratio: str = "16:9"
    mode: str = "normal"        # 前端保留字段，不发往 xAI
    video_mode: str = "text_to_video"  # text_to_video / image_to_video / edit


@dataclass
class VideoResult:
    """视频生成结果"""
    xai_task_id: str = ""
    status: str = "pending"     # pending / processing / completed / failed
    video_url: str = ""         # xAI 返回的远端视频 URL
    duration_seconds: float = 0
    error: str = ""


# ---------------------------------------------------------------------------
# 视频模式注册表
# ---------------------------------------------------------------------------
_VIDEO_MODE_REGISTRY: Dict[str, Callable] = {}


def register_video_mode(*modes: str):
    """装饰器：注册视频模式处理器"""
    def decorator(handler: Callable):
        for m in modes:
            _VIDEO_MODE_REGISTRY[m] = handler
        return handler
    return decorator


def _build_base_payload(ctx: VideoContext) -> dict:
    """构建通用请求 payload（不含图片）"""
    return {
        "model": ctx.model,
        "prompt": ctx.prompt,
        "duration": ctx.duration,
        "resolution": ctx.quality,       # API 字段名为 resolution
        "aspect_ratio": ctx.aspect_ratio,
    }


@register_video_mode("text_to_video")
async def _submit_text_to_video(ctx: VideoContext) -> VideoResult:
    """文本生成视频"""
    return await _call_submit(ctx, _build_base_payload(ctx))


@register_video_mode("image_to_video", "edit")
async def _submit_image_to_video(ctx: VideoContext) -> VideoResult:
    """图片生成视频 / 视频编辑"""
    payload = _build_base_payload(ctx)
    # 按 protobuf GenerateVideoRequest.image 字段格式嵌套
    ctx.image_url and payload.update({"image": {"image_url": ctx.image_url}})
    return await _call_submit(ctx, payload)


async def _call_submit(ctx: VideoContext, payload: dict) -> VideoResult:
    """POST /v1/videos/generations"""
    headers = {
        "Authorization": f"Bearer {ctx.api_key}",
        "Content-Type": "application/json",
    }
    # 日志不打印完整 image 数据（base64 太长）
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
        return VideoResult(xai_task_id=request_id, status="pending")

    except Exception as e:
        logger.error(f"{ctx.video_mode} submit failed: {e}")
        return VideoResult(status="failed", error=str(e))


async def submit_video_task(ctx: VideoContext) -> VideoResult:
    """统一提交入口 — 通过注册表路由到对应处理器"""
    handler = _VIDEO_MODE_REGISTRY.get(ctx.video_mode)
    handler or logger.error(f"Unknown video mode: {ctx.video_mode}")
    return await handler(ctx) if handler else VideoResult(status="failed", error=f"Unknown video mode: {ctx.video_mode}")


# ---------------------------------------------------------------------------
# 轮询
# ---------------------------------------------------------------------------
MAX_POLL_FAILURES = 10


async def poll_video_task(api_key: str, xai_task_id: str) -> VideoResult:
    """轮询 xAI 视频任务状态 — GET /v1/videos/{request_id}"""
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{_XAI_BASE_URL}/videos/{xai_task_id}",
                headers=headers,
            )
            resp.status_code >= 400 and logger.error(
                f"xAI poll error {resp.status_code} for {xai_task_id}: {resp.text[:500]}"
            )
            resp.raise_for_status()
            data = resp.json()

        logger.info(f"xAI video poll response: {data}")

        raw_status = data.get("status", "pending")
        mapped_status = XAI_STATUS_MAP.get(raw_status, "pending")

        result = VideoResult(xai_task_id=xai_task_id, status=mapped_status)

        # 完成时提取视频 URL 和时长 — xAI 格式: {video: {url, duration, respect_moderation}}
        video_data = data.get("video") or data.get("response", {}).get("video", {})

        _handle_completed(result, mapped_status, video_data)
        _handle_failed(result, mapped_status, data)

        return result

    except Exception as e:
        logger.error(f"poll_video_task failed for {xai_task_id}: {e}")
        return VideoResult(xai_task_id=xai_task_id, status="pending", error=str(e))


def _handle_completed(result: VideoResult, status: str, video_data: dict) -> None:
    """处理已完成的视频结果，含内容审核检查"""
    (status != "completed" or not video_data) and None  # 非完成态直接跳过

    # 内容审核：respect_moderation 为 false 时判定失败
    moderation_ok = video_data.get("respect_moderation", True)
    (status == "completed" and not moderation_ok) and setattr(result, "status", "failed")
    (status == "completed" and not moderation_ok) and setattr(result, "error", "Generated video rejected by content moderation")
    (status == "completed" and not moderation_ok) and logger.warning(f"Video {result.xai_task_id} rejected by content moderation")

    # 正常完成
    (status == "completed" and moderation_ok and video_data) and setattr(result, "video_url", video_data.get("url", ""))
    (status == "completed" and moderation_ok and video_data) and setattr(result, "duration_seconds", video_data.get("duration", 0))


def _handle_failed(result: VideoResult, status: str, data: dict) -> None:
    """处理失败的视频结果"""
    (status == "failed") and setattr(
        result, "error", data.get("error", data.get("message", "Unknown error"))
    )
