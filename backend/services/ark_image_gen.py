"""
火山方舟 Seedream 图片生成服务

通过 /api/v3/images/generations 端点支持：
  - 并行批量生成（多 prompt 独立调用）
  - 组图生成（sequential_image_generation: auto，单次调用多张关联图）
  - 联网搜索（tools: [{type: "web_search"}]，仅 5.0）
  - 流式输出（stream: true，逐张返回 partial_succeeded 事件）

使用 AsyncOpenAI 客户端 + httpx 原始请求（流式场景）。
"""
import asyncio
import base64
import json
import logging
from dataclasses import dataclass, field
from typing import Any, AsyncIterator

import httpx
from openai import AsyncOpenAI

from services.media_utils import save_inline_image, save_image_from_url

logger = logging.getLogger(__name__)

_ARK_DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

# Seedream 支持的尺寸（等级 + 像素值两种形式）
_VALID_SIZE_LEVELS = frozenset({"1K", "2K", "3K", "4K"})

# Seedream 支持的输出格式（5.0 支持 png/jpeg；4.5/4.0 仅 jpeg）
_VALID_OUTPUT_FORMATS = frozenset({"png", "jpeg"})


@dataclass
class ArkBatchImageConfig:
    """火山方舟 Seedream 图片生成配置"""
    size: str = "2K"              # 1K / 2K / 3K / 4K 或像素值如 "2848x1600"
    n: int = 1                    # 生成张数
    response_format: str = "url"  # url / b64_json
    watermark: bool = False
    output_format: str = "png"    # png / jpeg (仅 Seedream 5.0 支持)
    sequential: bool = False      # 是否使用组图模式（单次调用生成多张关联图）
    max_images: int = 4           # 组图最大张数（参考图 + 输出 <= 15）
    web_search: bool = False      # 是否启用联网搜索（仅 Seedream 5.0）


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


# ---------------------------------------------------------------------------
# 组图生成（sequential_image_generation: auto）
# ---------------------------------------------------------------------------
async def generate_ark_sequential_images(
    *,
    api_key: str,
    model: str,
    prompt: str,
    config: ArkBatchImageConfig,
    base_url: str | None = None,
    user_id: str | None = None,
    image_urls: list[str] | None = None,
) -> list[str]:
    """火山方舟 Seedream 组图生成（单次调用生成多张关联图像）。

    使用 sequential_image_generation: "auto" 模式，一次调用返回多张内容关联的图片。
    支持可选参考图输入（图生组图 / 多参考图生组图）。
    适用于漫画分镜、品牌视觉等需要保持一致性的场景。
    """
    client = AsyncOpenAI(
        api_key=api_key,
        base_url=base_url or _ARK_DEFAULT_BASE_URL,
    )

    extra_body: dict[str, Any] = {
        "watermark": config.watermark,
        "sequential_image_generation": "auto",
        "sequential_image_generation_options": {"max_images": config.max_images},
    }
    config.size and extra_body.update(size=config.size)
    (config.output_format in _VALID_OUTPUT_FORMATS) and extra_body.update(output_format=config.output_format)
    config.web_search and extra_body.update(tools=[{"type": "web_search"}])
    # 参考图输入（单张 string，多张 array）
    image_urls and extra_body.update(
        image=image_urls[0] if len(image_urls) == 1 else image_urls
    )

    generate_params: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "response_format": config.response_format,
        "extra_body": extra_body,
    }

    logger.info(
        f"Ark Seedream sequential: model={model}, max_images={config.max_images}, "
        f"size={config.size}, web_search={config.web_search}"
    )

    try:
        response = await client.images.generate(**generate_params)
        urls: list[str] = []
        for item in response.data:
            url = await _save_result_item(item, config.response_format, user_id=user_id)
            url and urls.append(url)
        logger.info(f"Ark Seedream sequential: generated {len(urls)} images")
        return urls
    except Exception as e:
        logger.error(f"Ark Seedream sequential error: {e}")
        return []


