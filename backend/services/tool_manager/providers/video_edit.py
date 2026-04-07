"""
VideoEditProvider — AI video editing / extension tool.

Provides edit_video tool for editing existing videos and extending them.
Shares global configuration with generate_video tool.
"""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import LLMProvider, VideoTask, ToolConfig
from services.video_generation import submit_video_task, infer_provider_type
from services.video_providers import extract_video_provider_type
from services.video_providers.base import VideoContext
from services.video_providers.model_capabilities import get_model_capabilities

if TYPE_CHECKING:
    from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
VIDEO_EDIT_TOOL_NAME = "edit_video"

# 视频供应商集合（与 video_gen 共享）
_TOOL_VIDEO_PROVIDERS = frozenset({"xai", "minimax", "gemini", "ark"})

# 工具模式 → VideoContext.video_mode 映射
_MODE_TO_VIDEO_MODE = {
    "edit": "edit",
    "extend": "video_extension",
}

# 编辑能力字段映射（capabilities key → tool mode value）
_CAPABILITY_MODE_MAP = {
    "supports_video_edit": "edit",
    "supports_video_extension": "extend",
}


# ---------------------------------------------------------------------------
# Tool Definition
# ---------------------------------------------------------------------------

def _build_video_edit_tool_def(
    capabilities: dict | None = None,
) -> dict:
    """Build the OpenAI-format tool definition for edit_video.

    The mode enum is tailored to the configured model's capabilities.
    """
    caps = capabilities or {}

    # 根据模型能力动态确定可用模式
    available_modes = [
        mode
        for cap_key, mode in _CAPABILITY_MODE_MAP.items()
        if caps.get(cap_key, False)
    ] or ["edit", "extend"]  # 回退: 全部模式

    properties: dict = {
        "video_url": {
            "type": "string",
            "description": (
                "URL of the source video to edit or extend. "
                "Can be a public URL or a local path (e.g. /api/media/filename.mp4)."
            ),
        },
        "prompt": {
            "type": "string",
            "description": (
                "For edit mode: describe the desired changes to the video. "
                "For extend mode: describe what should happen in the extended portion. "
                "Refer to input media as 视频1, 图片1, 音频1, etc."
            ),
        },
        "mode": {
            "type": "string",
            "enum": available_modes,
            "description": "Operation mode: 'edit' to modify the video, 'extend' to add more frames or concatenate videos.",
        },
        "duration": {
            "type": "integer",
            "description": "Duration in seconds for the output video. Default is 6.",
        },
    }

    # 参考图片 (编辑模式: 用于替换视频主体等)
    caps.get("supports_reference_images") and properties.update(
        reference_images={
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Array of reference image URLs for video editing. "
                "Used to replace objects, add elements, or guide style changes in the video. "
                "NUMBERING: index 0 = 图片1, index 1 = 图片2, etc. "
                "Get URLs from canvas image nodes via get_canvas_node (data.imageUrl field)."
            ),
        }
    )

    # 参考音频 (编辑模式: 用于更换音轨等)
    caps.get("supports_reference_audios") and properties.update(
        reference_audios={
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Array of reference audio URLs for video editing. "
                "Used to replace or add audio tracks (wav/mp3, 2-15s each). "
                "NUMBERING: index 0 = 音频1, index 1 = 音频2, etc."
            ),
        }
    )

    # 额外视频 (延长模式: 串联多个视频片段)
    caps.get("supports_reference_videos") and properties.update(
        additional_videos={
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Array of additional video URLs for video extension/concatenation. "
                "Combined with video_url (=视频1), additional_videos[0]=视频2, additional_videos[1]=视频3 (up to 3 total). "
                "Get URLs from canvas video nodes via get_canvas_node (data.videoUrl field)."
            ),
        }
    )

    return {
        "type": "function",
        "function": {
            "name": VIDEO_EDIT_TOOL_NAME,
            "description": (
                "Edit or extend an existing video using AI. "
                "Use 'edit' mode to modify a video based on a text prompt (e.g., replace objects, change style, add effects). "
                "Use 'extend' mode to extend a video or concatenate multiple video clips into one continuous video. "
                "Video processing is asynchronous and takes 1-5 minutes. "
                "The tool returns a task ID; the user will be notified when the result is ready.\n\n"
                "IMPORTANT — Media numbering convention:\n"
                "video_url = 视频1; additional_videos[0] = 视频2, additional_videos[1] = 视频3.\n"
                "reference_images[0] = 图片1, reference_images[1] = 图片2.\n"
                "reference_audios[0] = 音频1, reference_audios[1] = 音频2.\n"
                "To use canvas node media: call list_canvas_nodes/get_canvas_node to get imageUrl/videoUrl, "
                "then pass URLs in the desired order and write the prompt using numbered references."
            ),
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": ["video_url", "prompt", "mode"],
            },
        },
    }


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

async def _get_global_video_config(db: AsyncSession) -> dict:
    """获取全局视频配置（与 generate_video 共享）。"""
    result = await db.execute(
        select(ToolConfig).where(ToolConfig.tool_name == "generate_video")
    )
    tool_config = result.scalar_one_or_none()
    return (tool_config.config if tool_config else {}) or {}


# ---------------------------------------------------------------------------
# Tool Execution
# ---------------------------------------------------------------------------

