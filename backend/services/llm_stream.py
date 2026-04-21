"""
LLM 流式调用模块 - 使用注册表模式减少 if 分支
"""
from typing import AsyncGenerator, Dict, Any, List, Callable
from dataclasses import dataclass
import json
import logging

logger = logging.getLogger(__name__)


@dataclass
class StreamContext:
    """流式调用上下文"""
    provider_type: str
    api_key: str
    base_url: str | None
    model: str
    messages: List[Dict[str, Any]]
    temperature: float
    context_window: int
    thinking_mode: bool
    gemini_config: Dict[str, Any] | None = None  # Gemini 3.1 配置
    xai_image_config: Dict[str, Any] | None = None  # xAI 图像生成配置
    tools: List[Dict[str, Any]] | None = None     # OpenAI-format tool definitions
    user_id: str | None = None                     # 用户 ID（媒体文件目录隔离）


@dataclass
class ToolCallResult:
    """Collected tool call from LLM response"""
    id: str          # tool_call id (for OpenAI) or block id (for Anthropic)
    name: str        # function/tool name
    arguments: str   # JSON string of arguments
    thought_signature: Any = None  # Gemini: preserved for multi-turn function calling


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
    generated_image_count: int = 0  # 生成的图片数量（xAI 按张计费）
    tool_calls: List[ToolCallResult] | None = None  # Collected tool calls from LLM


