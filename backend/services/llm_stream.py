"""
LLM 流式调用模块 - 使用注册表模式减少 if 分支
"""
from typing import AsyncGenerator, Dict, Any, List, Callable
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class StreamContext:
    """流式调用上下文"""
    provider_type: str
    api_key: str
    base_url: str | None
    model: str
    messages: List[Dict[str, str]]
    temperature: float
    context_window: int
    thinking_mode: bool
    gemini_config: Dict[str, Any] | None = None  # Gemini 3.1 配置


@dataclass
class StreamResult:
    """流式调用结果"""
    full_response: str = ""
    reasoning_content: str = ""
    input_tokens: int = 0
    output_tokens: int = 0


# 供应商默认 base_url 配置
DEFAULT_BASE_URLS = {
    "deepseek": "https://api.deepseek.com/v1",
    "minimax": "https://api.minimax.chat/v1",
}

# 供应商注册表：provider_type -> stream handler
_PROVIDER_REGISTRY: Dict[str, Callable] = {}


def register_provider(*provider_types: str):
    """装饰器：注册供应商处理器"""
    def decorator(handler: Callable):
        for pt in provider_types:
            _PROVIDER_REGISTRY[pt] = handler
        return handler
    return decorator


def get_effective_base_url(ctx: StreamContext) -> str | None:
    """获取有效的 base_url"""
    return ctx.base_url or DEFAULT_BASE_URLS.get(ctx.provider_type)


# ============================================================
# OpenAI 兼容供应商 (openai, azure, deepseek)
# ============================================================
@register_provider("openai", "deepseek")
async def stream_openai(ctx: StreamContext, result: StreamResult) -> AsyncGenerator[str, None]:
    """OpenAI/DeepSeek 流式调用"""
    from openai import AsyncOpenAI
    
    client = AsyncOpenAI(
        api_key=ctx.api_key,
        base_url=get_effective_base_url(ctx),
    )
    
    stream = await client.chat.completions.create(
        model=ctx.model,
        messages=ctx.messages,
        temperature=ctx.temperature,
        stream=True,
        stream_options={"include_usage": True},
    )
    
    thinking_started = False
    async for chunk in stream:
        # 处理 reasoning_content (thinking mode)
        if ctx.thinking_mode and chunk.choices and hasattr(chunk.choices[0].delta, 'reasoning_content'):
            rc = chunk.choices[0].delta.reasoning_content
            if rc:
                if not thinking_started:
                    yield "<think>"
                    thinking_started = True
                result.reasoning_content += rc
                yield rc
        
        if chunk.choices and chunk.choices[0].delta.content:
            if thinking_started:
                yield "</think>"
                thinking_started = False
            content = chunk.choices[0].delta.content
            result.full_response += content
            yield content

        if hasattr(chunk, 'usage') and chunk.usage:
            result.input_tokens = chunk.usage.prompt_tokens
            result.output_tokens = chunk.usage.completion_tokens
    
    if thinking_started:
        yield "</think>"


@register_provider("azure")
async def stream_azure(ctx: StreamContext, result: StreamResult) -> AsyncGenerator[str, None]:
    """Azure OpenAI 流式调用"""
    from openai import AsyncAzureOpenAI
    
    client = AsyncAzureOpenAI(
        api_key=ctx.api_key,
        api_version="2023-05-15",
        azure_endpoint=ctx.base_url,
    )
    
    stream = await client.chat.completions.create(
        model=ctx.model,
        messages=ctx.messages,
        temperature=ctx.temperature,
        stream=True,
        stream_options={"include_usage": True},
    )
    
    async for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            content = chunk.choices[0].delta.content
            result.full_response += content
            yield content

        if hasattr(chunk, 'usage') and chunk.usage:
            result.input_tokens = chunk.usage.prompt_tokens
            result.output_tokens = chunk.usage.completion_tokens


