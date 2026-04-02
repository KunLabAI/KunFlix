"""
VideoGenProvider — AI video generation tool.

Supports multiple providers (xAI, MiniMax, Gemini) via the existing
video_generation.py pipeline. Video generation is asynchronous: execute()
submits the task and returns a task ID immediately.
"""
from __future__ import annotations

import json
import logging
import base64
import mimetypes
from pathlib import Path
from typing import Any, TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import LLMProvider, VideoTask, ToolConfig
from services.video_generation import submit_video_task, infer_provider_type
from services.video_providers.base import VideoContext
from services.video_providers.model_capabilities import (
    VIDEO_MODEL_CAPABILITIES,
    get_model_capabilities,
)

if TYPE_CHECKING:
    from models import Agent
    from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
VIDEO_GEN_TOOL_NAME = "generate_video"

# Providers that support tool-based video generation
_TOOL_VIDEO_PROVIDERS = frozenset({"xai", "minimax", "gemini"})

# Superset fallback enums (used when model capabilities are unknown)
_DEFAULT_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"]
_DEFAULT_DURATIONS = [4, 5, 6, 8, 10]
_DEFAULT_RESOLUTIONS = ["480p", "720p", "768p", "1080p"]
_DEFAULT_MODES = ["text_to_video", "image_to_video"]

# 本地媒体目录 (与 media_utils.MEDIA_DIR 相同)
_MEDIA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "media"


def _resolve_local_media(url: str | None) -> str | None:
    """将本地 /api/media/xxx.jpg 路径转换为 base64 data URI。

    供应商 API (Gemini/xAI/MiniMax) 需要 data: URI 或 http(s) URL；
    本地相对路径无法被远端 API 访问，需要读取文件内联编码。
    """
    # None 或已是可用格式 → 原样返回
    is_local = url and url.startswith("/api/media/")
    (not is_local) and None  # no-op, just avoid nested if
    if not is_local:
        return url
    filename = url.rsplit("/", 1)[-1]
    filepath = _MEDIA_DIR / filename
    if not filepath.exists():
        logger.warning("Local media file not found: %s", filepath)
        return url
    mime, _ = mimetypes.guess_type(str(filepath))
    mime = mime or "image/jpeg"
    b64 = base64.b64encode(filepath.read_bytes()).decode("ascii")
    logger.info("Resolved local media to data URI: %s (%s, %d bytes)", filename, mime, len(b64))
    return f"data:{mime};base64,{b64}"


# ---------------------------------------------------------------------------
# Tool Definition (dynamic per model capabilities)
# ---------------------------------------------------------------------------

def _build_video_gen_tool_def(
    model_name: str = "",
    capabilities: dict | None = None,
) -> dict:
    """Build the OpenAI-format tool definition for generate_video.

    Parameters enums are tailored to the configured model's capabilities.
    """
    caps = capabilities or {}
    modes = caps.get("modes", _DEFAULT_MODES)
    aspect_ratios = caps.get("aspect_ratios", _DEFAULT_ASPECT_RATIOS)
    durations = caps.get("durations", _DEFAULT_DURATIONS)
    resolutions = caps.get("resolutions", _DEFAULT_RESOLUTIONS)

    properties: dict[str, Any] = {
        "prompt": {
            "type": "string",
            "description": (
                "Detailed description of the video to generate. "
                "Be specific about subject, action, style, camera movement, and mood. "
                "Write the prompt in English for best results."
            ),
        },
        "video_mode": {
            "type": "string",
            "enum": modes,
            "description": (
                "Video generation mode. "
                "text_to_video: generate from text only. "
                "image_to_video: generate from a reference image. "
                "Default is text_to_video."
            ),
        },
        "aspect_ratio": {
            "type": "string",
            "enum": aspect_ratios,
            "description": "Video aspect ratio. Default is 16:9.",
        },
        "duration": {
            "type": "integer",
            "enum": durations,
            "description": "Video duration in seconds.",
        },
        "quality": {
            "type": "string",
            "enum": resolutions,
            "description": "Video resolution/quality. Default is 720p.",
        },
    }

    # image_url only relevant when model supports image_to_video
    ({"image_to_video", "edit", "reference_images"} & set(modes)) and properties.update(
        image_url={
            "type": "string",
            "description": (
                "URL of a reference image for image_to_video mode. "
                "Required when video_mode is image_to_video."
            ),
        }
    )

    return {
        "type": "function",
        "function": {
            "name": VIDEO_GEN_TOOL_NAME,
            "description": (
                "Generate a video from a text prompt or image using an AI video generation model. "
                "Use this tool when the user asks you to create, generate, or produce a video, "
                "animation, or motion content. Video generation is asynchronous and takes 1-5 minutes. "
                "The tool returns a task ID; the user will be notified when the video is ready."
            ),
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": ["prompt"],
            },
        },
    }


# ---------------------------------------------------------------------------
# Config + Eligibility helpers
# ---------------------------------------------------------------------------

async def _get_global_video_config(db: AsyncSession) -> dict:
    """获取全局视频生成配置（从 ToolConfig 表）。"""
    result = await db.execute(
        select(ToolConfig).where(ToolConfig.tool_name == VIDEO_GEN_TOOL_NAME)
    )
    tool_config = result.scalar_one_or_none()
    return (tool_config.config if tool_config else {}) or {}


# ---------------------------------------------------------------------------
# Tool Execution
# ---------------------------------------------------------------------------

