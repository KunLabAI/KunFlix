"""
Image editing tool provider.

Provides edit_image tool for AI-powered image editing.
Uses the same global configuration as generate_image tool.
"""
import json
import logging
import re
from pathlib import Path
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Agent, LLMProvider, ToolConfig, TheaterNode, TheaterEdge, generate_uuid
from services.image_config_adapter import to_provider_config, IMAGE_PROVIDER_CAPABILITIES
from services.media_utils import MEDIA_DIR

if TYPE_CHECKING:
    from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)

IMAGE_EDIT_TOOL_NAME = "edit_image"

# 图片编辑支持的供应商类型（与生成相同）
_EDIT_CAPABLE_PROVIDERS = {"xai", "gemini"}

# Fallback aspect ratio enum（与 image_gen.py 的 _ASPECT_RATIO_ENUM 对齐）
_FALLBACK_ASPECT_RATIOS = [
    "auto", "1:1", "16:9", "9:16", "4:3", "3:4",
    "3:2", "2:3", "2:1", "1:2",
]

# 供应商特定参数提取器（避免 if 链）
_EDIT_PARAM_EXTRACTORS: dict[str, callable] = {
    "xai":    lambda img_cfg: {"resolution": img_cfg.get("resolution")},
    "gemini": lambda img_cfg: {"image_size": img_cfg.get("image_size")},
}


# ---------------------------------------------------------------------------
# Image URL Helpers
# ---------------------------------------------------------------------------

def _resolve_image_url(image_url: str) -> str:
    """Resolve image URL to a format suitable for API.
    
    Handles:
    1. data:image/...;base64,... → 直接返回
    2. http(s)://... → 直接返回
    3. /api/media/xxx.jpg → 转换为 base64 data URL
    4. xxx.jpg 或 xxx (纯文件名/UUID) → 查找本地文件并转换为 base64
    """
    # 已经是 data URL
    if image_url.startswith("data:image"):
        return image_url
    
    # 公开 URL
    if image_url.startswith("http://") or image_url.startswith("https://"):
        return image_url
    
    # 本地 API 路径 → 转换为 base64
    match = re.match(r"^/api/media/(.+)$", image_url)
    if match:
        filename = match.group(1)
        local_path = MEDIA_DIR / filename
        return _local_file_to_data_url(local_path)
    
    # 纯文件名或 UUID（无路径前缀）→ 尝试在 media 目录查找
    # 支持格式：xxx.jpg, xxx.png, xxx (无扩展名)
    if image_url and not "/" in image_url:
        # 先尝试直接查找
        direct_path = MEDIA_DIR / image_url
        if direct_path.exists():
            return _local_file_to_data_url(direct_path)
        
        # 如果没有扩展名，尝试匹配常见图片扩展名
        if "." not in image_url:
            for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
                candidate_path = MEDIA_DIR / (image_url + ext)
                if candidate_path.exists():
                    return _local_file_to_data_url(candidate_path)
    
    # 无法识别的格式，原样返回
    return image_url


def _local_file_to_data_url(path: Path) -> str:
    """Convert local image file to base64 data URL."""
    import base64
    import mimetypes
    
    if not path.exists():
        raise FileNotFoundError(f"Image file not found: {path}")
    
    mime, _ = mimetypes.guess_type(str(path))
    mime = mime or "image/png"
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


# ---------------------------------------------------------------------------
# Tool Definition
# ---------------------------------------------------------------------------

