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
    output_tokens: int = 0          # 总输出 tokens（保持兼容）
    text_output_tokens: int = 0     # TEXT 模态输出 tokens
    image_output_tokens: int = 0    # IMAGE 模态输出 tokens
    search_query_count: int = 0     # Google Search 查询次数


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

# Gemini 模态 token 映射表
_MODALITY_FIELDS = {"TEXT": "text_output_tokens", "IMAGE": "image_output_tokens"}

# Gemini 角色映射 (OpenAI -> Gemini)
_GEMINI_ROLE_MAP = {"assistant": "model", "user": "user"}


def _parse_gemini_usage(usage_metadata, result: StreamResult):
    """从 Gemini usage_metadata 解析分模态 token 统计，填充到 result"""
    result.input_tokens = getattr(usage_metadata, 'prompt_token_count', 0) or 0

    details = getattr(usage_metadata, 'candidates_tokens_details', None) or []
    # 按模态累加 token（使用映射表避免 if 分支）
    for item in details:
        modality = str(getattr(item, 'modality', ''))
        field = _MODALITY_FIELDS.get(modality)
        field and setattr(result, field, getattr(result, field) + (getattr(item, 'token_count', 0) or 0))

    # 总输出 = candidates_token_count 或 text + image 之和
    candidates = getattr(usage_metadata, 'candidates_token_count', 0) or 0
    result.output_tokens = candidates or (result.text_output_tokens + result.image_output_tokens)

    # 无 details 时回退：全部视为 text
    details or setattr(result, 'text_output_tokens', result.output_tokens)


def _parse_data_url(data_url: str) -> tuple[str, bytes]:
    """解析 data URL 格式: data:image/png;base64,xxxx → (mime_type, bytes)"""
    import base64
    parts = data_url.split(",", 1)
    return (
        (parts[0].replace("data:", "").split(";")[0], base64.b64decode(parts[1]))
        if len(parts) == 2 else ("image/png", b"")
    )


def _content_part_to_gemini(part: dict):
    """将 OpenAI 格式的内容部分转换为 Gemini Part
    
    输入格式：
    - {"type": "text", "text": "..."} 
    - {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
    """
    from google.genai import types
    
    part_type = part.get("type", "")
    
    # 文本
    text = part.get("text")
    return {"text": text} if part_type == "text" and text else (
        # 图片 (data URL)
        types.Part.from_bytes(data=img_data[1], mime_type=img_data[0])
        if part_type == "image_url" 
           and (img_url := part.get("image_url", {}).get("url", ""))
           and img_url.startswith("data:")
           and (img_data := _parse_data_url(img_url))[1]
        else None
    )


def _format_gemini_messages(messages: list[dict]) -> tuple[list, str]:
    """将 OpenAI 格式消息转换为 Gemini contents + system_instruction
    
    支持多模态消息格式：
    - 纯文本: {"role": "user", "content": "hello"}
    - 多模态: {"role": "user", "content": [{"type": "text", "text": "..."}, {"type": "image_url", ...}]}
    """
    system_parts, contents = [], []
    
    for m in messages:
        role, content = m["role"], m["content"]
        
        # system 消息
        (role == "system") and system_parts.append(content if isinstance(content, str) else str(content))
        
        # user/assistant 消息：构建 parts
        parts = (
            [{"text": content}] if isinstance(content, str) else
            [p for item in content if (p := _content_part_to_gemini(item) if isinstance(item, dict) else {"text": str(item)})]
        ) if role != "system" else []
        
        # 添加非空消息
        parts and contents.append({"role": _GEMINI_ROLE_MAP.get(role, "user"), "parts": parts})
    
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

    # 图片模式：动态构建 ImageConfig（SDK 使用 camelCase 参数名）
    # image_size 映射表：前端数值 → API 标准值（512px/1K/2K/4K）
    _IMAGE_SIZE_MAP = {
        "512": "512px",    # 前端发送 "512"，后端转为 "512px"
        "1K": "1K",
        "2K": "2K",
        "4K": "4K",
        "auto": None,
    }
    _ASPECT_AUTO_MAP = {"auto": None}
    
    raw_size = img_cfg.get("image_size")
    raw_aspect = img_cfg.get("aspect_ratio")
    
    safe_size = _IMAGE_SIZE_MAP.get(raw_size)
    safe_aspect = _ASPECT_AUTO_MAP.get(raw_aspect, raw_aspect)
    
    # 动态构建 ImageConfig 参数（SDK 使用 camelCase，过滤 None 值避免验证错误）
    # 注意：outputMimeType / batch_count 当前 API 不支持，UI 可配置但后端暂不传递
    _img_cfg_params = {
        "aspectRatio": safe_aspect,
        "imageSize": safe_size,
    }
    # 过滤掉 None 值
    _img_cfg_params = {k: v for k, v in _img_cfg_params.items() if v is not None}
    
    img_enabled and config_params.update(
        image_config=types.ImageConfig(**_img_cfg_params)
    )

    # 思考模式：仅在图片生成关闭时生效（两者互斥，同时启用会导致死循环）
    (not img_enabled) and sdk_level and config_params.update(
        thinking_config=types.ThinkingConfig(thinking_level=sdk_level, include_thoughts=True)
    )
    # 互斥警告日志
    img_enabled and sdk_level and logger.warning(
        f"Gemini 限制：图片生成与思考模式互斥，已自动关闭思考模式 (thinking_level={thinking_level})"
    )

    # Google Search 工具配置（使用简单字典格式，参考官方文档）
    search_enabled = gemini_cfg.get("google_search_enabled", False)
    
    search_enabled and config_params.update(tools=[{"google_search": {}}])

    # 详细日志：记录发送给 Gemini API 的完整配置
    _ic = config_params.get('image_config')
    _ic_str = (
        f"aspect_ratio={getattr(_ic, 'aspect_ratio', None)}, "
        f"image_size={getattr(_ic, 'image_size', None)}"
        if _ic else "NOT SET"
    )
    logger.info(
        f"Gemini API → model={ctx.model}, "
        f"response_modalities={config_params.get('response_modalities')}, "
        f"thinking={'ON(' + str(thinking_level) + ')' if 'thinking_config' in config_params else 'OFF'}, "
        f"image={'ON' if img_enabled else 'OFF'}, "
        f"search={'ON' if search_enabled else 'OFF'}, "
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
        usage and _parse_gemini_usage(usage, result)

        # 统计搜索查询次数（保守策略：检测到 grounding_metadata 即计 1 次）
        for candidate in (getattr(response, 'candidates', None) or []):
            grounding = getattr(candidate, 'grounding_metadata', None)
            chunks = getattr(grounding, 'grounding_chunks', None) or []
            result.search_query_count += min(len(chunks), 1)

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
        usage and _parse_gemini_usage(usage, result)

        # 搜索查询统计（流式模式下累计）
        for candidate in (getattr(chunk, 'candidates', None) or []):
            grounding = getattr(candidate, 'grounding_metadata', None)
            chunks = getattr(grounding, 'grounding_chunks', None) or []
            chunks and setattr(result, 'search_query_count', max(result.search_query_count, 1))

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
