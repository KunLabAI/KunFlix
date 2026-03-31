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

from models import LLMProvider, Agent
from services.xai_image_gen import (
    batch_generate_xai_images,
    XAIBatchImageConfig,
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
_TOOL_GEN_PROVIDERS = frozenset({"xai", "gemini"})

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
                "Generate images from a text prompt using an AI image generation model. "
                "Use this tool when the user asks you to create, draw, generate, or design "
                "an image, illustration, portrait, scene, or any visual content. "
                "The tool returns image URLs in markdown format that you should include "
                "in your response."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": (
                            "Detailed description of the image to generate. "
                            "Be specific about subject, style, composition, lighting, and mood. "
                            "Write the prompt in English for best results."
                        ),
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
    """Check basic eligibility: image_config enabled, provider set, model set, not image-only."""
    cfg = agent.image_config or {}
    _checks = (
        cfg.get("image_generation_enabled"),
        cfg.get("image_provider_id"),
        cfg.get("image_model"),
        agent.model not in _IMAGE_ONLY_MODELS,
    )
    return all(_checks)


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


# Handler dispatch map (no if-chains)
_IMAGE_GENERATORS: dict[str, Any] = {
    "xai": _generate_via_xai,
    "gemini": _generate_via_gemini,
}


# ---------------------------------------------------------------------------
# Tool Execution
# ---------------------------------------------------------------------------

async def _execute_image_gen_tool(args: dict, agent: Agent, db: AsyncSession) -> str:
    prompt = args.get("prompt", "")
    aspect_ratio = args.get("aspect_ratio")
    n = min(max(args.get("n", 1), 1), 4)

    cfg = agent.image_config or {}
    provider_id = cfg.get("image_provider_id")
    model = cfg.get("image_model", "")

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
    condition = "需要启用 image_config 且供应商支持 tool-based 生成"

    @property
    def tool_names(self) -> frozenset[str]:
        return frozenset({IMAGE_GEN_TOOL_NAME})

    async def build_defs(self, ctx: ToolContext) -> list[dict]:
        eligible = _check_agent_eligible(ctx.agent)
        provider_type = await ctx.resolve_image_provider_type() if eligible else None
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
