"""
MusicGenProvider — AI 音乐生成工具。

支持 Google Lyria 3 模型（Clip 30s / Pro 完整歌曲）。
音乐生成为异步模式：execute() 提交后台任务并立即返回任务 ID。
"""
from __future__ import annotations

import asyncio
import json
import logging
import base64
import mimetypes
from pathlib import Path
from typing import Any, TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import LLMProvider, MusicTask, ToolConfig
from services.music_providers import MUSIC_PROVIDER_TYPES, extract_music_provider_type
from services.music_providers.base import MusicContext
from services.music_generation import execute_music_task_background
from services.media_utils import resolve_media_filepath

if TYPE_CHECKING:
    from models import Agent
    from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MUSIC_GEN_TOOL_NAME = "generate_music"

# 模型能力映射表
_MODEL_CAPS: dict[str, dict[str, Any]] = {
    "lyria-3-clip-preview": {
        "formats": ["mp3"],
        "duration_hint": "固定 30 秒短片",
        "supports_wav": False,
    },
    "lyria-3-pro-preview": {
        "formats": ["mp3", "wav"],
        "duration_hint": "完整歌曲（约 1-2 分钟，可通过提示词控制）",
        "supports_wav": True,
    },
}


def _resolve_local_media(url: str | None) -> str | None:
    """将本地 /api/media/xxx.jpg 路径转换为 base64 data URI。"""
    is_local = url and url.startswith("/api/media/")
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
    return f"data:{mime};base64,{b64}"


# ---------------------------------------------------------------------------
# Tool Definition
# ---------------------------------------------------------------------------

def _build_music_gen_tool_def(
    model_name: str = "",
    capabilities: dict | None = None,
) -> dict:
    """构建 OpenAI 格式的 generate_music 工具定义。"""
    caps = capabilities or {}
    formats = caps.get("formats", ["mp3"])

    properties: dict[str, Any] = {
        "prompt": {
            "type": "string",
            "description": (
                "Detailed description of the music to generate. "
                "Include genre, instruments, BPM, key/scale, mood, and structure. "
                "You can use section tags like [Verse], [Chorus], [Bridge], [Intro], [Outro] "
                "to define song structure, or timestamps like [0:00-0:30] for precise timing. "
                "Include custom lyrics directly in the prompt. "
                "For instrumental tracks, add 'Instrumental only, no vocals'. "
                "Write prompts in the language you want the lyrics in."
            ),
        },
        "output_format": {
            "type": "string",
            "enum": formats,
            "description": (
                "Audio output format. 'mp3' is universally supported. "
                "'wav' provides higher quality (48kHz stereo) but is only available for the Pro model."
            ),
        },
        "reference_images": {
            "type": "array",
            "items": {"type": "string"},
            "description": (
                "Array of image URLs for multimodal music generation. "
                "The model will compose music inspired by the visual content (mood, colors, atmosphere). "
                "Max 10 images. Get URLs from canvas image nodes via get_canvas_node (data.imageUrl field)."
            ),
        },
    }

    return {
        "type": "function",
        "function": {
            "name": MUSIC_GEN_TOOL_NAME,
            "description": (
                "Generate music, songs, or audio clips from a text prompt using AI. "
                "Supports genres (pop, rock, jazz, electronic, classical, lo-fi, etc.), "
                "custom lyrics with [Verse]/[Chorus]/[Bridge] tags, "
                "timestamp-based structure control, instrumental tracks, "
                "and image-inspired composition. "
                "Music generation is asynchronous and takes 30-120 seconds. "
                "The tool returns a task ID; the user will be notified when the audio is ready.\n\n"
                "PROMPTING TIPS:\n"
                "- Be specific: genre, instruments, BPM, key, mood\n"
                "- Use section tags: [Verse 1], [Chorus], [Bridge], [Outro]\n"
                "- Use timestamps: [0:00-0:10] Intro: soft piano, [0:10-0:30] Verse: add drums\n"
                "- Custom lyrics: include lyrics within section tags\n"
                "- Instrumental: always add 'Instrumental only, no vocals'\n"
                "- Language: write prompt in the language for the lyrics"
            ),
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": ["prompt"],
            },
        },
    }


# ---------------------------------------------------------------------------
# Tool Execution
# ---------------------------------------------------------------------------

