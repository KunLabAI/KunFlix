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

from models import Agent, LLMProvider, ToolConfig

if TYPE_CHECKING:
    from services.tool_manager.context import ToolContext

logger = logging.getLogger(__name__)

IMAGE_EDIT_TOOL_NAME = "edit_image"

# 媒体文件目录
MEDIA_DIR = Path(__file__).resolve().parent.parent.parent / "media"

# 图片编辑支持的供应商类型（与生成相同）
_EDIT_CAPABLE_PROVIDERS = {"xai", "gemini"}


# ---------------------------------------------------------------------------
# Image URL Helpers
# ---------------------------------------------------------------------------

def _resolve_image_url(image_url: str) -> str:
    """Resolve image URL to a format suitable for API.
    
    Handles:
    1. data:image/...;base64,... → 直接返回
    2. http(s)://... → 直接返回
    3. /api/media/xxx.jpg → 转换为 base64 data URL
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

def _build_image_edit_tool_def() -> dict:
    """Build edit_image tool definition."""
    return {
        "type": "function",
        "function": {
            "name": IMAGE_EDIT_TOOL_NAME,
            "description": (
                "Edit an existing image using AI. Provide the image URL and a prompt "
                "describing the desired changes. The tool returns the edited image URL "
                "in markdown format. Use this for modifying, stylizing, or enhancing images."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "image_url": {
                        "type": "string",
                        "description": (
                            "URL or data URL of the image to edit. "
                            "Can be a public URL or base64 data URL."
                        ),
                    },
                    "prompt": {
                        "type": "string",
                        "description": (
                            "Description of how to edit the image. "
                            "Be specific about the changes you want: style transfer, "
                            "color adjustments, adding/removing elements, etc."
                        ),
                    },
                    "aspect_ratio": {
                        "type": "string",
                        "enum": ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "2:1", "1:2"],
                        "description": "Output image aspect ratio. Default follows input image.",
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
) -> str:
    """Edit image via xAI API."""
    import httpx
    from services.media_utils import save_image_from_url
    
    url = f"{base_url or 'https://api.x.ai'}/v1/images/edits"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": model,
        "prompt": prompt,
        "image": {"url": image_url, "type": "image_url"},
    }
    aspect_ratio and aspect_ratio != "auto" and payload.update(aspect_ratio=aspect_ratio)
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.status_code >= 400 and logger.error(
            f"xAI image edit error {resp.status_code}: {resp.text[:500]}"
        )
        resp.raise_for_status()
        data = resp.json()
    
    # 下载并保存编辑后的图片
    images = data.get("data", [])
    if not images:
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
) -> str:
    """Edit image via Gemini API."""
    from google import genai
    from google.genai import types
    
    client = genai.Client(api_key=api_key)
    
    # 构建图片内容
    image_part = types.Part.from_uri(file_uri=image_url, mime_type="image/jpeg")
    
    config = types.GenerateContentConfig()
    aspect_ratio and aspect_ratio != "auto" and setattr(
        config, "image_config", types.ImageConfig(aspect_ratio=aspect_ratio)
    )
    
    response = client.models.generate_content(
        model=model or "gemini-2.0-flash-exp-image-generation",
        contents=[image_part, prompt],
        config=config,
    )
    
    # 提取生成的图片
    for part in response.candidates[0].content.parts:
        if part.inline_data:
            from services.media_utils import save_inline_image
            import base64
            img_bytes = base64.b64decode(part.inline_data.data)
            mime_type = part.inline_data.mime_type or "image/png"
            return save_inline_image(mime_type, img_bytes)
    
    return ""


# 供应商调度表
_EDIT_HANDLERS = {
    "xai": _edit_via_xai,
    "gemini": _edit_via_gemini,
}


async def _execute_image_edit_tool(args: dict, agent: Agent, db: AsyncSession) -> str:
    """Execute edit_image tool."""
    image_url = args.get("image_url", "")
    prompt = args.get("prompt", "")
    aspect_ratio = args.get("aspect_ratio")
    
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
    
    try:
        edited_url = await handler(
            api_key=provider.api_key,
            base_url=provider.base_url,
            model=model,
            image_url=resolved_url,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
        )
        
        if not edited_url:
            return "Image editing completed but no result was returned."
        
        # 如果是相对路径，转换为 API URL
        if edited_url.startswith("/"):
            edited_url = f"/api{edited_url}"
        
        return f"Edited image:\n\n![edited image]({edited_url})"
        
    except Exception as e:
        logger.error("edit_image tool error: %s", e)
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
        # 检查智能体模型是否支持工具调用
        if not _check_agent_eligible(ctx.agent):
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
        
        return [_build_image_edit_tool_def()]

    async def execute(self, name: str, args: dict, ctx: "ToolContext") -> str:
        """Execute edit_image tool."""
        return await _execute_image_edit_tool(args, ctx.agent, ctx.db)

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