# ============================================================
# Anthropic 兼容供应商 (anthropic, minimax)
# ============================================================
@register_provider("anthropic", "minimax")
async def stream_anthropic(ctx: StreamContext, result: StreamResult) -> AsyncGenerator[str, None]:
    """Anthropic/MiniMax 流式调用"""
    from anthropic import AsyncAnthropic
    
    client = AsyncAnthropic(
        api_key=ctx.api_key,
        base_url=get_effective_base_url(ctx),
    )
    
    # 提取 system message
    system_content = ""
    chat_messages = []
    for msg in ctx.messages:
        if msg["role"] == "system":
            system_content = msg["content"]
        else:
            chat_messages.append(msg)
    
    # 构建请求参数
    request_params = {
        "model": ctx.model,
        "messages": chat_messages,
        "system": system_content,
        "max_tokens": ctx.context_window,
        "temperature": 1 if ctx.thinking_mode else ctx.temperature,
    }
    
    # 启用 extended thinking
    if ctx.thinking_mode:
        request_params["thinking"] = {
            "type": "enabled",
            "budget_tokens": min(10000, ctx.context_window // 4)
        }
    
    async with client.messages.stream(**request_params) as stream:
        async for text in stream.text_stream:
            result.full_response += text
            yield text
        
        final_message = await stream.get_final_message()
        if final_message.usage:
            result.input_tokens = final_message.usage.input_tokens
            result.output_tokens = final_message.usage.output_tokens


# ============================================================
# DashScope 供应商
# ============================================================
@register_provider("dashscope")
async def stream_dashscope(ctx: StreamContext, result: StreamResult) -> AsyncGenerator[str, None]:
    """DashScope 流式调用"""
    import dashscope
    from http import HTTPStatus
    
    responses = dashscope.Generation.call(
        model=ctx.model,
        api_key=ctx.api_key,
        messages=ctx.messages,
        result_format='message',
        stream=True,
        incremental_output=True,
    )
    
    for response in responses:
        if response.status_code == HTTPStatus.OK:
            content = response.output.choices[0]['message']['content']
            result.full_response += content
            yield content

            if hasattr(response, 'usage') and response.usage:
                result.input_tokens = response.usage.get('input_tokens', 0)
                result.output_tokens = response.usage.get('output_tokens', 0)
        else:
            error_msg = f"Error: {response.message}"
            result.full_response += error_msg
            yield error_msg


# ============================================================
# Gemini 供应商
# ============================================================

# Gemini 3.1 配置映射表 (避免 if-else 条件)
GEMINI_THINKING_LEVELS = {"high": "HIGH", "medium": "MEDIUM", "low": "LOW", "minimal": "MINIMAL"}
GEMINI_MEDIA_RESOLUTIONS = {
    "ultra_high": "media_resolution_ultra_high",
    "high": "media_resolution_high",
    "medium": "media_resolution_medium",
    "low": "media_resolution_low",
}

# Gemini 角色映射 (OpenAI -> Gemini)
_GEMINI_ROLE_MAP = {"assistant": "model", "user": "user"}


def _format_gemini_messages(messages: list[dict]) -> tuple[list[dict], str]:
    """将 OpenAI 格式消息转换为 Gemini contents + system_instruction"""
    system_parts = []
    contents = []
    for m in messages:
        role = m["role"]
        system_parts.append(m["content"]) if role == "system" else contents.append({
            "role": _GEMINI_ROLE_MAP.get(role, "user"),
            "parts": [{"text": m["content"]}],
        })
    return contents, "\n".join(system_parts)


@register_provider("gemini")
async def stream_gemini(ctx: StreamContext, result: StreamResult) -> AsyncGenerator[str, None]:
    """Gemini 流式调用（支持文本 + 图片 + Gemini 3.1 配置）"""
    from google import genai
    from google.genai import types
    from services.media_utils import save_inline_image

    # 解析 Gemini 配置
    gemini_cfg = ctx.gemini_config or {}
    media_res = gemini_cfg.get("media_resolution")
    
    # API 版本控制：media_resolution 需要 v1alpha
    http_options = {'api_version': 'v1alpha'} if media_res else None
    client = genai.Client(api_key=ctx.api_key, http_options=http_options)
    
    contents, system_instruction = _format_gemini_messages(ctx.messages)

    # 构建配置参数（使用映射表避免 if-else）
    config_params = {"temperature": ctx.temperature}
    system_instruction and config_params.update(system_instruction=system_instruction)
    
    # Gemini 图片生成与思考模式互斥（Gemini API 限制：两者不能同时启用）
    img_enabled = gemini_cfg.get("image_generation_enabled")
    img_cfg = gemini_cfg.get("image_config") or {}
    thinking_level = gemini_cfg.get("thinking_level")
    sdk_level = GEMINI_THINKING_LEVELS.get(thinking_level)

    # response_modalities：图片模式 → ["TEXT","IMAGE"]，文本模式 → ["TEXT"]
    config_params["response_modalities"] = ["TEXT", "IMAGE"] if img_enabled else ["TEXT"]

    # 图片模式：始终传递 ImageConfig（SDK 会忽略 None 值，使用默认 1:1 / 1K）
    # image_size 有效值：1K, 2K, 4K（前端 "auto" 映射为 None 让 SDK 使用默认值）
    _VALID_IMAGE_SIZES = {"1K", "2K", "4K"}
    raw_size = img_cfg.get("image_size")
    img_enabled and config_params.update(
        image_config=types.ImageConfig(
            aspect_ratio=img_cfg.get("aspect_ratio"),
            image_size=raw_size if raw_size in _VALID_IMAGE_SIZES else None
        )
    )

    # 思考模式：仅在图片生成关闭时生效（两者互斥，同时启用会导致死循环）
    (not img_enabled) and sdk_level and config_params.update(
        thinking_config=types.ThinkingConfig(thinking_level=sdk_level, include_thoughts=True)
    )
    # 互斥警告日志
    img_enabled and sdk_level and logger.warning(
        f"Gemini 限制：图片生成与思考模式互斥，已自动关闭思考模式 (thinking_level={thinking_level})"
    )

    # 详细日志：记录发送给 Gemini API 的完整配置
    _ic = config_params.get('image_config')
    _ic_str = (
        f"aspect_ratio={getattr(_ic, 'aspect_ratio', None)}, image_size={getattr(_ic, 'image_size', None)}"
        if _ic else "NOT SET"
    )
    logger.info(
        f"Gemini API → model={ctx.model}, "
        f"response_modalities={config_params.get('response_modalities')}, "
        f"thinking={'ON(' + str(thinking_level) + ')' if 'thinking_config' in config_params else 'OFF'}, "
        f"image={'ON' if img_enabled else 'OFF'}, "
        f"image_config={{{_ic_str}}}, "
        f"api_version={http_options.get('api_version', 'default') if http_options else 'default'}"
    )

    # ---- 响应处理 ----
    # 图片模式：非流式调用（避免 aiohttp "Chunk too big"，图片二进制数据通常数 MB）
    # 文本模式：流式调用（支持思考过程实时输出）

    if img_enabled:
        # 非流式：一次性获取完整响应（含图片数据）
        response = await client.aio.models.generate_content(
            model=ctx.model,
            contents=contents,
            config=types.GenerateContentConfig(**config_params),
        )

        for candidate in (getattr(response, 'candidates', None) or []):
            for part in (getattr(getattr(candidate, 'content', None), 'parts', None) or []):
                text = getattr(part, 'text', None)
                if text:
                    result.full_response += text
                    yield text

                inline_data = getattr(part, 'inline_data', None)
                if inline_data:
                    data = getattr(inline_data, 'data', None)
                    if data:
                        mime_type = getattr(inline_data, 'mime_type', 'image/png')
                        url = save_inline_image(mime_type, data)
                        logger.info(f"Gemini image saved: {url} ({len(data)} bytes)")
                        md = f"\n\n![image]({url})\n\n"
                        result.full_response += md
                        yield md

        usage = getattr(response, 'usage_metadata', None)
        if usage:
            result.input_tokens = getattr(usage, 'prompt_token_count', 0) or 0
            result.output_tokens = (
                (getattr(usage, 'total_token_count', 0) or 0)
                - (getattr(usage, 'prompt_token_count', 0) or 0)
            )
        return

    # 流式：文本模式（支持思考过程实时输出，不处理图片 inline_data）
    response = await client.aio.models.generate_content_stream(
        model=ctx.model,
        contents=contents,
        config=types.GenerateContentConfig(**config_params),
    )

    # 思考状态转换映射表：(当前状态, 新状态) -> 前缀
    THINK_TRANSITIONS = {
        (False, True): "<think>\n",   # 进入思考
        (True, False): "</think>\n",  # 退出思考
    }
    in_thinking = False

    async for chunk in response:
        # 遍历 candidates -> content -> parts 提取文本
        for candidate in (getattr(chunk, 'candidates', None) or []):
            for part in (getattr(getattr(candidate, 'content', None), 'parts', None) or []):
                text = getattr(part, 'text', None)
                if text:
                    is_thought = getattr(part, 'thought', False)
                    prefix = THINK_TRANSITIONS.get((in_thinking, is_thought), "")

                    output = prefix + text
                    result.full_response += output
                    yield output

                    in_thinking = is_thought

        # Token 统计
        usage = getattr(chunk, 'usage_metadata', None)
        if usage:
            result.input_tokens = getattr(usage, 'prompt_token_count', 0) or 0
            result.output_tokens = (
                (getattr(usage, 'total_token_count', 0) or 0)
                - (getattr(usage, 'prompt_token_count', 0) or 0)
            )

    # 流结束后，确保关闭思考标签
    if in_thinking:
        result.full_response += "</think>\n"
        yield "</think>\n"


# ============================================================
# 统一入口
# ============================================================
async def stream_completion(
    provider_type: str,
    api_key: str,
    base_url: str | None,
    model: str,
    messages: List[Dict[str, str]],
    temperature: float,
    context_window: int,
    thinking_mode: bool = False,
    gemini_config: Dict[str, Any] | None = None,
) -> AsyncGenerator[tuple[str, StreamResult], None]:
    """
    统一的流式调用入口
    
    Yields:
        tuple[str, StreamResult]: (chunk, result) - 每次 yield chunk 文本，最后一次包含完整 result
    """
    ctx = StreamContext(
        provider_type=provider_type.lower(),
        api_key=api_key,
        base_url=base_url,
        model=model,
        messages=messages,
        temperature=temperature,
        context_window=context_window,
        thinking_mode=thinking_mode,
        gemini_config=gemini_config,
    )
    result = StreamResult()
    
    # 查找注册的处理器
    handler = _PROVIDER_REGISTRY.get(ctx.provider_type)
    
    if not handler:
        # 默认回退到 OpenAI 兼容
        handler = _PROVIDER_REGISTRY.get("openai")
        logger.warning(f"Unknown provider '{ctx.provider_type}', falling back to OpenAI compatible")
    
    try:
        async for chunk in handler(ctx, result):
            yield chunk, result
    except Exception as e:
        error_str = str(e)
        logger.error(f"LLM stream error: {error_str}")
        
        # 如果已有响应内容，静默处理（可能是流正常结束时的传输错误）
        # 仅在没有内容时向用户显示错误
        has_content = result.full_response.strip()
        has_content or setattr(result, 'full_response', f"Error: {error_str}") or (yield result.full_response, result)
