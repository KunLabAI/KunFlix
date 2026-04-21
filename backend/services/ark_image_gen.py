"""
火山方舟 Seedream 批量图片生成服务 - 使用并行调用实现多图生成

通过 /api/v3/images/generations 端点批量生成图片。
使用 AsyncOpenAI 客户端（火山方舟 images API 兼容 OpenAI 协议）。
"""
import asyncio
import base64
import logging
from dataclasses import dataclass, field
from typing import Any

from openai import AsyncOpenAI

from services.media_utils import save_inline_image, save_image_from_url

logger = logging.getLogger(__name__)

_ARK_DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

# Seedream 支持的尺寸
_VALID_SIZES = frozenset({"512px", "1K", "2K", "4K"})


@dataclass
class ArkBatchImageConfig:
    """火山方舟 Seedream 批量图片生成配置"""
    size: str = "1K"              # 512px / 1K / 2K / 4K
    n: int = 1                    # 每个 prompt 生成张数 (1-4)
    response_format: str = "url"  # url / b64_json
    watermark: bool = False


@dataclass
class ArkSingleImageResult:
    """单个 prompt 的生成结果"""
    prompt_index: int
    prompt: str
    success: bool = False
    image_urls: list[str] = field(default_factory=list)
    image_count: int = 0
    error: str | None = None


@dataclass
class ArkBatchImageResult:
    """批量生成汇总结果"""
    total_prompts: int = 0
    completed: int = 0
    failed: int = 0
    total_images: int = 0
    results: list[ArkSingleImageResult] = field(default_factory=list)

    @property
    def success(self) -> bool:
        return self.failed == 0


async def _save_result_item(item, response_format: str, user_id: str | None = None) -> str:
    """保存单张图片结果，返回本地 URL"""
    b64_data = getattr(item, "b64_json", None)
    url_data = getattr(item, "url", None)

    # b64_json 模式
    if b64_data:
        return await save_inline_image("image/png", base64.b64decode(b64_data), user_id=user_id)

    # url 模式
    if url_data:
        return await save_image_from_url(url_data, user_id=user_id)

    return ""


async def _generate_single_prompt(
    client: AsyncOpenAI,
    model: str,
    prompt: str,
    prompt_index: int,
    config: ArkBatchImageConfig,
    user_id: str | None = None,
) -> ArkSingleImageResult:
    """对单个 prompt 调用火山方舟 Seedream 图像生成 API"""
    result = ArkSingleImageResult(prompt_index=prompt_index, prompt=prompt)

    try:
        generate_params: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "n": config.n,
            "response_format": config.response_format,
        }

        # Seedream 扩展参数通过 extra_body 传递
        extra_body: dict[str, Any] = {"watermark": config.watermark}
        (config.size in _VALID_SIZES) and extra_body.update(size=config.size)
        generate_params["extra_body"] = extra_body

        response = await client.images.generate(**generate_params)

        for item in response.data:
            url = await _save_result_item(item, config.response_format, user_id=user_id)
            url and result.image_urls.append(url)

        result.image_count = len(result.image_urls)
        result.success = result.image_count > 0

        logger.info(
            f"Ark Seedream [{prompt_index}]: "
            f"{'SUCCESS' if result.success else 'NO_IMAGE'} - {result.image_count} images"
        )

    except Exception as e:
        result.error = str(e)
        logger.error(f"Ark Seedream [{prompt_index}] error: {e}")

    return result


async def batch_generate_ark_images(
    api_key: str,
    model: str,
    prompts: list[str],
    config: ArkBatchImageConfig | None = None,
    base_url: str | None = None,
    max_concurrent: int = 4,
    user_id: str | None = None,
) -> ArkBatchImageResult:
    """
    批量生成火山方舟 Seedream 图片（并行调用）

    Args:
        api_key: 火山方舟 API Key
        model: 模型名称 (doubao-seedream-5-0-260128 等)
        prompts: 提示词列表
        config: 图片生成配置
        base_url: API base URL (默认 https://ark.cn-beijing.volces.com/api/v3)
        max_concurrent: 最大并发数 (1-8)

    Returns:
        ArkBatchImageResult: 批量生成结果
    """
    config = config or ArkBatchImageConfig()
    max_concurrent = min(max(max_concurrent, 1), 8)

    client = AsyncOpenAI(
        api_key=api_key,
        base_url=base_url or _ARK_DEFAULT_BASE_URL,
    )

    logger.info(
        f"Ark Seedream batch: {len(prompts)} prompts, max_concurrent={max_concurrent}, "
        f"model={model}, n={config.n}, size={config.size}, "
        f"format={config.response_format}, watermark={config.watermark}"
    )

    # 并行生成（使用 semaphore 限制并发数）
    semaphore = asyncio.Semaphore(max_concurrent)

    async def _bounded_generate(idx: int, prompt: str) -> ArkSingleImageResult:
        async with semaphore:
            return await _generate_single_prompt(client, model, prompt, idx, config, user_id=user_id)

    tasks = [_bounded_generate(i, p) for i, p in enumerate(prompts)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # 汇总结果
    batch_result = ArkBatchImageResult(total_prompts=len(prompts))

    for i, r in enumerate(results):
        single_result = (
            r if isinstance(r, ArkSingleImageResult)
            else ArkSingleImageResult(prompt_index=i, prompt=prompts[i], error=str(r))
        )

        batch_result.results.append(single_result)
        single_result.success and setattr(batch_result, 'completed', batch_result.completed + 1)
        (not single_result.success) and setattr(batch_result, 'failed', batch_result.failed + 1)
        batch_result.total_images += single_result.image_count

    logger.info(
        f"Ark Seedream batch complete: {batch_result.completed}/{batch_result.total_prompts} success, "
        f"{batch_result.failed} failed, {batch_result.total_images} total images"
    )

    return batch_result