def _build_image_edit_tool_def(provider_type: str = "") -> dict:
    """Build edit_image tool definition.

    The aspect_ratio and quality enums are tailored to the configured
    provider's supported values when *provider_type* is given.
    """
    caps = IMAGE_PROVIDER_CAPABILITIES.get(provider_type, {})
    aspect_ratios = caps.get("aspect_ratios", _FALLBACK_ASPECT_RATIOS)
    qualities = caps.get("qualities", ["standard", "hd"])

    return {
        "type": "function",
        "function": {
            "name": IMAGE_EDIT_TOOL_NAME,
            "description": (
                "Generate or edit an image using a reference image as the visual basis (image-to-image). "
                "Use this whenever a reference image exists and the output should visually relate to it: "
                "reference-based generation, character consistency across scenes, style transfer, or image modification. "
                "Provide the image URL and a prompt describing the desired output. "
                "Returns the result image URL in markdown format."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "image_url": {
                        "type": "string",
                        "description": (
                            "URL or path of the reference/source image. "
                            "Use the image file path (e.g. /api/media/filename.jpg) "
                            "or a public URL. Do NOT pass inline base64 data."
                        ),
                    },
                    "prompt": {
                        "type": "string",
                        "description": (
                            "Description of the desired output image. "
                            "For reference-based generation, describe the full target scene "
                            "while noting which elements to preserve from the reference. "
                            "For editing, describe the specific changes."
                        ),
                    },
                    "aspect_ratio": {
                        "type": "string",
                        "enum": aspect_ratios,
                        "description": "Output image aspect ratio. Default follows input image.",
                    },
                    "quality": {
                        "type": "string",
                        "enum": qualities,
                        "description": (
                            "Output image quality/resolution. "
                            "Higher quality produces larger images. Default uses global config."
                        ),
                    },
                },
                "required": ["image_url", "prompt"],
            },
        },
    }


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

async def _get_global_image_config(db: AsyncSession) -> dict:
    """获取全局图像配置（与 generate_image 共享）。"""
    result = await db.execute(
        select(ToolConfig).where(ToolConfig.tool_name == "generate_image")
    )
    tool_config = result.scalar_one_or_none()
    return (tool_config.config if tool_config else {}) or {}


def _check_agent_eligible(agent: Agent) -> bool:
    """Check if agent model supports tool calls (not image-only models)."""
    IMAGE_ONLY_MODELS = {
        "grok-2-image", "grok-2-image-1212", "grok-2-vision",
        "dall-e-3", "dall-e-2", "stable-diffusion",
    }
    return agent.model not in IMAGE_ONLY_MODELS


# ---------------------------------------------------------------------------
# Image Editing Implementation
# ---------------------------------------------------------------------------

async def _edit_via_xai(
    api_key: str,
    base_url: str | None,
    model: str,
    image_url: str,
    prompt: str,
    aspect_ratio: str | None,
    resolution: str | None = None,
) -> str:
    """Edit image via xAI API."""
    import httpx
    import base64
    from services.media_utils import save_image_from_url
    
    # 处理 base_url，避免 /v1 重复
    api_base = (base_url or "https://api.x.ai").rstrip("/")
    api_base = api_base.removesuffix("/v1")
    url = f"{api_base}/v1/images/edits"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    # xAI API 的 image 字段始终使用 {"url": ..., "type": "image_url"} 格式
    # url 既支持公开 URL，也支持 data:image/...;base64,... 格式
    image_payload = {"url": image_url, "type": "image_url"}
    
    payload = {
        "model": model,
        "prompt": prompt,
        "image": image_payload,
    }
    aspect_ratio and aspect_ratio != "auto" and payload.update(aspect_ratio=aspect_ratio)
    resolution and payload.update(resolution=resolution)
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            logger.error(f"xAI image edit error {resp.status_code}: {resp.text[:500]}")
            # Extract human-readable error from xAI response for better agent feedback
            try:
                err_body = resp.json()
                err_msg = err_body.get("error", resp.text[:200])
            except Exception:
                err_msg = resp.text[:200]
            raise RuntimeError(f"xAI image edit {resp.status_code}: {err_msg}")
        data = resp.json()
    
    logger.info(f"xAI edit response: {data}")
    
    # 下载并保存编辑后的图片
    images = data.get("data", [])
    if not images:
        logger.warning("xAI edit returned no images")
        return ""
    
    result_url = images[0].get("url", "")
    result_url and (result_url := await save_image_from_url(result_url))
    return result_url


