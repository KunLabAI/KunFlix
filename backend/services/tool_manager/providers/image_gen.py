"""
ImageGenProvider — AI image generation tool.

Supports multiple providers (xAI, Gemini, ...) via dispatch map.
Adding a new provider requires:
  1. A handler function with the standard signature
  2. An entry in _IMAGE_GENERATORS
  3. An entry in _TOOL_GEN_PROVIDERS
"""
from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import LLMProvider, Agent, ToolConfig
from services.xai_image_gen import (
    batch_generate_xai_images,
    XAIBatchImageConfig,
)
from services.ark_image_gen import (
    batch_generate_ark_images,
    ArkBatchImageConfig,
)
from services.batch_image_gen import (
    batch_generate_images,
    BatchImageConfig,
)
from services.image_config_adapter import to_provider_config, IMAGE_PROVIDER_CAPABILITIES
from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
IMAGE_GEN_TOOL_NAME = "generate_image"

# Image-only models that cannot have tool calling
_IMAGE_ONLY_MODELS = frozenset({"grok-imagine-image", "grok-imagine-image-pro"})

# Aspect ratio options (superset fallback for registry / unknown providers)
_ASPECT_RATIO_ENUM = [
    "auto", "1:1", "16:9", "9:16", "4:3", "3:4",
    "3:2", "2:3", "2:1", "1:2",
]

# Providers that support tool-based image generation
_TOOL_GEN_PROVIDERS = frozenset({"xai", "gemini", "ark"})

# ---------------------------------------------------------------------------
# Tool Definition (dynamic per provider)
# ---------------------------------------------------------------------------

def _build_image_gen_tool_def(provider_type: str = "") -> dict:
    """Build the OpenAI-format tool definition for generate_image.

    The aspect_ratio enum is tailored to the configured provider's
    supported values when *provider_type* is given.
    """
    caps = IMAGE_PROVIDER_CAPABILITIES.get(provider_type, {})
    aspect_ratios = caps.get("aspect_ratios", _ASPECT_RATIO_ENUM)

    return {
        "type": "function",
        "function": {
            "name": IMAGE_GEN_TOOL_NAME,
            "description": (
                "Generate images from scratch using a text prompt (text-to-image). "
                "Returns image URLs in markdown format."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "Detailed English description of the image to generate.",
                    },
                    "aspect_ratio": {
                        "type": "string",
                        "enum": aspect_ratios,
                        "description": "Image aspect ratio. Default is auto.",
                    },
                    "n": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 4,
                        "description": "Number of images to generate. Default is 1.",
                    },
                },
                "required": ["prompt"],
            },
        },
    }


def _check_agent_eligible(agent: Agent) -> bool:
    """Check basic eligibility: agent model is not image-only.
    
    Note: Image generation config is now read from ToolConfig (global),
    not from agent.image_config.
    """
    return agent.model not in _IMAGE_ONLY_MODELS


async def _get_global_image_config(db: AsyncSession) -> dict:
    """获取全局图像生成配置（从 ToolConfig 表）。"""
    result = await db.execute(
        select(ToolConfig).where(ToolConfig.tool_name == IMAGE_GEN_TOOL_NAME)
    )
    tool_config = result.scalar_one_or_none()
    return (tool_config.config if tool_config else {}) or {}


# ---------------------------------------------------------------------------
# Provider-dispatched image generation handlers
# ---------------------------------------------------------------------------

async def _generate_via_xai(
    api_key: str, base_url: str | None, model: str,
    prompt: str, config: dict, n: int,
) -> list[str]:
    img_cfg = config.get("image_config") or {}
    xai_config = XAIBatchImageConfig(
        aspect_ratio=img_cfg.get("aspect_ratio") or "auto",
        resolution=img_cfg.get("resolution") or "1k",
        n=n,
        response_format=img_cfg.get("response_format") or "b64_json",
    )
    result = await batch_generate_xai_images(
        api_key=api_key,
        model=model,
        prompts=[prompt],
        config=xai_config,
        base_url=base_url,
    )
    return [url for r in result.results for url in r.image_urls]


async def _generate_via_gemini(
    api_key: str, base_url: str | None, model: str,
    prompt: str, config: dict, n: int,
) -> list[str]:
    img_cfg = config.get("image_config") or {}
    gemini_config = BatchImageConfig(
        aspect_ratio=img_cfg.get("aspect_ratio") or "auto",
        image_size=img_cfg.get("image_size") or "2K",
        output_format=img_cfg.get("output_format") or "png",
    )
    # Gemini generates 1 image per prompt call; duplicate prompt for n images
    result = await batch_generate_images(
        api_key=api_key,
        model=model,
        prompts=[prompt] * n,
        config=gemini_config,
    )
    return [r.image_url for r in result.results if r.image_url]


async def _generate_via_ark(
    api_key: str, base_url: str | None, model: str,
    prompt: str, config: dict, n: int,
) -> list[str]:
    img_cfg = config.get("image_config") or {}
    ark_config = ArkBatchImageConfig(
        size=img_cfg.get("size") or "1K",
        n=n,
        response_format=img_cfg.get("response_format") or "url",
        watermark=img_cfg.get("watermark", False),
    )
    result = await batch_generate_ark_images(
        api_key=api_key,
        model=model,
        prompts=[prompt],
        config=ark_config,
        base_url=base_url,
    )
    return [url for r in result.results for url in r.image_urls]


