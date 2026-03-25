"""媒体文件服务路由"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import FileResponse
from pathlib import Path
import re
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Agent, LLMProvider
from schemas import (
    BatchImageGenerateRequest,
    BatchImageGenerateResponse,
    SingleImageResultResponse,
    BatchImageConfigRequest,
)
from services.batch_image_gen import batch_generate_images, BatchImageConfig
from services.xai_image_gen import batch_generate_xai_images, XAIBatchImageConfig

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/media", tags=["media"])

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"

# 安全文件名：UUID + 已知媒体扩展名（图片 + 视频）
_SAFE_FILENAME = re.compile(r'^[a-f0-9\-]{36}\.(png|jpg|jpeg|webp|gif|mp4|webm|mov)$')

# 纯 UUID（无扩展名）— LLM 模型可能在回复中截断文件扩展名
_UUID_ONLY = re.compile(r'^[a-f0-9\-]{36}$')

# 扩展名回退查找顺序
_FALLBACK_EXTS = ("png", "jpg", "jpeg", "webp", "gif")

# 扩展名 -> MIME
_EXT_MIME = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "svg": "image/svg+xml",
    "mp3": "audio/mpeg",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "ogg": "video/ogg",
    "mov": "video/quicktime",
    "wav": "audio/wav"
}


@router.get("/{filename}")
async def serve_media(filename: str):
    """安全地提供媒体文件（支持无扩展名的 UUID 回退查找）"""
    # 优先精确匹配（带扩展名）
    matched = _SAFE_FILENAME.match(filename)
    if matched:
        filepath = MEDIA_DIR / filename
        filepath.exists() or (_ for _ in ()).throw(HTTPException(status_code=404, detail="File not found"))
        ext = filename.rsplit(".", 1)[-1]
        return FileResponse(
            filepath,
            media_type=_EXT_MIME.get(ext, "application/octet-stream"),
            headers={"Cache-Control": "public, max-age=31536000"},
        )

    # 回退：纯 UUID（LLM 模型可能在回复中截断文件扩展名）
    if _UUID_ONLY.match(filename):
        for ext in _FALLBACK_EXTS:
            candidate = MEDIA_DIR / f"{filename}.{ext}"
            if candidate.exists():
                return FileResponse(
                    candidate,
                    media_type=_EXT_MIME.get(ext, "application/octet-stream"),
                    headers={"Cache-Control": "public, max-age=31536000"},
                )

    raise HTTPException(status_code=400, detail="Invalid filename")


@router.post("/upload")
async def upload_media(file: UploadFile = File(...)):
    """上传媒体文件（支持图片等），返回文件 URL"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in _EXT_MIME:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
        
    MEDIA_DIR.mkdir(exist_ok=True)
    new_filename = f"{uuid.uuid4()}.{ext}"
    filepath = MEDIA_DIR / new_filename
    
    try:
        contents = await file.read()
        filepath.write_bytes(contents)
        logger.info(f"Uploaded file saved: {new_filename} ({len(contents)} bytes)")
    except Exception as e:
        logger.error(f"Error saving uploaded file: {e}")
        raise HTTPException(status_code=500, detail="Failed to save file")
        
    return {"url": f"/api/media/{new_filename}"}


@router.post("/batch-generate", response_model=BatchImageGenerateResponse)
async def batch_generate(
    request: BatchImageGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    批量图片生成 API
    
    使用指定智能体的配置（API key、模型）并行生成多张图片。
    支持 Gemini 和 xAI 供应商。
    
    - **agent_id**: 智能体 ID
    - **prompts**: 提示词列表（1-8 条）
    - **config**: 图片生成配置（可选）
    - **max_concurrent**: 最大并发数（1-8，默认 4）
    """
    # 获取智能体配置
    agent = await db.get(Agent, request.agent_id)
    agent or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Agent not found"))
    
    # 获取供应商配置
    provider = await db.get(LLMProvider, agent.provider_id)
    provider or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Provider not found"))
    
    provider_type = provider.provider_type.lower()
    handler = _BATCH_GENERATE_HANDLERS.get(provider_type)
    handler or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail=f"Batch image generation not supported for provider: {provider_type}")
    )

    return await handler(agent, provider, request)


# ---------------------------------------------------------------------------
# 批量生成供应商处理器映射表（避免 if-else 分支）
# ---------------------------------------------------------------------------

async def _batch_generate_gemini(agent: Agent, provider: LLMProvider, request: BatchImageGenerateRequest) -> BatchImageGenerateResponse:
    """Gemini 批量图片生成处理器"""
    cfg = request.config or BatchImageConfigRequest()
    batch_config = BatchImageConfig(
        aspect_ratio=cfg.aspect_ratio,
        image_size=cfg.image_size,
        output_format=cfg.output_format,
        google_search_enabled=cfg.google_search_enabled,
        google_image_search_enabled=cfg.google_image_search_enabled,
    )

    # 处理模型名称（移除 "gemini/" 前缀）
    model = agent.model
    model.startswith("gemini/") and (model := model[7:])

    logger.info(f"Batch generate [gemini]: agent={agent.name}, model={model}, prompts={len(request.prompts)}")

    result = await batch_generate_images(
        api_key=provider.api_key,
        model=model,
        prompts=request.prompts,
        config=batch_config,
        max_concurrent=request.max_concurrent,
    )

    return BatchImageGenerateResponse(
        success=result.success,
        total_prompts=result.total_prompts,
        completed=result.completed,
        failed=result.failed,
        results=[
            SingleImageResultResponse(
                prompt_index=r.prompt_index,
                prompt=r.prompt,
                success=r.success,
                image_url=r.image_url,
                text_response=r.text_response,
                input_tokens=r.input_tokens,
                output_tokens=r.output_tokens,
                error=r.error,
            )
            for r in result.results
        ],
    )


async def _batch_generate_xai(agent: Agent, provider: LLMProvider, request: BatchImageGenerateRequest) -> BatchImageGenerateResponse:
    """xAI 批量图片生成处理器"""
    # 从 agent 的 xai_image_config 中读取配置
    agent_img_cfg = (agent.xai_image_config or {}).get("image_config") or {}

    xai_config = XAIBatchImageConfig(
        aspect_ratio=agent_img_cfg.get("aspect_ratio", "1:1"),
        resolution=agent_img_cfg.get("resolution", "1k"),
        n=1,  # 批量模式每个 prompt 生成 1 张，多 prompt 并行
        response_format=agent_img_cfg.get("response_format", "b64_json"),
    )

    # 处理模型名称（移除 "xai/" 前缀）
    model = agent.model
    model.startswith("xai/") and (model := model[4:])

    logger.info(f"Batch generate [xai]: agent={agent.name}, model={model}, prompts={len(request.prompts)}")

    result = await batch_generate_xai_images(
        api_key=provider.api_key,
        model=model,
        prompts=request.prompts,
        config=xai_config,
        base_url=provider.base_url,
        max_concurrent=request.max_concurrent,
    )

    # 将 xAI 结果展平为统一的响应格式
    return BatchImageGenerateResponse(
        success=result.success,
        total_prompts=result.total_prompts,
        completed=result.completed,
        failed=result.failed,
        results=[
            SingleImageResultResponse(
                prompt_index=r.prompt_index,
                prompt=r.prompt,
                success=r.success,
                image_url=r.image_urls[0] if r.image_urls else None,
                text_response=None,
                input_tokens=0,
                output_tokens=0,
                error=r.error,
            )
            for r in result.results
        ],
    )


_BATCH_GENERATE_HANDLERS = {
    "gemini": _batch_generate_gemini,
    "xai": _batch_generate_xai,
}