async def _execute_video_gen_tool(args: dict, ctx: "ToolContext") -> str:
    """Execute generate_video tool: submit task and return task ID."""
    db = ctx.db

    prompt = args.get("prompt", "")
    video_mode = args.get("video_mode", "text_to_video")
    aspect_ratio = args.get("aspect_ratio")
    duration = args.get("duration")
    quality = args.get("quality")
    image_url = args.get("image_url")

    # 从全局 ToolConfig 读取配置
    cfg = await _get_global_video_config(db)
    provider_id = cfg.get("video_provider_id")
    model = cfg.get("video_model", "")
    video_cfg = cfg.get("video_config") or {}

    # 查找 LLMProvider
    result = await db.execute(
        select(LLMProvider).where(LLMProvider.id == provider_id, LLMProvider.is_active == True)
    )
    provider = result.scalar_one_or_none()

    if not provider:
        return json.dumps({"error": "Video provider not found or inactive. Please configure video generation in admin tools."})

    # 推断供应商类型
    provider_type = provider.provider_type or infer_provider_type(model)

    # 合并配置：全局配置 > 工具参数（管理员设定优先）
    final_duration = video_cfg.get("duration") or duration or 6
    final_quality = video_cfg.get("quality") or quality or "720p"
    final_aspect = video_cfg.get("aspect_ratio") or aspect_ratio or "16:9"

    # 将本地媒体路径转换为 base64 data URI（供应商 API 需要 data: 或 http URL）
    image_url = _resolve_local_media(image_url)

    # 构建 VideoContext
    video_ctx = VideoContext(
        api_key=provider.api_key,
        model=model,
        prompt=prompt,
        provider_type=provider_type,
        image_url=image_url,
        duration=final_duration,
        quality=final_quality,
        aspect_ratio=final_aspect,
        video_mode=video_mode,
    )

    # 提交视频生成任务
    try:
        video_result = await submit_video_task(video_ctx)
    except Exception as e:
        logger.error("generate_video tool submit error: %s", e)
        return json.dumps({"error": "Video generation submission failed: " + str(e)})

    # 提交失败
    if video_result.status == "failed":
        return json.dumps({"error": "Video generation failed: " + (video_result.error or "Unknown error")})

    # 计算输入图片数量
    input_image_count = 1 if image_url and video_mode == "image_to_video" else 0

    # 创建 VideoTask 记录（轮询基础设施依赖此记录）
    task = VideoTask(
        xai_task_id=video_result.task_id,
        session_id=ctx.session_id,
        provider_id=provider_id,
        model=model,
        user_id=ctx.user_id,
        video_mode=video_mode,
        prompt=prompt,
        image_url=image_url,
        duration=final_duration,
        quality=final_quality,
        aspect_ratio=final_aspect,
        status="pending",
        input_image_count=input_image_count,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    logger.info("Video task created via tool: %s (%s: %s)", task.id, provider_type, video_result.task_id)

    # 将视频任务信息存入 ctx，供 chat_generation 发送 SSE 事件
    ctx.video_tasks.append({"task_id": task.id, "video_mode": video_mode, "model": model})

    # 返回 LLM 可读的结果
    return (
        "Video generation task submitted successfully.\n\n"
        "**Task ID:** " + task.id + "\n"
        "**Mode:** " + video_mode + "\n"
        "**Model:** " + model + "\n"
        "**Duration:** " + str(final_duration) + "s\n"
        "**Quality:** " + final_quality + "\n"
        "**Status:** Pending\n\n"
        "The video is now being generated. This typically takes 1-5 minutes. "
        "The user will be notified when it's ready.\n\n"
        "<!-- __VIDEO_TASK__|" + task.id + "|" + video_mode + "|" + model + " -->"
    )


# ---------------------------------------------------------------------------
# VideoGenProvider class
# ---------------------------------------------------------------------------

class VideoGenProvider:
    """Provider for AI video generation tool."""

    display_name = "视频生成"
    description = "AI 视频生成（文本/图像到视频，支持多供应商）"
    condition = "需要启用全局配置且供应商支持视频生成"

    @property
    def tool_names(self) -> frozenset[str]:
        return frozenset({VIDEO_GEN_TOOL_NAME})

    async def build_defs(self, ctx: "ToolContext") -> list[dict]:
        # 检查智能体级别的视频生成开关
        agent_video_enabled = (ctx.agent.video_config or {}).get("video_generation_enabled", False)
        if not agent_video_enabled:
            return []

        # 从全局 ToolConfig 读取配置
        global_config = await ctx.get_global_video_config()
        is_enabled = global_config.get("video_generation_enabled", False)

        if not is_enabled:
            return []

        # 检查供应商是否支持工具调用视频生成
        provider_type = await ctx.resolve_video_provider_type()
        if provider_type not in _TOOL_VIDEO_PROVIDERS:
            return []

        # 获取模型能力以动态构建参数枚举
        model_name = global_config.get("video_model", "")
        caps = get_model_capabilities(model_name)
        return [_build_video_gen_tool_def(model_name, caps)]

    async def execute(self, name: str, args: dict, ctx: "ToolContext") -> str:
        return await _execute_video_gen_tool(args, ctx)

    def rebuild_defs(self, ctx: "ToolContext") -> list[dict] | None:
        return None

    def get_tool_metadata(self) -> list[dict]:
        """Return static metadata for registry display (uses superset)."""
        d = _build_video_gen_tool_def()
        return [
            {
                "name": d["function"]["name"],
                "description": d["function"]["description"],
                "parameters": d["function"]["parameters"],
            }
        ]