# Handler dispatch map (no if-chains)
_IMAGE_GENERATORS: dict[str, Any] = {
    "xai": _generate_via_xai,
    "gemini": _generate_via_gemini,
    "ark": _generate_via_ark,
}


# ---------------------------------------------------------------------------
# Tool Execution
# ---------------------------------------------------------------------------

async def _execute_image_gen_tool(args: dict, agent: Agent, db: AsyncSession) -> str:
    prompt = args.get("prompt", "")
    aspect_ratio = args.get("aspect_ratio")

    # 从全局 ToolConfig 读取配置
    cfg = await _get_global_image_config(db)
    provider_id = cfg.get("image_provider_id")
    model = cfg.get("image_model", "")
    
    # 从全局配置读取批量生成数量
    img_cfg = cfg.get("image_config") or {}
    batch_count = img_cfg.get("batch_count")
    max_n = 10
    
    # batch_count 为 0 或未配置时表示"自动"，由智能体决定数量
    # 否则使用配置的值
    auto_mode = not batch_count or batch_count == 0
    requested_n = args.get("n")
    n = (
        min(max(requested_n if requested_n is not None else 1, 1), max_n)
        if auto_mode
        else min(max(batch_count, 1), max_n)
    )

    result = await db.execute(
        select(LLMProvider).where(LLMProvider.id == provider_id, LLMProvider.is_active == True)
    )
    provider = result.scalar_one_or_none()

    return json.dumps({"error": f"Image provider {provider_id} not found or inactive"}) if not provider else (
        await _do_generate(provider, model, prompt, aspect_ratio, n, cfg)
    )


async def _do_generate(provider, model: str, prompt: str, aspect_ratio: str | None, n: int, cfg: dict) -> str:
    adapted = to_provider_config(provider.provider_type.lower(), cfg)

    _img_cfg = (adapted.get("image_config") or {}).copy() if adapted else {}
    aspect_ratio and _img_cfg.update(aspect_ratio=aspect_ratio)
    adapted_with_override = {**adapted, "image_config": _img_cfg} if adapted else {"image_config": _img_cfg}

    generator = _IMAGE_GENERATORS.get(provider.provider_type.lower())
    return json.dumps({"error": f"Unsupported image provider type: {provider.provider_type}"}) if not generator else (
        await _run_generator(generator, provider, model, prompt, adapted_with_override, n)
    )


async def _run_generator(generator, provider, model: str, prompt: str, config: dict, n: int) -> str:
    try:
        image_urls = await generator(
            api_key=provider.api_key,
            base_url=provider.base_url,
            model=model,
            prompt=prompt,
            config=config,
            n=n,
        )
    except Exception as e:
        logger.error("generate_image tool error: %s", e)
        return json.dumps({"error": f"Image generation failed: {str(e)}"})

    return (
        "No images were generated. The request may have been filtered by content moderation."
        if not image_urls
        else f"Generated {len(image_urls)} image(s):\n\n"
             + "\n\n".join(f"![image]({url})" for url in image_urls)
    )


# ---------------------------------------------------------------------------
# ImageGenProvider class
# ---------------------------------------------------------------------------

class ImageGenProvider:
    """Provider for AI image generation tool."""

    display_name = "图像生成"
    description = "AI 图像生成（文本到图像，支持多供应商）"
    condition = "需要启用全局配置且供应商支持 tool-based 生成"

    @property
    def tool_names(self) -> frozenset[str]:
        return frozenset({IMAGE_GEN_TOOL_NAME})

    async def build_defs(self, ctx: ToolContext) -> list[dict]:
        # Skill-gate: 如果 image_tools skill 已配置但未加载，延迟注入
        if ctx.is_skill_gated("image_tools"):
            return []

        # 检查智能体模型是否支持工具调用
        if not _check_agent_eligible(ctx.agent):
            return []
        
        # 当 image_tools skill 被显式加载时，跳过 agent 级别的开关检查
        # （skill 加载本身就是授权）
        skill_explicitly_loaded = "image_tools" in ctx.loaded_tool_skills

        # 检查智能体级别的开关（仅在非 skill-gate 模式下检查）
        agent_image_enabled = skill_explicitly_loaded or (ctx.agent.image_config or {}).get("image_generation_enabled", False)
        if not agent_image_enabled:
            return []
        
        # 从全局 ToolConfig 读取配置
        global_config = await ctx.get_global_image_config()
        is_enabled = global_config.get("image_generation_enabled", False)
        
        if not is_enabled:
            return []
        
        provider_type = await ctx.resolve_image_provider_type()
        is_tool_gen = provider_type and provider_type in _TOOL_GEN_PROVIDERS
        return [_build_image_gen_tool_def(provider_type)] if is_tool_gen else []

    async def execute(self, name: str, args: dict, ctx: ToolContext) -> str:
        return await _execute_image_gen_tool(args, ctx.agent, ctx.db)

    def rebuild_defs(self, ctx: ToolContext) -> list[dict] | None:
        return None

    def get_tool_metadata(self) -> list[dict]:
        """Return static metadata for registry display (uses superset)."""
        d = _build_image_gen_tool_def()
        return [
            {
                "name": d["function"]["name"],
                "description": d["function"]["description"],
                "parameters": d["function"]["parameters"],
            }
        ]