# ---------------------------------------------------------------------------
# 流式图像生成（stream: true + SSE 事件流）
# ---------------------------------------------------------------------------
async def stream_generate_ark_images(
    *,
    api_key: str,
    model: str,
    prompt: str,
    config: ArkBatchImageConfig,
    base_url: str | None = None,
    user_id: str | None = None,
) -> AsyncIterator[dict]:
    """火山方舟 Seedream 流式图像生成。

    使用 httpx 直接发起 HTTP 请求（OpenAI SDK 不支持 images stream 参数透传），
    解析 SSE 事件流，逐张 yield 结果。

    事件映射：
      - image_generation.partial_succeeded -> {"type": "final_image", "index": i, "url": ...}
      - image_generation.partial_image     -> {"type": "partial_image", "index": i, ...}
      - image_generation.partial_failed    -> {"type": "error", "message": ...}
      - image_generation.completed         -> {"type": "done"}
    """
    endpoint = (base_url or _ARK_DEFAULT_BASE_URL).rstrip("/") + "/images/generations"

    extra_body: dict[str, Any] = {
        "watermark": config.watermark,
        "stream": True,
    }
    config.size and extra_body.update(size=config.size)
    (config.output_format in _VALID_OUTPUT_FORMATS) and extra_body.update(output_format=config.output_format)
    config.web_search and extra_body.update(tools=[{"type": "web_search"}])
    # 组图模式下同时启用 sequential
    config.sequential and extra_body.update(
        sequential_image_generation="auto",
        sequential_image_generation_options={"max_images": config.max_images},
    )

    payload = {
        "model": model,
        "prompt": prompt,
        "response_format": "url",
        **extra_body,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    logger.info(f"Ark Seedream stream: model={model}, sequential={config.sequential}")

    # 委托给内部 SSE 解析器
    async for evt in _stream_ark_sse(endpoint, payload, headers, config, user_id):
        yield evt

    # 确保发送完结事件
    yield {"type": "done"}


async def _stream_ark_sse(
    url: str,
    payload: dict,
    headers: dict,
    config: ArkBatchImageConfig,
    user_id: str | None,
) -> AsyncIterator[dict]:
    """内部 SSE 解析实现，避免外层 async generator 中的 flow-control 复杂性。"""
    image_index = 0

    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=30.0)) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                logger.error(f"Ark stream HTTP {resp.status_code}: {body[:500]}")
                yield {"type": "error", "message": f"HTTP {resp.status_code}"}
                return

            async for line in resp.aiter_lines():
                stripped = line.strip()
                if not stripped.startswith("data: "):
                    continue
                data_str = stripped[6:]
                if data_str == "[DONE]":
                    return
                try:
                    event = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                event_type = event.get("type", "")

                if event_type == "image_generation.partial_succeeded":
                    url_data = event.get("url")
                    saved = (await save_image_from_url(url_data, user_id=user_id)) if url_data else ""
                    saved and (yield {
                        "type": "final_image",
                        "index": image_index,
                        "url": saved,
                        "size": event.get("size", ""),
                    })
                    image_index += 1

                elif event_type == "image_generation.partial_failed":
                    err = event.get("error") or {}
                    yield {"type": "error", "message": err.get("message", "partial generation failed")}

                elif event_type == "image_generation.completed":
                    return

                elif event_type == "image_generation.partial_image":
                    # 渐进式预览（base64 片段），当前仅记录不处理
                    yield {
                        "type": "partial_image",
                        "index": event.get("partial_image_index", image_index),
                    }


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
        # size 支持等级（"2K"）或像素值（"2848x1600"）两种形式
        config.size and extra_body.update(size=config.size)
        (config.output_format in _VALID_OUTPUT_FORMATS) and extra_body.update(output_format=config.output_format)
        # 联网搜索（仅 Seedream 5.0）
        config.web_search and extra_body.update(tools=[{"type": "web_search"}])
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
    extra_body.update(size=safe_size)
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
