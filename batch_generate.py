"""
Batch image generation tool for processing multiple prompts efficiently.
"""

import asyncio
import json
import logging
from typing import Any

from ..config import MAX_BATCH_SIZE, get_settings
from ..core import (
    validate_batch_size,
    validate_prompts_list,
    validate_reference_images_count,
)
from .generate_image import generate_image_tool

logger = logging.getLogger(__name__)


async def batch_generate_images(
    prompts: list[str],
    aspect_ratio: str = "1:1",
    image_size: str = "2K",
    output_format: str = "png",
    reference_image_paths: list[str] | None = None,
    batch_size: int | None = None,
    enable_google_search: bool = False,
    enable_image_search: bool = False,
    response_modalities: list[str] | None = None,
    thinking_level: str = "minimal",
) -> dict[str, Any]:
    """
    Generate multiple images from a list of prompts.

    Args:
        prompts: List of text prompts
        aspect_ratio: Aspect ratio for all images
        image_size: Image resolution for all images
        output_format: Output format for all images
        reference_image_paths: Shared reference image paths (up to 14)
        batch_size: Number of images to process in parallel (default: from config)
        enable_google_search: Enable Google Web Search grounding
        enable_image_search: Enable Google Image Search (only for Gemini 3.1 Flash)
        response_modalities: Response types (TEXT, IMAGE)
        thinking_level: Thinking level (minimal or high)

    Returns:
        Dict with batch results
    """
    validate_prompts_list(prompts)

    # Validate reference images count if provided
    if reference_image_paths:
        validate_reference_images_count(reference_image_paths)

    settings = get_settings()
    if batch_size is None:
        batch_size = settings.api.max_batch_size

    validate_batch_size(batch_size, MAX_BATCH_SIZE)

    results: dict[str, Any] = {
        "success": True,
        "total_prompts": len(prompts),
        "batch_size": batch_size,
        "image_size": image_size,
        "output_format": output_format,
        "completed": 0,
        "failed": 0,
        "results": [],
    }

    for i in range(0, len(prompts), batch_size):
        batch = prompts[i : i + batch_size]
        logger.info(f"Processing batch {i // batch_size + 1}: {len(batch)} prompts")

        tasks = [
            generate_image_tool(
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                image_size=image_size,
                output_format=output_format,
                reference_image_paths=reference_image_paths,
                enable_google_search=enable_google_search,
                enable_image_search=enable_image_search,
                response_modalities=response_modalities,
                thinking_level=thinking_level,
            )
            for prompt in batch
        ]

        batch_results = await asyncio.gather(*tasks, return_exceptions=True)

        for j, result in enumerate(batch_results):
            prompt_index = i + j

            if isinstance(result, Exception):
                logger.error(f"Failed to generate image for prompt {prompt_index}: {result}")
                results["failed"] += 1
                results["results"].append(
                    {
                        "prompt_index": prompt_index,
                        "prompt": batch[j],
                        "success": False,
                        "error": str(result),
                    }
                )
                continue

            if not isinstance(result, dict):
                logger.error(f"Unexpected result type: {type(result)}")
                results["failed"] += 1
                results["results"].append(
                    {
                        "prompt_index": prompt_index,
                        "prompt": batch[j],
                        "success": False,
                        "error": "Unexpected result type",
                    }
                )
                continue

            results["completed"] += 1
            results["results"].append({"prompt_index": prompt_index, "prompt": batch[j], **result})

    return results


def register_batch_generate_tool(mcp_server: Any) -> None:
    """Register batch_generate tool with MCP server."""

    @mcp_server.tool(timeout=600.0)
    async def batch_generate(
        prompts: list[str],
        aspect_ratio: str = "1:1",
        image_size: str = "2K",
        output_format: str = "png",
        reference_image_paths: list[str] | None = None,
        batch_size: int | None = None,
        enable_google_search: bool = False,
        enable_image_search: bool = False,
        response_modalities: list[str] | None = None,
        thinking_level: str = "minimal",
    ) -> str:
        """
        Generate multiple images from a list of prompts efficiently.

        Processes prompts in parallel batches for optimal performance.
        All images share the same generation settings.

        Args:
            prompts: List of text descriptions for image generation
            aspect_ratio: Aspect ratio for all images (default: 1:1)
            image_size: Image resolution for all images (default: 2K)
            output_format: Image format for all images (default: png)
            reference_image_paths: Shared reference image paths (up to 14)
            batch_size: Parallel batch size (default: from config)
            enable_google_search: Enable Google Web Search grounding
            enable_image_search: Enable Google Image Search
            response_modalities: Response types (TEXT, IMAGE)
            thinking_level: Thinking level - "minimal" or "high"

        Returns:
            JSON string with batch results including individual image paths

        IMPORTANT - AI Assistant Instructions:
        After batch generation completes, you MUST:
        1. Parse the JSON response to extract file paths from result["results"][i]["images"][0]["path"]
        2. Show the user a summary of all generated images with their file paths
        3. Open one or more images in the native OS picture viewer using Bash (DO NOT use Read tool):
           - macOS: `open "/path/to/image.png"`
           - Linux: `xdg-open "/path/to/image.png"`
           - Windows: `start "" "/path/to/image.png"`
        4. Let the user know the total count of successful vs failed generations

        Example response to user:
        "Successfully generated 3 images:
        1. /path/to/image1.png - [description]
        2. /path/to/image2.png - [description]
        3. /path/to/image3.png - [description]"

        DO NOT just say "batch generation completed" without listing the file paths!
        DO NOT use the Read tool to display images - use native OS viewer instead!
        """
        try:
            result = await batch_generate_images(
                prompts=prompts,
                aspect_ratio=aspect_ratio,
                image_size=image_size,
                output_format=output_format,
                reference_image_paths=reference_image_paths,
                batch_size=batch_size,
                enable_google_search=enable_google_search,
                enable_image_search=enable_image_search,
                response_modalities=response_modalities,
                thinking_level=thinking_level,
            )

            return json.dumps(result, indent=2)

        except Exception as e:
            logger.error(f"Batch generation error: {e}")
            return json.dumps(
                {"success": False, "error": str(e), "error_type": type(e).__name__}, indent=2
            )