async def _edit_via_gemini(
    api_key: str,
    base_url: str | None,
    model: str,
    image_url: str,
    prompt: str,
    aspect_ratio: str | None,
    image_size: str | None = None,
) -> str:
    """Edit image via Gemini API.
    
    Supports:
    - data:image/...;base64,... (inline base64)
    - https://... (public URL via Part.from_uri)
    """
    import base64
    from google import genai
    from google.genai import types
    
    client = genai.Client(api_key=api_key)
    
    # 构建 image_part
    image_part: types.Part
    
    # 处理 base64 data URL
    if image_url.startswith("data:image"):
        # 解析 data:image/jpeg;base64,xxxxx 格式
        header, data = image_url.split(",", 1)
        mime_match = header.split(";")[0].split(":")[1]
        mime_type = mime_match or "image/jpeg"
        # 清理 base64 数据：移除换行符、空格，修正 padding
        data = data.strip()
        padding = len(data) % 4
        padding and (data := data + "=" * (4 - padding))
        img_bytes = base64.b64decode(data)
        image_part = types.Part.from_bytes(data=img_bytes, mime_type=mime_type)
    elif image_url.startswith("http://") or image_url.startswith("https://"):
        # 公开 URL → 先下载再用 inline bytes（Gemini 服务器无法抓取大部分 CDN URL）
        import httpx
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as http:
            dl_resp = await http.get(image_url)
            dl_resp.raise_for_status()
        mime_type = dl_resp.headers.get("content-type", "image/jpeg").split(";")[0]
        image_part = types.Part.from_bytes(data=dl_resp.content, mime_type=mime_type)
    else:
        raise ValueError(f"Unsupported image URL format: {image_url[:50]}...")
    
    # 构建配置（与 batch_image_gen.py 对齐：camelCase 参数名 + 值映射）
    from services.batch_image_gen import IMAGE_SIZE_MAP
    safe_aspect = (aspect_ratio and aspect_ratio != "auto") and aspect_ratio or None
    safe_size = image_size and IMAGE_SIZE_MAP.get(image_size)

    img_cfg_params = {"aspectRatio": safe_aspect, "imageSize": safe_size}
    img_cfg_params = {k: v for k, v in img_cfg_params.items() if v is not None}

    config = types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"],
        image_config=types.ImageConfig(**img_cfg_params) if img_cfg_params else types.ImageConfig(),
    )
    
    response = client.models.generate_content(
        model=model or "gemini-2.0-flash-exp-image-generation",
        contents=[image_part, prompt],
        config=config,
    )
    
    # 提取生成的图片（与 batch_image_gen.py 对齐：SDK 返回的 data 已是原始 bytes）
    from services.media_utils import save_inline_image
    for candidate in (getattr(response, "candidates", None) or []):
        for part in (getattr(getattr(candidate, "content", None), "parts", None) or []):
            inline_data = getattr(part, "inline_data", None)
            data = getattr(inline_data, "data", None) if inline_data else None
            if data:
                return save_inline_image(
                    getattr(inline_data, "mime_type", "image/png"), data
                )
    
    return ""


# 供应商调度表
_EDIT_HANDLERS = {
    "xai": _edit_via_xai,
    "gemini": _edit_via_gemini,
}

# 编辑后节点位置偏移
_EDIT_NODE_X_OFFSET = 460


# ---------------------------------------------------------------------------
# Canvas Node + Edge Creation (edit derivation)
# ---------------------------------------------------------------------------