# 供应商默认 base_url 配置
DEFAULT_BASE_URLS = {
    "deepseek": "https://api.deepseek.com/v1",
    "minimax": "https://api.minimax.io/anthropic",
    "xai": "https://api.x.ai/v1",
    "ark": "https://ark.cn-beijing.volces.com/api/v3",
    "doubao": "https://ark.cn-beijing.volces.com/api/v3",
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
    """OpenAI/DeepSeek 流式调用（支持 tool calling）"""
    from openai import AsyncOpenAI
    
    client = AsyncOpenAI(
        api_key=ctx.api_key,
        base_url=get_effective_base_url(ctx),
    )
    
    create_params = {
        "model": ctx.model,
        "messages": ctx.messages,
        "temperature": ctx.temperature,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    ctx.tools and create_params.update(tools=ctx.tools)
    
    stream = await client.chat.completions.create(**create_params)
    
    thinking_started = False
    # Accumulate tool_calls across chunks (OpenAI streams tool calls in deltas)
    pending_tool_calls: dict[int, dict] = {}  # index -> {id, name, arguments}

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

        # Collect tool_calls from delta
        if chunk.choices and hasattr(chunk.choices[0].delta, 'tool_calls') and chunk.choices[0].delta.tool_calls:
            for tc_delta in chunk.choices[0].delta.tool_calls:
                idx = tc_delta.index
                entry = pending_tool_calls.setdefault(idx, {"id": "", "name": "", "arguments": ""})
                tc_delta.id and entry.update(id=tc_delta.id)
                # Early tool detection: yield signal on first name appearance
                _new_name = tc_delta.function and tc_delta.function.name
                _new_name and not entry["name"] and (yield f"__TOOL_PENDING__:{_new_name}")
                _new_name and entry.update(name=_new_name)
                _arg_chunk = tc_delta.function and tc_delta.function.arguments
                _arg_chunk and entry.update(arguments=entry["arguments"] + _arg_chunk)
                # Stream tool argument delta for progressive frontend rendering
                (_arg_chunk and entry["name"]) and (yield f"__TOOL_DELTA__:{entry['name']}:{_arg_chunk}")

        if hasattr(chunk, 'usage') and chunk.usage:
            result.input_tokens = chunk.usage.prompt_tokens
            result.output_tokens = chunk.usage.completion_tokens
    
    if thinking_started:
        yield "</think>"

    # Convert collected tool calls to result
    if pending_tool_calls:
        result.tool_calls = [
            ToolCallResult(id=tc["id"], name=tc["name"], arguments=tc["arguments"])
            for tc in pending_tool_calls.values()
            if tc["name"]
        ]


# ============================================================
# xAI/Grok 供应商（独立处理推理模式 + 图像生成）
# ============================================================

# xAI 推理参数配置（模型关键词 → thinking_mode 开启时的 extra_body）
# grok-3-mini: 支持 reasoning_effort，Chat Completions 返回 reasoning_content
# grok-4/grok-4-fast-reasoning/grok-4.1+: 不支持 reasoning_effort（传递会 API 报错），
#   始终内部推理但 Chat Completions 不返回 reasoning_content
_XAI_REASONING_EXTRA = {
    "grok-3-mini": {"reasoning_effort": "high"},
}

# xAI 图像模型集合（使用 /v1/images/generations 和 /v1/images/edits，非 chat completions）
_XAI_IMAGE_MODELS = frozenset({"grok-imagine-image", "grok-imagine-image-pro"})


async def _stream_xai_text(ctx: StreamContext, result: StreamResult) -> AsyncGenerator[str, None]:
    """xAI/Grok 文本模型流式调用（推理模式 + tool calling）"""
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key=ctx.api_key,
        base_url=get_effective_base_url(ctx),
    )

    create_params = {
        "model": ctx.model,
        "messages": ctx.messages,
        "temperature": ctx.temperature,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    ctx.tools and create_params.update(tools=ctx.tools)

    # 推理参数注入（数据驱动：匹配模型关键词 → extra_body）
    model_lower = ctx.model.lower()
    extra = next(
        (params for pattern, params in _XAI_REASONING_EXTRA.items() if pattern in model_lower),
        None,
    )
    (ctx.thinking_mode and extra) and create_params.update(extra_body=extra)

    # 日志
    ctx.thinking_mode and logger.info(
        f"xAI reasoning: model={ctx.model}, "
        f"extra_body={extra or 'none (model always reasons internally)'}"
    )

    stream = await client.chat.completions.create(**create_params)

    thinking_started = False
    pending_tool_calls: dict[int, dict] = {}

    async for chunk in stream:
        # 检测 reasoning_content（grok-3-mini 返回，grok-4+ 保留前向兼容）
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

        # Collect tool_calls from delta
        if chunk.choices and hasattr(chunk.choices[0].delta, 'tool_calls') and chunk.choices[0].delta.tool_calls:
            for tc_delta in chunk.choices[0].delta.tool_calls:
                idx = tc_delta.index
                entry = pending_tool_calls.setdefault(idx, {"id": "", "name": "", "arguments": ""})
                tc_delta.id and entry.update(id=tc_delta.id)
                # Early tool detection: yield signal on first name appearance
                _new_name = tc_delta.function and tc_delta.function.name
                _new_name and not entry["name"] and (yield f"__TOOL_PENDING__:{_new_name}")
                _new_name and entry.update(name=_new_name)
                _arg_chunk = tc_delta.function and tc_delta.function.arguments
                _arg_chunk and entry.update(arguments=entry["arguments"] + _arg_chunk)
                # Stream tool argument delta for progressive frontend rendering
                (_arg_chunk and entry["name"]) and (yield f"__TOOL_DELTA__:{entry['name']}:{_arg_chunk}")

        if hasattr(chunk, 'usage') and chunk.usage:
            result.input_tokens = chunk.usage.prompt_tokens
            result.output_tokens = chunk.usage.completion_tokens

    if thinking_started:
        yield "</think>"

    # Convert collected tool calls to result
    if pending_tool_calls:
        result.tool_calls = [
            ToolCallResult(id=tc["id"], name=tc["name"], arguments=tc["arguments"])
            for tc in pending_tool_calls.values()
            if tc["name"]
        ]


async def _stream_xai_image(ctx: StreamContext, result: StreamResult) -> AsyncGenerator[str, None]:
    """xAI 图像模型处理（图像生成 + 图像编辑）

    使用 /v1/images/generations (生成) 和 /v1/images/edits (编辑) 端点。
    根据消息中是否包含 image_url 自动选择生成或编辑模式。
    """
    import base64
    import httpx
    from openai import AsyncOpenAI
    from services.media_utils import save_inline_image, save_image_from_url

    base_url = get_effective_base_url(ctx) or "https://api.x.ai/v1"

    # 从 xai_image_config 提取配置参数
    img_cfg = (ctx.xai_image_config or {}).get("image_config") or {}
    aspect_ratio = img_cfg.get("aspect_ratio")
    resolution = img_cfg.get("resolution")
    n = img_cfg.get("n") or 1
    response_format = img_cfg.get("response_format") or "b64_json"

    # 从消息末尾提取 prompt 和源图片（用于编辑模式）
    prompt_text, source_image_url = _extract_xai_user_input(ctx.messages)

    logger.info(
        f"xAI image: model={ctx.model}, mode={'edit' if source_image_url else 'generate'}, "
        f"n={n}, aspect_ratio={aspect_ratio}, resolution={resolution}, format={response_format}"
    )

    # 图像编辑模式：使用 httpx POST /v1/images/edits（SDK images.edit 不兼容 xAI 的 JSON 格式）
    if source_image_url:
        headers = {
            "Authorization": f"Bearer {ctx.api_key}",
            "Content-Type": "application/json",
        }
        payload: Dict[str, Any] = {
            "model": ctx.model,
            "prompt": prompt_text,
            "image": {"url": source_image_url, "type": "image_url"},
        }
        aspect_ratio and payload.update(aspect_ratio=aspect_ratio)
        resolution and payload.update(resolution=resolution)
        n > 1 and payload.update(n=n)
        response_format == "b64_json" and payload.update(response_format="b64_json")

        async with httpx.AsyncClient(timeout=120) as http_client:
            resp = await http_client.post(
                f"{base_url}/images/edits",
                headers=headers,
                json=payload,
            )
            resp.status_code >= 400 and logger.error(
                f"xAI image edit error {resp.status_code}: {resp.text[:500]}"
            )
            resp.raise_for_status()
            data = resp.json()

        # 解析编辑响应
        for item in data.get("data", []):
            url = await _save_xai_image_item(item, response_format, user_id=ctx.user_id)
            md = f"\n\n![image]({url})\n\n"
            result.full_response += md
            result.generated_image_count += 1
            yield md

        return

    # 图像生成模式：使用 AsyncOpenAI SDK images.generate()
    client = AsyncOpenAI(
        api_key=ctx.api_key,
        base_url=base_url,
    )

    generate_params: Dict[str, Any] = {
        "model": ctx.model,
        "prompt": prompt_text,
        "n": n,
        "response_format": response_format,
    }
    # xAI 扩展参数通过 extra_body 传递
    extra_body: Dict[str, Any] = {}
    aspect_ratio and extra_body.update(aspect_ratio=aspect_ratio)
    resolution and extra_body.update(resolution=resolution)
    extra_body and generate_params.update(extra_body=extra_body)

    response = await client.images.generate(**generate_params)

    for item in response.data:
        url = await _save_xai_image_item_sdk(item, response_format, user_id=ctx.user_id)
        md = f"\n\n![image]({url})\n\n"
        result.full_response += md
        result.generated_image_count += 1
        yield md

    logger.info(f"xAI image generated: {result.generated_image_count} images")


def _extract_xai_user_input(messages: List[Dict[str, Any]]) -> tuple[str, str | None]:
    """从消息列表末尾提取最后一条 user 消息的文本 prompt 和可选的源图片 URL。

    Returns:
        (prompt_text, source_image_url) — source_image_url 为 None 表示生成模式，否则编辑模式
    """
    # 内容类型提取器映射表
    _PART_EXTRACTORS = {
        "text": lambda p, ctx: ctx.update(prompt=p.get("text", "")),
        "image_url": lambda p, ctx: ctx.update(image=p.get("image_url", {}).get("url")),
    }

    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content", "")
        # 纯文本消息
        if isinstance(content, str):
            return content, None
        # 多模态消息
        if isinstance(content, list):
            ctx: Dict[str, Any] = {"prompt": "", "image": None}
            for part in content:
                extractor = _PART_EXTRACTORS.get(part.get("type", ""))
                extractor and extractor(part, ctx)
            return ctx["prompt"], ctx["image"]
        break

    return "", None


async def _save_xai_image_item(item: dict, response_format: str, user_id: str | None = None) -> str:
    """保存 xAI API 返回的图像数据（httpx 响应格式）"""
    import base64
    from services.media_utils import save_inline_image, save_image_from_url

    b64_data = item.get("b64_json")
    url_data = item.get("url")

    # b64_json 格式
    if b64_data:
        image_bytes = base64.b64decode(b64_data)
        return await save_inline_image("image/png", image_bytes, user_id=user_id)

    # url 格式
    if url_data:
        return await save_image_from_url(url_data, user_id=user_id)

    return ""


async def _save_xai_image_item_sdk(item, response_format: str, user_id: str | None = None) -> str:
    """保存 xAI SDK 返回的图像数据（OpenAI SDK ImagesResponse 格式）"""
    import base64
    from services.media_utils import save_inline_image, save_image_from_url

    b64_data = getattr(item, "b64_json", None)
    url_data = getattr(item, "url", None)

    # b64_json 格式
    if b64_data:
        image_bytes = base64.b64decode(b64_data)
        return await save_inline_image("image/png", image_bytes, user_id=user_id)

    # url 格式
    if url_data:
        return await save_image_from_url(url_data, user_id=user_id)

    return ""


@register_provider("xai")
async def stream_xai(ctx: StreamContext, result: StreamResult) -> AsyncGenerator[str, None]:
    """xAI/Grok 统一分发器：根据模型类型路由到文本或图像处理器"""
    handler = _stream_xai_image if ctx.model in _XAI_IMAGE_MODELS else _stream_xai_text
    async for chunk in handler(ctx, result):
        yield chunk


# ============================================================
# 火山方舟 (Ark) 供应商 — 文本(OpenAI 兼容) + 图像(Seedream)
# ============================================================

# Ark Seedream 图像模型集合（使用 /images/generations，非 chat completions）
_ARK_IMAGE_MODELS = frozenset({
    "doubao-seedream-5-0-260128",
    "doubao-seedream-4-5-250115",
    "doubao-seedream-4-0-241220",
})


async def _stream_ark_image(ctx: StreamContext, result: StreamResult) -> AsyncGenerator[str, None]:
    """火山方舟 Seedream 图像生成（使用 /images/generations 端点）"""
    from openai import AsyncOpenAI
    from services.media_utils import save_image_from_url

    base_url = get_effective_base_url(ctx) or "https://ark.cn-beijing.volces.com/api/v3"
    client = AsyncOpenAI(api_key=ctx.api_key, base_url=base_url)

    # 从最后一条 user 消息提取 prompt
    prompt_text, _ = _extract_xai_user_input(ctx.messages)

    # 从 xai_image_config 提取配置（复用统一字段）
    img_cfg = (ctx.xai_image_config or {}).get("image_config") or {}
    n = img_cfg.get("n") or 1
    size = img_cfg.get("size") or "1K"
    watermark = img_cfg.get("watermark", False)

    logger.info(
        f"Ark Seedream: model={ctx.model}, n={n}, size={size}, watermark={watermark}"
    )

    generate_params: Dict[str, Any] = {
        "model": ctx.model,
        "prompt": prompt_text,
        "n": n,
        "response_format": "url",
        "extra_body": {"size": size, "watermark": watermark},
    }

    response = await client.images.generate(**generate_params)

    for item in response.data:
        url_data = getattr(item, "url", None)
        url = (await save_image_from_url(url_data, user_id=ctx.user_id)) if url_data else ""
        md = f"\n\n![image]({url})\n\n"
        result.full_response += md
        result.generated_image_count += 1
        yield md

    logger.info(f"Ark Seedream generated: {result.generated_image_count} images")


@register_provider("ark", "doubao")
async def stream_ark(ctx: StreamContext, result: StreamResult) -> AsyncGenerator[str, None]:
    """火山方舟统一分发器：Seedream 图像模型 → 图像处理，其他 → OpenAI 兼容文本处理"""
    handler = _stream_ark_image if ctx.model in _ARK_IMAGE_MODELS else _PROVIDER_REGISTRY["openai"]
    async for chunk in handler(ctx, result):
        yield chunk


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
    """Anthropic/MiniMax 流式调用（支持 tool calling）"""
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
    
    # 添加 tools（转换为 Anthropic 格式: input_schema 替代 parameters）
    if ctx.tools:
        anthropic_tools = [
            {
                "name": t["function"]["name"],
                "description": t["function"]["description"],
                "input_schema": t["function"]["parameters"],
            }
            for t in ctx.tools
        ]
        request_params["tools"] = anthropic_tools
    
    # 启用 extended thinking
    if ctx.thinking_mode:
        request_params["thinking"] = {
            "type": "enabled",
            "budget_tokens": min(10000, ctx.context_window // 4)
        }
    
    # 统一使用流式调用（部分 Anthropic 兼容 API 如 MiniMax 强制要求 streaming）
    # 使用 event-level 迭代替代 text_stream，以便在工具参数生成前就检测到 tool_use 块
    async with client.messages.stream(**request_params) as stream:
        async for event in stream:
            ev_type = getattr(event, 'type', '')

            # Text content delta
            text = (ev_type == 'content_block_delta') and getattr(getattr(event, 'delta', None), 'text', None)
            if text:
                result.full_response += text
                yield text

            # Tool use block start → yield early detection signal
            # (content_block_start 包含工具名，早于参数生成，前端可提前显示加载状态)
            block = (ev_type == 'content_block_start') and getattr(event, 'content_block', None)
            tool_name = block and (getattr(block, 'type', '') == 'tool_use') and getattr(block, 'name', '')
            tool_name and (yield f"__TOOL_PENDING__:{tool_name}")

        # 事件迭代完成后，get_final_message() 直接返回已累积的完整消息
        final_message = await stream.get_final_message()
        final_message.usage and (
            setattr(result, 'input_tokens', final_message.usage.input_tokens),
            setattr(result, 'output_tokens', final_message.usage.output_tokens),
        )

        # 从 final_message 中提取 tool_use blocks
        for block in final_message.content:
            block_type = getattr(block, 'type', '')
            (block_type == 'tool_use') and (
                (result.tool_calls is not None or setattr(result, 'tool_calls', [])) or True
            ) and result.tool_calls.append(ToolCallResult(
                id=block.id,
                name=block.name,
                arguments=json.dumps(block.input) if isinstance(block.input, dict) else str(block.input),
            ))


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


def _openai_tools_to_gemini(tools: list[dict]) -> list[dict]:
    """Convert OpenAI-format tool definitions to Gemini function_declarations format."""
    return [{"function_declarations": [
        {
            "name": t["function"]["name"],
            "description": t["function"]["description"],
            "parameters": t["function"]["parameters"],
        }
        for t in tools
    ]}]


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
    - 工具调用: {"role": "assistant", "tool_calls": [...]}
    - 工具响应: {"role": "tool", "tool_call_id": "...", "content": "..."}
    """
    from google.genai import types

    system_parts, contents = [], []
    _tc_names: dict[str, str] = {}  # tool_call_id → function name
    
    for m in messages:
        role, content = m["role"], m["content"]
        
        # system 消息
        (role == "system") and system_parts.append(content if isinstance(content, str) else str(content))
        
        # assistant with tool_calls → model function_call parts
        tool_calls = m.get("tool_calls")
        if role == "assistant" and tool_calls:
            parts = []
            content and parts.append({"text": content})
            for tc in tool_calls:
                func = tc.get("function", {})
                name = func.get("name", "")
                args = json.loads(func.get("arguments", "{}"))
                _tc_names[tc.get("id", "")] = name
                part_kwargs = {"function_call": types.FunctionCall(name=name, args=args)}
                thought_sig = tc.get("thought_signature")
                thought_sig and part_kwargs.update(thought_signature=thought_sig)
                parts.append(types.Part(**part_kwargs))
            contents.append({"role": "model", "parts": parts})
            continue
        
        # tool response → user function_response parts
        if role == "tool":
            tc_id = m.get("tool_call_id", "")
            fn_name = _tc_names.get(tc_id, "unknown")
            parts = [types.Part(
                function_response=types.FunctionResponse(
                    name=fn_name,
                    response={"result": content},
                )
            )]
            contents.append({"role": "user", "parts": parts})
            continue
        
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

    # Custom function tools (OpenAI → Gemini format, with AFC disabled)
    _fn_tools = _openai_tools_to_gemini(ctx.tools) if ctx.tools else []
    _fn_tools and config_params.update(
        tools=config_params.get("tools", []) + _fn_tools,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )

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
        f"fn_tools={'ON(' + str(len(ctx.tools)) + ')' if ctx.tools else 'OFF'}, "
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
                        url = await save_inline_image(mime_type, data, user_id=ctx.user_id)
                        logger.info(f"Gemini image saved: {url} ({len(data)} bytes)")
                        md = f"\n\n![image]({url})\n\n"
                        result.full_response += md
                        yield md

                # Extract function calls
                fn_call = getattr(part, 'function_call', None)
                if fn_call:
                    result.tool_calls = result.tool_calls or []
                    result.tool_calls.append(ToolCallResult(
                        id=f"gemini-tc-{len(result.tool_calls)}",
                        name=fn_call.name,
                        arguments=json.dumps(dict(fn_call.args) if fn_call.args else {}),
                        thought_signature=getattr(part, 'thought_signature', None),
                    ))

        usage = getattr(response, 'usage_metadata', None)
        usage and _parse_gemini_usage(usage, result)

        # 统计搜索查询次数（保守策略：检测到 grounding_metadata 即计 1 次）
        for candidate in (getattr(response, 'candidates', None) or []):
            grounding = getattr(candidate, 'grounding_metadata', None)
            chunks = getattr(grounding, 'grounding_chunks', None) or []
            result.search_query_count += min(len(chunks), 1)

        # Propagate result when only tool calls were received (no text/image)
        (result.tool_calls and not result.full_response) and (yield "")

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
                    # 记录原始 thought 属性值
                    raw_thought = getattr(part, 'thought', None)
                    
                    # Gemini 思考内容检测：
                    # - raw_thought=True: 确定是思考内容
                    # - raw_thought=False: 确定是正式回复内容
                    # - raw_thought=None: 状态未明确，需要推断
                    # 
                    # 关键洞察：当思考结束时，raw_thought 会从 True 变为 None，
                    # 而不是变为 False。我们需要检测这种变化来正确关闭思考标签。
                    if raw_thought is True:
                        is_thought = True
                    elif raw_thought is False:
                        is_thought = False
                    else:  # raw_thought is None
                        # 状态未明确，检查内容特征来推断
                        # 如果已经在思考状态，且文本看起来像正式回复（不以 Markdown 标题开头），
                        # 则认为思考已结束
                        if in_thinking and not (text.startswith('**') or text.startswith('#') or text.startswith('\n**')):
                            is_thought = False
                        else:
                            is_thought = in_thinking  # 保持当前状态
                    
                    prefix = THINK_TRANSITIONS.get((in_thinking, is_thought), "")
                    
                    # 调试日志：记录每个 part 的详细信息
                    prefix and logger.info(
                        f"Gemini thinking transition: {in_thinking} -> {is_thought}, "
                        f"prefix={prefix!r}, raw_thought={raw_thought}, text={text[:60]!r}"
                    )

                    output = prefix + text
                    result.full_response += output
                    yield output

                    in_thinking = is_thought

                # Extract function calls from streaming chunks
                fn_call = getattr(part, 'function_call', None)
                if fn_call:
                    result.tool_calls = result.tool_calls or []
                    result.tool_calls.append(ToolCallResult(
                        id=f"gemini-tc-{len(result.tool_calls)}",
                        name=fn_call.name,
                        arguments=json.dumps(dict(fn_call.args) if fn_call.args else {}),
                        thought_signature=getattr(part, 'thought_signature', None),
                    ))

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
        logger.debug(f"Gemini stream ended while in thinking state, appending </think>")
        result.full_response += "</think>\n"
        yield "</think>\n"
    
    # 调试：记录完整的响应内容（用于排查思考标签问题）
    logger.debug(f"Gemini full_response ends with: {result.full_response[-50:]!r}")

    # Propagate result when only tool calls were received (no text)
    (result.tool_calls and not result.full_response) and (yield "")


# ============================================================
# 统一入口
# ============================================================
async def stream_completion(
    provider_type: str,
    api_key: str,
    base_url: str | None,
    model: str,
    messages: List[Dict[str, Any]],
    temperature: float,
    context_window: int,
    thinking_mode: bool = False,
    gemini_config: Dict[str, Any] | None = None,
    tools: List[Dict[str, Any]] | None = None,
    xai_image_config: Dict[str, Any] | None = None,
    user_id: str | None = None,
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
        xai_image_config=xai_image_config,
        tools=tools,
        user_id=user_id,
    )
    result = StreamResult()
    
    # 查找注册的处理器
    handler = _PROVIDER_REGISTRY.get(ctx.provider_type)
    
    if not handler:
        # 默认回退到 OpenAI 兼容
        handler = _PROVIDER_REGISTRY.get("openai")
        logger.warning(f"Unknown provider '{ctx.provider_type}', falling back to OpenAI compatible")
    
    try:
        yielded = False
        async for chunk in handler(ctx, result):
            yielded = True
            yield chunk, result
        # When handler produced tool_calls but no text, yield sentinel so caller sees result
        (not yielded and result.tool_calls) and (yield ("", result))  # type: ignore[func-returns-value]
    except Exception as e:
        error_str = str(e)
        logger.error(f"LLM stream error: {error_str}")
        
        # 如果已有响应内容，静默处理（可能是流正常结束时的传输错误）
        # 仅在没有内容时向用户显示错误
        has_content = result.full_response.strip()
        has_content or setattr(result, 'full_response', f"Error: {error_str}") or (yield result.full_response, result)
