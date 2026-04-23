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
from services.video_providers import VIDEO_PROVIDER_TYPES, extract_video_provider_type
from services.video_providers.base import VideoContext
from services.video_providers.model_capabilities import (
    VIDEO_MODEL_CAPABILITIES,
    get_model_capabilities,
)
from services.video_providers.virtual_human_presets import list_presets as list_vh_presets
from services.media_utils import resolve_media_filepath

if TYPE_CHECKING:
    from models import Agent
    from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
VIDEO_GEN_TOOL_NAME = "generate_video"
VH_PRESETS_TOOL_NAME = "list_virtual_human_presets"

# Seedance 2.0 系列模型 (支持虚拟人像)
_SEEDANCE_V2_MODELS = frozenset({
    "doubao-seedance-2-0-260128",
    "doubao-seedance-2-0-fast-260128",
})

# Superset fallback enums (used when model capabilities are unknown)
_DEFAULT_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"]
_DEFAULT_DURATIONS = [4, 5, 6, 8, 10]
_DEFAULT_RESOLUTIONS = ["480p", "720p", "768p", "1080p"]
_DEFAULT_MODES = ["text_to_video", "image_to_video"]

def _resolve_local_media(url: str | None) -> str | None:
    """将本地 /api/media/xxx.jpg 路径转换为 base64 data URI。

    供应商 API (Gemini/xAI/MiniMax) 需要 data: URI 或 http(s) URL；
    本地相对路径无法被远端 API 访问，需要读取文件内联编码。
    """
    # None 或已是可用格式 → 原样返回
    # asset:// 协议 (火山方舟虚拟人像库) 直接透传给 Ark API
    is_asset = url and url.startswith("asset://")
    is_local = url and url.startswith("/api/media/") and not is_asset
    (not is_local) and None  # no-op, just avoid nested if
    if not is_local:
        return url
    filename = url.rsplit("/", 1)[-1]
    filepath = resolve_media_filepath(filename)
    if not filepath:
        logger.warning("Local media file not found: %s", filename)
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
                "image_to_video: generate from a reference image (first frame). "
                "reference_images: multimodal reference generation using reference images/videos/audios. "
                "Default is text_to_video."
            ),
        },
        "aspect_ratio": {
            "type": "string",
            "enum": aspect_ratios,
            "description": "Video aspect ratio. 'adaptive' lets the model auto-select. Default is 16:9.",
        },
        "duration": {
            "type": "integer",
            "description": (
                "Video duration in seconds. Use -1 to let the model auto-select duration. "
                f"Available values: {', '.join(str(d) for d in durations)}."
            ),
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
                "URL of a reference image for image_to_video mode (used as first frame). "
                "Required when video_mode is image_to_video."
            ),
        }
    )

    # 尾帧图片 (supports_last_frame)
    caps.get("supports_last_frame") and properties.update(
        last_frame_image={
            "type": "string",
            "description": (
                "URL of the last frame image. Used with image_to_video mode "
                "to create a video transitioning from first frame to last frame."
            ),
        }
    )

    # 参考图片数组 (supports_reference_images)
    caps.get("supports_reference_images") and properties.update(
        reference_images={
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Array of reference image URLs for multimodal reference generation. "
                f"Max {caps.get('max_reference_images', 9)} images. "
                "Use video_mode='reference_images'. "
                "NUMBERING: array index determines prompt reference — "
                "index 0 = 图片1, index 1 = 图片2, etc. "
                "Get URLs from canvas image nodes via get_canvas_node (data.imageUrl field)."
            ),
        }
    )

    # 参考视频数组 (supports_reference_videos)
    caps.get("supports_reference_videos") and properties.update(
        reference_videos={
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Array of reference video URLs for multimodal reference or video extension. "
                f"Max {caps.get('max_reference_videos', 3)} videos. "
                "NUMBERING: array index determines prompt reference — "
                "index 0 = 视频1, index 1 = 视频2, etc. "
                "Get URLs from canvas video nodes via get_canvas_node (data.videoUrl field)."
            ),
        }
    )

    # 参考音频数组 (supports_reference_audios)
    caps.get("supports_reference_audios") and properties.update(
        reference_audios={
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Array of reference audio URLs for multimodal reference generation. "
                f"Max {caps.get('max_reference_audios', 3)} audios (wav/mp3, 2-15s each). "
                "NUMBERING: array index determines prompt reference — "
                "index 0 = 音频1, index 1 = 音频2, etc."
            ),
        }
    )

    # 返回尾帧 (supports_return_last_frame)
    caps.get("supports_return_last_frame") and properties.update(
        return_last_frame={
            "type": "boolean",
            "description": (
                "Set to true to return the last frame image of the generated video. "
                "Useful for generating consecutive videos by chaining last frame as next first frame."
            ),
        }
    )

    return {
        "type": "function",
        "function": {
            "name": VIDEO_GEN_TOOL_NAME,
            "description": "Generate a video from text, images, videos, or audio references. Returns a task ID.",
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
    last_frame_image = args.get("last_frame_image")
    reference_images_raw = args.get("reference_images", [])
    reference_videos_raw = args.get("reference_videos", [])
    reference_audios_raw = args.get("reference_audios", [])
    return_last_frame = args.get("return_last_frame", False)

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
    video_provider_type = extract_video_provider_type(provider.provider_type)
    # 备用：根据模型名推断
    video_provider_type = video_provider_type or infer_provider_type(model, provider.provider_type)

    # 合并配置：全局配置 > 工具参数（管理员设定优先）
    final_duration = video_cfg.get("duration") or duration or 6
    final_quality = video_cfg.get("quality") or quality or "720p"
    final_aspect = video_cfg.get("aspect_ratio") or aspect_ratio or "16:9"

    # 将本地媒体路径转换为 base64 data URI（供应商 API 需要 data: 或 http URL）
    image_url = _resolve_local_media(image_url)
    last_frame_image = _resolve_local_media(last_frame_image)

    # 构建参考媒体列表
    ref_images = [{"url": _resolve_local_media(u)} for u in reference_images_raw] if reference_images_raw else []
    ref_videos = [{"url": _resolve_local_media(u)} for u in reference_videos_raw] if reference_videos_raw else []
    ref_audios = [{"url": u} for u in reference_audios_raw] if reference_audios_raw else []

    # 构建 VideoContext
    video_ctx = VideoContext(
        api_key=provider.api_key,
        model=model,
        prompt=prompt,
        provider_type=video_provider_type,
        image_url=image_url,
        last_frame_image=last_frame_image,
        duration=final_duration,
        quality=final_quality,
        aspect_ratio=final_aspect,
        video_mode=video_mode,
        reference_images=ref_images,
        reference_videos=ref_videos,
        reference_audios=ref_audios,
        return_last_frame=return_last_frame,
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
    input_image_count += 1 if last_frame_image else 0
    input_image_count += len(ref_images)

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

    logger.info("Video task created via tool: %s (%s: %s)", task.id, video_provider_type, video_result.task_id)

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
# Virtual Human Presets Tool
# ---------------------------------------------------------------------------

_VH_PRESETS_TOOL_DEF = {
    "type": "function",
    "function": {
        "name": VH_PRESETS_TOOL_NAME,
        "description": (
            "List available virtual human presets from Volcano Engine Ark platform. "
            "Seedance 2.0 does not allow uploading real human face images directly — "
            "use these preset virtual humans as reference images instead. "
            "Returns asset URIs (asset://<id>) that can be passed to generate_video's reference_images."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "gender": {
                    "type": "string",
                    "enum": ["male", "female"],
                    "description": "Filter by gender. Omit to list all.",
                },
                "style": {
                    "type": "string",
                    "description": "Filter by style tag (e.g. 'realistic', 'youthful'). Omit to list all.",
                },
            },
            "required": [],
        },
    },
}


async def _execute_vh_presets_tool(args: dict, ctx: "ToolContext") -> str:
    """Execute list_virtual_human_presets tool."""
    gender = args.get("gender")
    style = args.get("style")
    presets = await list_vh_presets(gender=gender, style=style)

    lines = [
        f"Found {len(presets)} virtual human preset(s).\n",
        "Use the `asset_uri` value as an element in `reference_images` when calling `generate_video`.\n",
    ]
    for p in presets:
        lines.append(
            f"- **{p['name']}** | {p['gender']} | {p['style']}\n"
            f"  Asset URI: `{p['asset_uri']}`\n"
            f"  Preview: {p['preview_url']}\n"
            f"  {p['description']}\n"
        )

    return "\n".join(lines) if presets else "No virtual human presets available. Contact admin to add presets."


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
        return frozenset({VIDEO_GEN_TOOL_NAME, VH_PRESETS_TOOL_NAME})

    async def build_defs(self, ctx: "ToolContext") -> list[dict]:
        # Skill-gate: 如果 video_tools skill 已配置但未加载，延迟注入
        if ctx.is_skill_gated("video_tools"):
            return []

        # 当 video_tools skill 被显式加载时，跳过 agent 级别的开关检查
        # （skill 加载本身就是授权）
        skill_explicitly_loaded = "video_tools" in ctx.loaded_tool_skills

        # 检查智能体级别的视频生成开关（仅在非 skill-gate 模式下检查）
        agent_video_enabled = skill_explicitly_loaded or (ctx.agent.video_config or {}).get("video_generation_enabled", False)
        if not agent_video_enabled:
            return []

        # 从全局 ToolConfig 读取配置
        global_config = await ctx.get_global_video_config()
        is_enabled = global_config.get("video_generation_enabled", False)

        if not is_enabled:
            return []

        # 检查供应商是否支持工具调用视频生成 (使用代码级注册表)
        provider_type = await ctx.resolve_video_provider_type()
        is_supported = provider_type in VIDEO_PROVIDER_TYPES
        # 供应商类型未注册则不启用工具
        _ = is_supported or logger.debug("Video provider %s not in registered types", provider_type)
        is_supported or None  # no-op placeholder
        if not is_supported:
            return []

        # 获取模型能力以动态构建参数枚举
        model_name = global_config.get("video_model", "")
        caps = get_model_capabilities(model_name)
        defs = [_build_video_gen_tool_def(model_name, caps)]

        # Seedance 2.0 系列模型注入虚拟人像预制工具
        (model_name in _SEEDANCE_V2_MODELS) and defs.append(_VH_PRESETS_TOOL_DEF)

        return defs

    async def execute(self, name: str, args: dict, ctx: "ToolContext") -> str:
        return (
            await _execute_vh_presets_tool(args, ctx)
            if name == VH_PRESETS_TOOL_NAME
            else await _execute_video_gen_tool(args, ctx)
        )

    def rebuild_defs(self, ctx: "ToolContext") -> list[dict] | None:
        return None

    def get_tool_metadata(self) -> list[dict]:
        """Return static metadata for registry display (uses superset)."""
        d = _build_video_gen_tool_def()
        vh = _VH_PRESETS_TOOL_DEF
        return [
            {
                "name": d["function"]["name"],
                "description": d["function"]["description"],
                "parameters": d["function"]["parameters"],
            },
            {
                "name": vh["function"]["name"],
                "description": vh["function"]["description"],
                "parameters": vh["function"]["parameters"],
            },
        ]
