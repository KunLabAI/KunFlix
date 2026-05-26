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

# Seedream 支持的尺寸（5.0 新增 3K）
_VALID_SIZES = frozenset({"512px", "1K", "2K", "3K", "4K"})

# Seedream 支持的输出格式（5.0 支持 png/jpeg；4.5/4.0 仅 jpeg）
_VALID_OUTPUT_FORMATS = frozenset({"png", "jpeg"})


@dataclass
class ArkBatchImageConfig:
    """火山方舟 Seedream 批量图片生成配置"""
    size: str = "1K"              # 512px / 1K / 2K / 3K / 4K
    n: int = 1                    # 每个 prompt 生成张数 (1-4)
    response_format: str = "url"  # url / b64_json
    watermark: bool = False
    output_format: str = "png"    # png / jpeg (仅 Seedream 5.0 支持)


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
        (config.output_format in _VALID_OUTPUT_FORMATS) and extra_body.update(output_format=config.output_format)
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


# ---------------------------------------------------------------------------
# 编辑 / 参考图模式（Seedream 4.0-5.0 支持 image 字段传递参考图）
# ---------------------------------------------------------------------------
async def edit_ark_image(
    *,
    api_key: str,
    base_url: str | None,
    model: str,
    image_urls: list[str],
    prompt: str,
    aspect_ratio: str | None = None,
    size: str | None = None,
    user_id: str | None = None,
    **_kw,
) -> str:
    """火山方舟 Seedream 图像编辑/参考图生成。

    通过 /api/v3/images/generations 端点 + extra_body.image 字段传递参考图。
    单张传 string，多张传 array（与官方文档一致）。

    Args:
        api_key: 火山方舟 API Key
        base_url: API base URL
        model: 模型名称
        image_urls: 参考图 URL 列表（公开可访问的 URL 或 base64 data URI）
        prompt: 编辑/生成指令
        aspect_ratio: 宽高比（Seedream 不直接使用，保留签名兼容）
        size: 输出尺寸 (1K/2K/3K/4K)
        user_id: 用户 ID（用于媒体存储路径）

    Returns:
        生成图片的本地 URL（/api/media/...），失败返回空字符串
    """
    client = AsyncOpenAI(
        api_key=api_key,
        base_url=base_url or _ARK_DEFAULT_BASE_URL,
    )

    # 构建 extra_body：image 字段（单张 string，多张 array）
    extra_body: dict[str, Any] = {"watermark": False}
    image_value = image_urls[0] if len(image_urls) == 1 else image_urls
    extra_body["image"] = image_value
    safe_size = size or "2K"
    (safe_size in _VALID_SIZES) and extra_body.update(size=safe_size)
    extra_body["sequential_image_generation"] = "disabled"

    generate_params: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "response_format": "url",
        "extra_body": extra_body,
    }

    try:
        response = await client.images.generate(**generate_params)
        for item in response.data:
            url = await _save_result_item(item, "url", user_id=user_id)
            url and (logger.info("Ark Seedream edit: SUCCESS → %s", url))
            return url if url else ""
    except Exception as e:
        logger.error("Ark Seedream edit error: %s", e)

    return ""
