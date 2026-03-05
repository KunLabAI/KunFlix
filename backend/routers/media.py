"""媒体文件服务路由"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from pathlib import Path
import re
import logging

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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/media", tags=["media"])

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"

# 安全文件名：UUID + 已知媒体扩展名（图片 + 视频）
_SAFE_FILENAME = re.compile(r'^[a-f0-9\-]{36}\.(png|jpg|jpeg|webp|gif|mp4|webm|mov)$')

# 扩展名 -> MIME
_EXT_MIME = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "mov": "video/quicktime",
}


@router.get("/{filename}")
async def serve_media(filename: str):
    """安全地提供媒体文件"""
    matched = _SAFE_FILENAME.match(filename)
    if not matched:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = MEDIA_DIR / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")

    ext = filename.rsplit(".", 1)[-1]
    return FileResponse(
        filepath,
        media_type=_EXT_MIME.get(ext, "application/octet-stream"),
        headers={"Cache-Control": "public, max-age=31536000"},
    )


@router.post("/batch-generate", response_model=BatchImageGenerateResponse)
async def batch_generate(
    request: BatchImageGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    批量图片生成 API
    
    使用指定智能体的配置（API key、模型）并行生成多张图片。
    
    - **agent_id**: 智能体 ID（需要是 Gemini 供应商且开启图片生成）
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
    
    # 验证供应商类型
    (provider.provider_type.lower() == "gemini") or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="Batch image generation only supports Gemini provider")
    )
    
    # 构建配置
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
    
    logger.info(f"Batch generate: agent={agent.name}, model={model}, prompts={len(request.prompts)}")
    
    # 调用批量生成服务
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