async def _maybe_create_edit_node(
    edited_url: str,
    original_image_url: str,
    ctx: "ToolContext",
) -> str | None:
    """After successful image edit, create a new canvas node linked to the source node.

    Returns a formatted result string if a node was created, or None to fall back
    to the default plain-text result.
    """
    try:
        db = ctx.db
        theater_id = ctx.theater_id

        # 查找源节点：匹配 imageUrl 字段
        result = await db.execute(
            select(TheaterNode).where(
                TheaterNode.theater_id == theater_id,
                TheaterNode.node_type == "image",
            )
        )
        nodes = result.scalars().all()
        source = next(
            (n for n in nodes if (n.data or {}).get("imageUrl") == original_image_url),
            None,
        )
        source or logger.info("edit_image: no source node found for %s", original_image_url)
        if not source:
            return None

        # 构建新节点数据（继承源节点属性）
        source_data = source.data or {}
        new_node = TheaterNode(
            id=generate_uuid(),
            theater_id=theater_id,
            node_type="image",
            position_x=(source.position_x or 0) + _EDIT_NODE_X_OFFSET,
            position_y=source.position_y or 0,
            width=source.width or 420,
            height=source.height or 300,
            z_index=0,
            data={
                "name": f"Edited: {source_data.get('name', 'Image')}",
                "description": source_data.get("description", ""),
                "imageUrl": edited_url,
                "fitMode": source_data.get("fitMode", "cover"),
            },
            created_by_agent_id=ctx.agent.id,
        )
        db.add(new_node)

        # 创建连线：源节点 → 新节点（左侧输出 → 右侧输入）
        edge = TheaterEdge(
            id=generate_uuid(),
            theater_id=theater_id,
            source_node_id=source.id,
            target_node_id=new_node.id,
            source_handle="left-source",
            target_handle="right-target",
            edge_type="custom",
            animated=True,
            style={},
        )
        db.add(edge)

        await db.commit()
        logger.info(
            "edit_image: created edit node %s linked to source %s",
            new_node.id, source.id,
        )

        return (
            f"Edited image:\n\n![edited image]({edited_url})\n\n"
            f"A new canvas node (id: {new_node.id}) has been created with the edited image "
            f"and connected to the original node (id: {source.id}) via an edge. "
            f"The original image is preserved. Do NOT call update_canvas_node."
        )

    except Exception as e:
        logger.warning("edit_image: failed to create edit node: %s", e, exc_info=True)
        return None


async def _execute_image_edit_tool(args: dict, ctx: "ToolContext") -> str:
    """Execute edit_image tool."""
    agent = ctx.agent
    db = ctx.db

    image_url = args.get("image_url", "")
    prompt = args.get("prompt", "")
    aspect_ratio = args.get("aspect_ratio")
    quality = args.get("quality")
    
    # 处理不同格式的 image_url
    # 1. data:image/...;base64,... → 直接使用
    # 2. http(s)://... → 直接使用
    # 3. /api/media/xxx.jpg → 转换为 base64 data URL
    resolved_url = _resolve_image_url(image_url)
    
    # 从全局配置读取供应商信息
    cfg = await _get_global_image_config(db)
    
    image_gen_enabled = cfg.get("image_generation_enabled", False)
    if not image_gen_enabled:
        return json.dumps({"error": "Image editing is not enabled. Please enable image generation in tool config."})
    
    provider_id = cfg.get("image_provider_id")
    model = cfg.get("image_model", "")
    
    # 获取供应商
    result = await db.execute(
        select(LLMProvider).where(LLMProvider.id == provider_id, LLMProvider.is_active == True)
    )
    provider = result.scalar_one_or_none()
    
    if not provider:
        return json.dumps({"error": f"Image provider {provider_id} not found or inactive"})
    
    provider_type = provider.provider_type.lower()
    handler = _EDIT_HANDLERS.get(provider_type)
    
    if not handler:
        return json.dumps({"error": f"Image editing not supported for provider type: {provider_type}"})
    
    # 构建覆盖配置：将用户传入的 quality / aspect_ratio 合并到全局 cfg
    override_img_cfg: dict = {}
    quality and override_img_cfg.update(quality=quality)
    aspect_ratio and override_img_cfg.update(aspect_ratio=aspect_ratio)
    
    base_img_cfg = cfg.get("image_config") or {}
    unified = {**cfg, "image_config": {**base_img_cfg, **override_img_cfg}}
    
    # 通过配置适配器转换为供应商特定参数
    adapted = to_provider_config(provider_type, unified)
    adapted_img = (adapted.get("image_config") or {})
    
    # 从适配后的配置提取最终 aspect_ratio
    final_aspect = adapted_img.get("aspect_ratio") or aspect_ratio
    
    # 从适配后的配置提取供应商特定参数（resolution / image_size）
    extractor = _EDIT_PARAM_EXTRACTORS.get(provider_type, lambda c: {})
    extra = extractor(adapted_img)
    
    try:
        edited_url = await handler(
            api_key=provider.api_key,
            base_url=provider.base_url,
            model=model,
            image_url=resolved_url,
            prompt=prompt,
            aspect_ratio=final_aspect,
            **extra,
        )
            
        logger.info(f"edit_image result: {edited_url}")
            
        if not edited_url:
            return json.dumps({"error": "Image editing returned no result. The request may have been filtered."})
            
        # 画布上下文存在时，自动创建新节点并连线到源节点（保留原始节点不变）
        canvas_result = ctx.theater_id and await _maybe_create_edit_node(edited_url, image_url, ctx)
        return canvas_result or f"Edited image:\n\n![edited image]({edited_url})"
    
    except Exception as e:
        logger.error("edit_image tool error: %s", e, exc_info=True)
        return json.dumps({"error": f"Image editing failed: {str(e)}"})