async def _execute_music_gen_tool(args: dict, ctx: "ToolContext") -> str:
    """执行 generate_music 工具：提交后台任务并返回任务 ID。"""
    db = ctx.db

    prompt = args.get("prompt", "")
    output_format = args.get("output_format", "mp3")
    reference_images_raw = args.get("reference_images", [])

    # 从全局 ToolConfig 读取配置
    cfg = await ctx.get_global_music_config()
    provider_id = cfg.get("music_provider_id")
    model = cfg.get("music_model", "")
    music_cfg = cfg.get("music_config") or {}

    # 全局配置覆盖输出格式
    configured_format = music_cfg.get("output_format")
    final_format = configured_format or output_format or "mp3"

    # 查找 LLMProvider
    result = await db.execute(
        select(LLMProvider).where(LLMProvider.id == provider_id, LLMProvider.is_active == True)
    )
    provider = result.scalar_one_or_none()

    if not provider:
        return json.dumps({"error": "Music provider not found or inactive. Please configure music generation in admin tools."})

    # 提取音乐供应商类型
    music_provider_type = extract_music_provider_type(provider.provider_type)
    if not music_provider_type:
        return json.dumps({"error": f"Provider type '{provider.provider_type}' does not support music generation."})

    # 将本地媒体路径转换为 base64 data URI
    ref_images = []
    for u in reference_images_raw[:10]:
        resolved = _resolve_local_media(u)
        mime, _ = mimetypes.guess_type(u) if not (resolved or "").startswith("data:") else (None, None)
        ref_images.append({"url": resolved or u, "mime_type": mime or "image/jpeg"})

    # 构建 MusicContext
    music_ctx = MusicContext(
        api_key=provider.api_key,
        model=model,
        prompt=prompt,
        provider_type=music_provider_type,
        output_format=final_format,
        reference_images=ref_images,
    )

    # 创建 MusicTask 记录
    task = MusicTask(
        session_id=ctx.session_id,
        provider_id=provider_id,
        model=model,
        user_id=ctx.user_id,
        prompt=prompt,
        output_format=final_format,
        input_image_count=len(ref_images),
        status="processing",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    logger.info("Music task created via tool: %s (%s: %s)", task.id, music_provider_type, model)

    # 启动后台任务
    asyncio.create_task(
        execute_music_task_background(
            task_id=task.id,
            music_ctx=music_ctx,
            provider_id=provider_id,
            user_id=ctx.user_id,
            session_id=ctx.session_id,
            theater_id=ctx.theater_id,
        )
    )

    # 将任务信息存入 ctx，供 chat_generation 发送 SSE 事件
    ctx.music_tasks.append({"task_id": task.id, "model": model})

    # 返回 LLM 可读的结果
    return (
        "Music generation task submitted successfully.\n\n"
        "**Task ID:** " + task.id + "\n"
        "**Model:** " + model + "\n"
        "**Format:** " + final_format + "\n"
        "**Status:** Processing\n\n"
        "The music is now being generated. This typically takes 30-120 seconds. "
        "The user will be notified when it's ready.\n\n"
        "<!-- __MUSIC_TASK__|" + task.id + "|" + model + " -->"
    )


# ---------------------------------------------------------------------------
# MusicGenProvider class
# ---------------------------------------------------------------------------

class MusicGenProvider:
    """Provider for AI music generation tool."""

    display_name = "音乐生成"
    description = "AI 音乐生成（文本/图像到音乐，支持 Lyria 3 模型）"
    condition = "需要启用全局配置且供应商支持音乐生成"

    @property
    def tool_names(self) -> frozenset[str]:
        return frozenset({MUSIC_GEN_TOOL_NAME})

    async def build_defs(self, ctx: "ToolContext") -> list[dict]:
        # Skill-gate: 如果 music_tools skill 已配置但未加载，延迟注入
        if ctx.is_skill_gated("music_tools"):
            return []

        # 当 music_tools skill 被显式加载时，跳过 agent 级别的开关检查
        skill_explicitly_loaded = "music_tools" in ctx.loaded_tool_skills

        # 仅在非 skill-gate 模式下检查（skill 加载本身就是授权）
        if not skill_explicitly_loaded:
            return []

        # 从全局 ToolConfig 读取配置
        global_config = await ctx.get_global_music_config()
        is_enabled = global_config.get("music_generation_enabled", False)

        if not is_enabled:
            return []

        # 检查供应商是否支持音乐生成
        provider_type = await ctx.resolve_music_provider_type()
        is_supported = provider_type in MUSIC_PROVIDER_TYPES
        if not is_supported:
            return []

        # 获取模型能力以动态构建参数枚举
        model_name = global_config.get("music_model", "")
        caps = _MODEL_CAPS.get(model_name, {})
        return [_build_music_gen_tool_def(model_name, caps)]

    async def execute(self, name: str, args: dict, ctx: "ToolContext") -> str:
        return await _execute_music_gen_tool(args, ctx)

    def rebuild_defs(self, ctx: "ToolContext") -> list[dict] | None:
        return None

    def get_tool_metadata(self) -> list[dict]:
        """Return static metadata for registry display."""
        d = _build_music_gen_tool_def()
        return [
            {
                "name": d["function"]["name"],
                "description": d["function"]["description"],
                "parameters": d["function"]["parameters"],
            }
        ]
