"""
TTSGenProvider — AI 语音合成（TTS）工具。

支持 Google Gemini TTS 模型（单说话人 / 双说话人对话）。
TTS 合成为异步模式：execute() 提交后台任务并立即返回任务 ID。
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, TYPE_CHECKING

from database import safe_commit
from services.tts_providers import TTS_PROVIDER_TYPES, PREBUILT_VOICES
from services.tts_generation import submit_tts_task

if TYPE_CHECKING:
    from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TTS_GEN_TOOL_NAME = "generate_tts"

# 按性别分组并附语气特征（供工具描述引导 Agent 按男/女 + 声音特质精准选音色）
# 形如 "Kore (firm)"：括号内为音色固有语气，仅用于描述，Agent 只需回传音色名
_FEMALE_VOICES = [f"{name} ({tone.lower()})" for name, tone, g in PREBUILT_VOICES if g == "female"]
_MALE_VOICES = [f"{name} ({tone.lower()})" for name, tone, g in PREBUILT_VOICES if g == "male"]

# 防御：LLM 可能把描述里的 "Kore (firm)" 整串回传，剥离尾部括注只保留音色名（"auto" 不受影响）
_VOICE_ANNOTATION_RE = re.compile(r"\s*[\(（][^\)）]*[\)）]\s*$")


# ---------------------------------------------------------------------------
# Tool Definition
# ---------------------------------------------------------------------------

def _build_tts_gen_tool_def(
    model_name: str = "",
    capabilities: dict | None = None,
) -> dict:
    """构建 OpenAI 格式的 generate_tts 工具定义。"""
    properties: dict[str, Any] = {
        "text": {
            "type": "string",
            "description": (
                "The verbatim text to speak (single-speaker mode). "
                "The model reads this text exactly as written — put delivery instructions "
                "in the 'style' parameter instead of the text. "
                "Inline vocal tags like <laugh>, <sigh>, <cough>, <breath>, <short pause> "
                "are allowed inside the text for point-in-time effects."
            ),
        },
        "voice": {
            "type": "string",
            "description": (
                "Voice for single-speaker mode. Use 'auto' to let the model pick a suitable voice (default). "
                "Gender is an intrinsic property of each voice and CANNOT be changed via 'style' — "
                "to get a male or female speaker, choose a voice of that gender. "
                "Each entry below is 'Name (characteristic)': pick the name whose characteristic fits the role, "
                "but pass ONLY the bare name as the value (e.g. 'Kore', NOT 'Kore (firm)'). "
                "Female voices: " + ", ".join(_FEMALE_VOICES) + ". "
                "Male voices: " + ", ".join(_MALE_VOICES) + ". "
                "You may also pass a persisted replicated voice ID (a string starting with 'voice_') "
                "that the user has created, to speak in a cloned voice."
            ),
        },
        "style": {
            "type": "string",
            "description": (
                "Turn-level delivery style applied to the whole speech, "
                "e.g. 'cheerful and friendly', 'whispered urgently', 'calm and relaxed', "
                "'warm narrator tone'. The text language is detected automatically."
            ),
        },
        "speakers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "speaker": {"type": "string", "description": "Character name, e.g. 'Joe'"},
                    "voice": {"type": "string", "description": "Voice for this speaker (pass the bare name only). Female e.g. " + ", ".join(_FEMALE_VOICES[:5]) + "; Male e.g. " + ", ".join(_MALE_VOICES[:5]) + "; or a replicated 'voice_...' ID. Omit to use auto."},
                    "text": {"type": "string", "description": "This speaker's line (verbatim)"},
                    "style": {"type": "string", "description": "Optional per-turn delivery style"},
                },
                "required": ["speaker", "text"],
            },
            "description": (
                "For two-speaker dialogue ONLY (max 2 speakers). "
                "Pass each turn as one item with speaker name, voice, and text. "
                "When provided, 'text'/'voice'/'style' top-level parameters are ignored."
            ),
        },
    }

    return {
        "type": "function",
        "function": {
            "name": TTS_GEN_TOOL_NAME,
            "description": (
                "Convert text to natural-sounding speech (TTS) using AI. "
                "Supports single-speaker narration (audiobooks, voiceovers, podcasts) "
                "and two-speaker conversational dialogue with distinct voices. "
                "Controllable delivery: use 'style' for sustained tone/emotion/pace, "
                "and inline tags (<laugh>, <sigh>, <short pause>) inside text for momentary effects. "
                "Speech generation is asynchronous and takes 10-60 seconds. "
                "The tool returns a task ID; the user will be notified when the audio is ready.\n\n"
                "PROMPTING TIPS:\n"
                "- Keep 'text' as the exact verbatim transcript — never put stage directions in it\n"
                "- Put emotions/pace/tone in 'style' (e.g. 'whispered urgently')\n"
                "- For dialogue, use 'speakers' with one item per turn (max 2 speakers)\n"
                "- The speech language follows the text language automatically"
            ),
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": [],
            },
        },
    }


# ---------------------------------------------------------------------------
# Tool Execution
# ---------------------------------------------------------------------------

async def _execute_tts_gen_tool(args: dict, ctx: "ToolContext") -> str:
    """执行 generate_tts 工具：提交后台任务并返回任务 ID。"""
    db = ctx.db

    text = args.get("text", "") or ""
    # 防御：剥离 LLM 可能回传的尾部括注（如 "Kore (firm)" → "Kore"），"auto" 不受影响
    voice = _VOICE_ANNOTATION_RE.sub("", args.get("voice", "") or "").strip()
    style = args.get("style", "") or ""
    speakers_raw = args.get("speakers", []) or []

    # 从全局 ToolConfig 读取配置
    cfg = await ctx.get_global_tts_config()
    provider_id = cfg.get("tts_provider_id")
    model = cfg.get("tts_model", "")
    tts_cfg = cfg.get("tts_config") or {}

    # 全局配置覆盖默认音色/输出格式；"auto"/空 = 由模型自动选择音色
    configured_voice = (tts_cfg.get("voice") or "").strip()
    final_voice = voice or ("" if configured_voice.lower() == "auto" else configured_voice)
    final_format = tts_cfg.get("output_format") or "wav"

    speakers = [
        {"speaker": s.get("speaker", ""), "voice": _VOICE_ANNOTATION_RE.sub("", s.get("voice", "") or "").strip(), "text": s.get("text", ""), "style": s.get("style", "")}
        for s in speakers_raw[:2]
        if isinstance(s, dict) and s.get("speaker") and s.get("text")
    ]

    if not text.strip() and not speakers:
        return json.dumps({"error": "Either 'text' or 'speakers' must be provided"})

    # 委托 submit_tts_task 统一处理 provider 校验 / ctx 构造 / 入队
    result = await submit_tts_task(
        db=db,
        user_id=ctx.user_id,
        text=text,
        model=model,
        provider_id=provider_id,
        session_id=ctx.session_id,
        theater_id=ctx.theater_id,
        voice=final_voice,
        style=style,
        speakers=speakers,
        output_format=final_format,
    )

    error = result.get("error")
    if error:
        return json.dumps({"error": error})

    task_id = result["task_id"]
    logger.info("TTS task created via tool: %s (%s)", task_id, model)

    # 画布桥接：创建占位 TTS 节点
    ctx.theater_id and await _bridge_tts_placeholder(task_id, text or _speakers_summary(speakers), ctx)

    # 将任务信息存入 ctx，供 chat_generation 发送 SSE 事件
    ctx.tts_tasks.append({"task_id": task_id, "model": model})

    # 返回 LLM 可读的结果
    return (
        "Speech generation task submitted successfully.\n\n"
        "**Task ID:** " + task_id + "\n"
        "**Model:** " + model + "\n"
        "**Voice:** " + (", ".join(s["speaker"] for s in speakers) if speakers else (final_voice or "auto")) + "\n"
        "**Status:** Processing\n\n"
        "The speech audio is now being generated. This typically takes 10-60 seconds. "
        "The user will be notified when it's ready.\n\n"
        "<!-- __TTS_TASK__|" + task_id + "|" + model + " -->"
    )


def _speakers_summary(speakers: list[dict]) -> str:
    """多说话人模式下的占位节点摘要文本。"""
    return "\n".join(f"{s['speaker']}: {s['text']}" for s in speakers)


async def _bridge_tts_placeholder(task_id: str, prompt: str, ctx: "ToolContext") -> None:
    """Create a placeholder TTS node on the canvas (errors swallowed)."""
    try:
        from database import AsyncSessionLocal
        from models import TTSTask
        from services.media_canvas_bridge import create_placeholder_node
        from sqlalchemy import select
        name = (prompt[:30] + "...") if len(prompt) > 30 else (prompt or "Generating Speech")
        async with AsyncSessionLocal() as bridge_db:
            node_id = await create_placeholder_node("tts", name, prompt, ctx.theater_id, bridge_db)
            # Store node_id on the task record
            task = (await bridge_db.execute(select(TTSTask).where(TTSTask.id == task_id))).scalar_one_or_none()
            task and setattr(task, "canvas_node_id", node_id)
            task and await safe_commit(bridge_db)
    except Exception as e:
        logger.error("TTS canvas bridge failed: %s", e)


# ---------------------------------------------------------------------------
# TTSGenProvider class
# ---------------------------------------------------------------------------

class TTSGenProvider:
    """Provider for AI text-to-speech tool."""

    display_name = "语音合成"
    description = "AI 语音合成（文本到语音，支持 Gemini TTS 单/双说话人）"
    condition = "需要启用全局配置且供应商支持语音合成"

    @property
    def tool_names(self) -> frozenset[str]:
        return frozenset({TTS_GEN_TOOL_NAME})

    async def build_defs(self, ctx: "ToolContext") -> list[dict]:
        # Skill-gate: 如果 tts_tools skill 已配置但未加载，延迟注入
        if ctx.is_skill_gated("tts_tools"):
            return []

        # 当 tts_tools skill 被显式加载时，跳过 agent 级别的开关检查
        skill_explicitly_loaded = "tts_tools" in ctx.loaded_tool_skills

        # 仅在非 skill-gate 模式下检查（skill 加载本身就是授权）
        if not skill_explicitly_loaded:
            return []

        # 从全局 ToolConfig 读取配置
        global_config = await ctx.get_global_tts_config()
        is_enabled = global_config.get("tts_generation_enabled", False)

        if not is_enabled:
            return []

        # 检查供应商是否支持 TTS
        provider_type = await ctx.resolve_tts_provider_type()
        is_supported = provider_type in TTS_PROVIDER_TYPES
        if not is_supported:
            return []

        # 获取模型能力以动态构建参数枚举
        model_name = global_config.get("tts_model", "")
        return [_build_tts_gen_tool_def(model_name)]

    async def execute(self, name: str, args: dict, ctx: "ToolContext") -> str:
        return await _execute_tts_gen_tool(args, ctx)

    def rebuild_defs(self, ctx: "ToolContext") -> list[dict] | None:
        return None

    def get_tool_metadata(self) -> list[dict]:
        """Return static metadata for registry display."""
        d = _build_tts_gen_tool_def()
        return [
            {
                "name": d["function"]["name"],
                "description": d["function"]["description"],
                "parameters": d["function"]["parameters"],
            }
        ]