# ---------------------------------------------------------------------------
# ImageEditProvider class
# ---------------------------------------------------------------------------

class ImageEditProvider:
    """Provider for AI image editing tool."""

    display_name = "图像编辑"
    description = "AI 图像编辑（修改、风格化、增强现有图片）"
    condition = "需要启用全局配置且供应商支持图片编辑"

    @property
    def tool_names(self) -> frozenset[str]:
        return frozenset({IMAGE_EDIT_TOOL_NAME})

    async def build_defs(self, ctx: "ToolContext") -> list[dict]:
        """Build tool definitions if enabled and supported."""
        # Skill-gate: 如果 image_tools skill 已配置但未加载，延迟注入
        if ctx.is_skill_gated("image_tools"):
            return []

        # 检查智能体模型是否支持工具调用
        if not _check_agent_eligible(ctx.agent):
            return []
        
        # 当 image_tools skill 被显式加载时，跳过 agent 级别的开关检查
        skill_explicitly_loaded = "image_tools" in ctx.loaded_tool_skills

        # 检查智能体级别的开关（仅在非 skill-gate 模式下检查）
        agent_image_enabled = skill_explicitly_loaded or (ctx.agent.image_config or {}).get("image_generation_enabled", False)
        if not agent_image_enabled:
            return []
        
        # 从全局配置读取
        global_config = await ctx.get_global_image_config()
        is_enabled = global_config.get("image_generation_enabled", False)
        
        if not is_enabled:
            return []
        
        # 检查供应商是否支持编辑
        provider_type = await ctx.resolve_image_provider_type()
        if provider_type not in _EDIT_CAPABLE_PROVIDERS:
            return []
        
        return [_build_image_edit_tool_def(provider_type)]

    async def execute(self, name: str, args: dict, ctx: "ToolContext") -> str:
        """Execute edit_image tool."""
        return await _execute_image_edit_tool(args, ctx)

    def rebuild_defs(self, ctx: "ToolContext") -> list[dict] | None:
        return None

    def get_tool_metadata(self) -> list[dict]:
        """Return static metadata for registry display."""
        d = _build_image_edit_tool_def()
        return [
            {
                "name": d["function"]["name"],
                "description": d["function"]["description"],
                "parameters": d["function"]["parameters"],
            }
        ]
