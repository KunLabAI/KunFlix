"""
generate_image tool — 让文本模型（grok-3, gemini 等）按需调用图像生成。

支持跨供应商：文本模型和图像模型可来自不同 Provider。
遵循 base_tools.py / canvas_tools.py 的模式：定义 + 执行 + 派发。
"""
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
from services.image_config_adapter import to_provider_config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
IMAGE_GEN_TOOL_NAME = "generate_image"

# 纯图像模型集合（这些模型不支持 tool calling，不应作为主文本模型）
_IMAGE_ONLY_MODELS = frozenset({"grok-imagine-image", "grok-imagine-image-pro"})

# 统一宽高比选项（所有供应商的超集）
_ASPECT_RATIO_ENUM = [
    "auto", "1:1", "16:9", "9:16", "4:3", "3:4",
    "3:2", "2:3", "2:1", "1:2",
]

# ---------------------------------------------------------------------------
# Tool Definition
# ---------------------------------------------------------------------------

def build_image_gen_tool_def() -> dict:
    """Return OpenAI-format tool definition for generate_image."""
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
                        "enum": _ASPECT_RATIO_ENUM,
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


def build_image_gen_tool_def_list(agent: Agent) -> list[dict]:
    """Return [tool_def] if agent is eligible for generate_image, else [].

    Eligibility:
    - image_config.image_generation_enabled is True
    - image_config.image_provider_id and image_config.image_model are set
    - Agent's main model is NOT an image-only model
    """
    cfg = agent.image_config or {}
    _checks = (
        cfg.get("image_generation_enabled"),
        cfg.get("image_provider_id"),
        cfg.get("image_model"),
        agent.model not in _IMAGE_ONLY_MODELS,
    )
    return [build_image_gen_tool_def()] if all(_checks) else []


# ---------------------------------------------------------------------------
# Provider-dispatched image generation
# ---------------------------------------------------------------------------

async def _generate_via_xai(
    api_key: str, base_url: str | None, model: str,
    prompt: str, config: dict, n: int,
) -> list[str]:
    """Generate images via xAI provider."""
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
    # Flatten all image URLs from all prompt results
    return [url for r in result.results for url in r.image_urls]


# 供应商 → 生成器映射表
_IMAGE_GENERATORS: dict[str, Any] = {
    "xai": _generate_via_xai,
}


# ---------------------------------------------------------------------------
# Tool Execution
# ---------------------------------------------------------------------------

async def execute_image_gen_tool(
    args: dict, agent: Agent, db: AsyncSession,
) -> str:
    """Execute the generate_image tool.

    Looks up image provider from DB, dispatches to the correct generator,
    returns markdown image references.
    """
    prompt = args.get("prompt", "")
    aspect_ratio = args.get("aspect_ratio")
    n = min(max(args.get("n", 1), 1), 4)

    cfg = agent.image_config or {}
    provider_id = cfg.get("image_provider_id")
    model = cfg.get("image_model", "")

    # DB lookup for image provider
    result = await db.execute(
        select(LLMProvider).where(LLMProvider.id == provider_id, LLMProvider.is_active == True)
    )
    provider = result.scalar_one_or_none()

    if not provider:
        return json.dumps({"error": f"Image provider {provider_id} not found or inactive"})

    # Resolve image config via adapter (unified → provider-specific)
    adapted = to_provider_config(provider.provider_type.lower(), cfg)

    # Override aspect_ratio if tool args specified
    _img_cfg = (adapted.get("image_config") or {}).copy() if adapted else {}
    aspect_ratio and _img_cfg.update(aspect_ratio=aspect_ratio)
    adapted_with_override = {**adapted, "image_config": _img_cfg} if adapted else {"image_config": _img_cfg}

    # Dispatch to provider-specific generator
    generator = _IMAGE_GENERATORS.get(provider.provider_type.lower())
    if not generator:
        return json.dumps({"error": f"Unsupported image provider type: {provider.provider_type}"})

    try:
        image_urls = await generator(
            api_key=provider.api_key,
            base_url=provider.base_url,
            model=model,
            prompt=prompt,
            config=adapted_with_override,
            n=n,
        )
    except Exception as e:
        logger.error("generate_image tool error: %s", e)
        return json.dumps({"error": f"Image generation failed: {str(e)}"})

    if not image_urls:
        return "No images were generated. The request may have been filtered by content moderation."

    # Format as markdown image references
    images_md = "\n\n".join(f"![image]({url})" for url in image_urls)
    return f"Generated {len(image_urls)} image(s):\n\n{images_md}"
