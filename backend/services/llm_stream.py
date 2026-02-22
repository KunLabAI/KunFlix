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
@register_provider("gemini")
async def stream_gemini(ctx: StreamContext, result: StreamResult) -> AsyncGenerator[str, None]:
    """Gemini 流式调用 (TODO: 实现)"""
    error_msg = "Gemini streaming not implemented yet."
    result.full_response = error_msg
    yield error_msg


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
        error_msg = f"Error generating response: {str(e)}"
        result.full_response += error_msg
        logger.error(f"LLM stream error: {error_msg}")
        yield error_msg, result