async def _execute_video_edit_tool(args: dict, ctx: "ToolContext") -> str:
    """Execute edit_video tool: submit edit/extend task and return task ID."""
    db = ctx.db

    video_url = args.get("video_url", "")
    prompt = args.get("prompt", "")
    mode = args.get("mode", "edit")
    duration = args.get("duration")
    reference_images_raw = args.get("reference_images", [])
    reference_audios_raw = args.get("reference_audios", [])
    additional_videos_raw = args.get("additional_videos", [])

    # 映射工具模式到 video_mode
    video_mode = _MODE_TO_VIDEO_MODE.get(mode, "edit")

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

    # 从 LLMProvider.provider_type 提取视频供应商类型
    provider_type = extract_video_provider_type(provider.provider_type) or infer_provider_type(model, provider.provider_type)

    # 合并配置
    final_duration = duration or video_cfg.get("duration", 6)
    final_quality = video_cfg.get("quality", "720p")
    final_aspect = video_cfg.get("aspect_ratio", "16:9")

    # 构建参考媒体列表
    ref_images = [{"url": u} for u in reference_images_raw] if reference_images_raw else []
    ref_audios = [{"url": u} for u in reference_audios_raw] if reference_audios_raw else []

    # 构建参考视频列表:
    # - edit 模式: video_url 作为参考视频 (Ark 使用 reference_video 角色)
    # - extend 模式: video_url + additional_videos 合并为参考视频列表
    ref_videos = [{"url": video_url}]
    ref_videos.extend({"url": u} for u in additional_videos_raw)

    # 构建 VideoContext
    # 保持向后兼容: image_url 仍传递给 xAI 等使用 image 字段的供应商
    # reference_videos 用于 Ark Seedance 等使用 reference_video 角色的供应商
    video_ctx = VideoContext(
        api_key=provider.api_key,
        model=model,
        prompt=prompt,
        provider_type=provider_type,
        image_url=video_url if video_mode == "edit" else None,
        extension_video_url=video_url if video_mode == "video_extension" else None,
        duration=final_duration,
        quality=final_quality,
        aspect_ratio=final_aspect,
        video_mode=video_mode,
        reference_images=ref_images,
        reference_videos=ref_videos,
        reference_audios=ref_audios,
    )

    # 提交任务
    try:
        video_result = await submit_video_task(video_ctx)
    except Exception as e:
        logger.error("edit_video tool submit error: %s", e)
        return json.dumps({"error": "Video editing submission failed: " + str(e)})

    if video_result.status == "failed":
        return json.dumps({"error": "Video editing failed: " + (video_result.error or "Unknown error")})

    # 创建 VideoTask 记录
    input_image_count = len(ref_images)
    task = VideoTask(
        xai_task_id=video_result.task_id,
        session_id=ctx.session_id,
        provider_id=provider_id,
        model=model,
        user_id=ctx.user_id,
        video_mode=video_mode,
        prompt=prompt,
        image_url=video_url,
        duration=final_duration,
        quality=final_quality,
        aspect_ratio=final_aspect,
        status="pending",
        input_image_count=input_image_count,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    logger.info("Video edit task created via tool: %s (%s: %s)", task.id, provider_type, video_result.task_id)

    mode_label = {"edit": "Video editing", "extend": "Video extension"}.get(mode, "Video processing")

    return (
        mode_label + " task submitted successfully.\n\n"
        "**Task ID:** " + task.id + "\n"
        "**Mode:** " + video_mode + "\n"
        "**Model:** " + model + "\n"
        "**Status:** Pending\n\n"
        "The video is now being processed. This typically takes 1-5 minutes. "
        "The user will be notified when it's ready.\n\n"
        "<!-- __VIDEO_TASK__|" + task.id + "|" + video_mode + "|" + model + " -->"
    )


# ---------------------------------------------------------------------------
# VideoEditProvider class
# ---------------------------------------------------------------------------

class VideoEditProvider:
    """Provider for AI video editing / extension tool."""

    display_name = "视频编辑"
    description = "AI 视频编辑（修改、扩展现有视频）"
    condition = "需要启用全局配置且模型支持视频编辑或扩展"

    @property
    def tool_names(self) -> frozenset[str]:
        return frozenset({VIDEO_EDIT_TOOL_NAME})

    async def build_defs(self, ctx: "ToolContext") -> list[dict]:
        """Build tool definitions if enabled and model supports edit/extend."""
        # Skill-gate: 如果 video_tools skill 已配置但未加载，延迟注入
        if ctx.is_skill_gated("video_tools"):
            return []

        # 当 video_tools skill 被显式加载时，跳过 agent 级别的开关检查
        skill_explicitly_loaded = "video_tools" in ctx.loaded_tool_skills

        # 检查智能体级别的视频开关（仅在非 skill-gate 模式下检查）
        agent_video_enabled = skill_explicitly_loaded or (ctx.agent.video_config or {}).get("video_generation_enabled", False)
        if not agent_video_enabled:
            return []

        # 从全局配置读取
        global_config = await ctx.get_global_video_config()
        is_enabled = global_config.get("video_generation_enabled", False)

        if not is_enabled:
            return []

        # 检查供应商支持
        provider_type = await ctx.resolve_video_provider_type()
        if provider_type not in _TOOL_VIDEO_PROVIDERS:
            return []

        # 检查模型是否支持编辑或扩展
        model_name = global_config.get("video_model", "")
        caps = get_model_capabilities(model_name)

        # 模型既不支持编辑也不支持扩展时，不注册此工具
        has_edit_caps = caps and (caps.get("supports_video_edit") or caps.get("supports_video_extension"))
        return [_build_video_edit_tool_def(caps)] if has_edit_caps else []

    async def execute(self, name: str, args: dict, ctx: "ToolContext") -> str:
        return await _execute_video_edit_tool(args, ctx)

    def rebuild_defs(self, ctx: "ToolContext") -> list[dict] | None:
        return None

    def get_tool_metadata(self) -> list[dict]:
        """Return static metadata for registry display."""
        d = _build_video_edit_tool_def()
        return [
            {
                "name": d["function"]["name"],
                "description": d["function"]["description"],
                "parameters": d["function"]["parameters"],
            }
        ]
