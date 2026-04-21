"""
批量图片生成服务 - 使用并行调用实现多图生成
"""
import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

from google import genai
from google.genai import types

from services.media_utils import save_inline_image

logger = logging.getLogger(__name__)


# 配置映射表（避免 if-else）
IMAGE_SIZE_MAP = {
    "512": "512px",
    "1K": "1K",
    "2K": "2K",
    "4K": "4K",
    "auto": None,
}

ASPECT_AUTO_MAP = {"auto": None}


@dataclass
class BatchImageConfig:
    """批量图片生成配置"""
    aspect_ratio: str = "1:1"
    image_size: str = "2K"
    output_format: str = "png"
    google_search_enabled: bool = False
    google_image_search_enabled: bool = False


@dataclass
class SingleImageResult:
    """单张图片生成结果"""
    prompt_index: int
    prompt: str
    success: bool = False
    image_url: str | None = None
    text_response: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    error: str | None = None


@dataclass
class BatchImageResult:
    """批量图片生成结果"""
    total_prompts: int = 0
    completed: int = 0
    failed: int = 0
    results: list[SingleImageResult] = field(default_factory=list)
    
    @property
    def success(self) -> bool:
        return self.failed == 0


async def _generate_single_image(
    client: genai.Client,
    model: str,
    prompt: str,
    prompt_index: int,
    config: BatchImageConfig,
    config_params: dict[str, Any],
    user_id: str | None = None,
) -> SingleImageResult:
    """生成单张图片（内部函数）"""
    result = SingleImageResult(prompt_index=prompt_index, prompt=prompt)
    
    try:
        contents = [{"role": "user", "parts": [{"text": prompt}]}]
        
        response = await client.aio.models.generate_content(
            model=model,
            contents=contents,
            config=types.GenerateContentConfig(**config_params),
        )
        
        # 解析响应
        for candidate in (getattr(response, 'candidates', None) or []):
            for part in (getattr(getattr(candidate, 'content', None), 'parts', None) or []):
                text = getattr(part, 'text', None)
                text and setattr(result, 'text_response', (result.text_response or "") + text)
                
                inline_data = getattr(part, 'inline_data', None)
                data = getattr(inline_data, 'data', None) if inline_data else None
                if data:
                    result.image_url = await save_inline_image(
                        getattr(inline_data, 'mime_type', 'image/png'), data,
                        user_id=user_id,
                    )
        
        # Token 统计
        usage = getattr(response, 'usage_metadata', None)
        result.input_tokens = getattr(usage, 'prompt_token_count', 0) or 0
        result.output_tokens = getattr(usage, 'candidates_token_count', 0) or 0
        result.success = result.image_url is not None
        
        logger.info(f"Batch image [{prompt_index}]: {'SUCCESS' if result.success else 'NO_IMAGE'} - {result.image_url or 'N/A'}")
        
    except Exception as e:
        result.error = str(e)
        logger.error(f"Batch image [{prompt_index}] error: {e}")
    
    return result


async def batch_generate_images(
    api_key: str,
    model: str,
    prompts: list[str],
    config: BatchImageConfig | None = None,
    max_concurrent: int = 4,
    user_id: str | None = None,
) -> BatchImageResult:
    """
    批量生成图片（并行调用）
    
    Args:
        api_key: Gemini API key
        model: 模型名称 (如 gemini-3.1-flash-image-preview)
        prompts: 提示词列表
        config: 图片生成配置
        max_concurrent: 最大并发数 (1-8)
        
    Returns:
        BatchImageResult: 批量生成结果
    """
    config = config or BatchImageConfig()
    max_concurrent = min(max(max_concurrent, 1), 8)  # 限制 1-8
    
    # 初始化客户端
    client = genai.Client(api_key=api_key)
    
    # 构建 ImageConfig 参数（outputMimeType 当前 API 不支持）
    safe_aspect = ASPECT_AUTO_MAP.get(config.aspect_ratio, config.aspect_ratio)
    safe_size = IMAGE_SIZE_MAP.get(config.image_size)
    
    img_cfg_params = {
        "aspectRatio": safe_aspect,
        "imageSize": safe_size,
    }
    img_cfg_params = {k: v for k, v in img_cfg_params.items() if v is not None}
    
    # 构建请求配置
    config_params: dict[str, Any] = {
        "response_modalities": ["TEXT", "IMAGE"],
        "image_config": types.ImageConfig(**img_cfg_params),
    }
    
    # Google Search 配置（使用简单字典格式）
    config.google_search_enabled and config_params.update(tools=[{"google_search": {}}])
    
    logger.info(f"Batch generate: {len(prompts)} prompts, max_concurrent={max_concurrent}, config={config}")
    
    # 并行生成（使用 semaphore 限制并发数）
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def _bounded_generate(idx: int, prompt: str) -> SingleImageResult:
        async with semaphore:
            return await _generate_single_image(client, model, prompt, idx, config, config_params, user_id=user_id)
    
    tasks = [_bounded_generate(i, p) for i, p in enumerate(prompts)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # 汇总结果
    batch_result = BatchImageResult(total_prompts=len(prompts))
    
    for i, r in enumerate(results):
        # 异常处理
        single_result = (
            r if isinstance(r, SingleImageResult)
            else SingleImageResult(prompt_index=i, prompt=prompts[i], error=str(r))
        )
        
        batch_result.results.append(single_result)
        single_result.success and setattr(batch_result, 'completed', batch_result.completed + 1)
        (not single_result.success) and setattr(batch_result, 'failed', batch_result.failed + 1)
    
    logger.info(f"Batch complete: {batch_result.completed}/{batch_result.total_prompts} success, {batch_result.failed} failed")
    
    return batch_result
