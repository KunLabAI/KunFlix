"""
图像生成 API 路由（同步接口）

- GET  /api/images/providers             —— 列出启用的图像供应商与图像类型模型
- GET  /api/images/model-capabilities/{provider_type} —— 指定供应商的能力（aspect/quality/batch_count）
- POST /api/images/generate              —— 同步生成图像并返回本地 URL 列表
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import LLMProvider, ToolConfig
from schemas import ImageGenerateRequest, ImageGenerateResponse
from auth import get_current_active_user_or_admin
from services.image_config_adapter import IMAGE_PROVIDER_CAPABILITIES, to_provider_config
from services.tool_manager.providers.image_gen import (
    _IMAGE_GENERATORS,
    _TOOL_GEN_PROVIDERS,
    _register_generated_image_assets,
)
from services.tool_manager.providers.image_edit import (
    _EDIT_HANDLERS,
    _EDIT_PARAM_EXTRACTORS,
    _resolve_image_url,
    _MULTI_IMAGE_MAX_DIM,
    _SINGLE_IMAGE_MAX_DIM,
)
from services.billing import (
    deduct_credits_atomic,
    check_balance_sufficient,
    InsufficientCreditsError,
    BalanceFrozenError,
)
from ratelimit import limiter, ENDPOINT_LIMITS
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/images", tags=["images"])

IMAGE_GEN_TOOL_NAME = "generate_image"

# 编辑类模式（edit / reference_images）使用相同的后端 handler，仅尺寸上限不同
_EDIT_MODES = {"edit", "reference_images"}


# ---------------------------------------------------------------------------
# 辅助：根据 mode 分派生成或编辑
# ---------------------------------------------------------------------------
async def _dispatch_image_generation(
    *,
    mode: str,
    provider_type: str,
    provider,
    model: str,
    prompt: str,
    reference_images,
    adapted: dict,
    n: int,
    user_id: str,
) -> list[str]:
    """按 mode 分派到 text-to-image 生成器或 edit handler。"""
    # text_to_image → SDK 生成器
    if mode not in _EDIT_MODES:
        generator = _IMAGE_GENERATORS.get(provider_type)
        generator or (_ for _ in ()).throw(
            HTTPException(status_code=400, detail=f"Unsupported image provider type: {provider_type}")
        )
        return await generator(
            api_key=provider.api_key,
            base_url=provider.base_url,
            model=model,
            prompt=prompt,
            config=adapted,
            n=n,
            user_id=user_id,
        )

    # edit / reference_images → _EDIT_HANDLERS
    handler = _EDIT_HANDLERS.get(provider_type)
    handler or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail=f"Image editing not supported for provider type: {provider_type}")
    )
    raw_urls = [ref.url for ref in (reference_images or []) if ref and ref.url]
    raw_urls or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail=f"Mode '{mode}' requires reference_images")
    )
    # 单图 vs 多图使用不同的压缩上限
    compress_dim = _MULTI_IMAGE_MAX_DIM if len(raw_urls) > 1 else _SINGLE_IMAGE_MAX_DIM
    resolved_urls = await asyncio.gather(
        *[_resolve_image_url(u, max_dimension=compress_dim) for u in raw_urls]
    )
    # 从适配后的配置提取供应商特定参数（resolution / image_size）
    adapted_img = (adapted.get("image_config") or {})
    extractor = _EDIT_PARAM_EXTRACTORS.get(provider_type, lambda c: {})
    extra = extractor(adapted_img)
    edited_url = await handler(
        api_key=provider.api_key,
        base_url=provider.base_url,
        model=model,
        image_urls=resolved_urls,
        prompt=prompt,
        aspect_ratio=adapted_img.get("aspect_ratio"),
        user_id=user_id,
        **extra,
    )
    return [edited_url] if edited_url else []


# ---------------------------------------------------------------------------
# 辅助：读取全局图像工具开关
# ---------------------------------------------------------------------------
async def _get_global_image_enabled(db: AsyncSession) -> bool:
    """读取 ToolConfig 中 generate_image 的 image_generation_enabled 开关。"""
    result = await db.execute(
        select(ToolConfig).where(ToolConfig.tool_name == IMAGE_GEN_TOOL_NAME)
    )
    tool_config = result.scalar_one_or_none()
    return bool(((tool_config.config if tool_config else {}) or {}).get("image_generation_enabled"))


# ---------------------------------------------------------------------------
# GET /api/images/providers —— 列出启用的图像供应商
# ---------------------------------------------------------------------------
@router.get("/providers")
async def list_image_providers(
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取可用的图像生成供应商及其模型。

    过滤条件：
      1. 全局 ToolConfig.generate_image.image_generation_enabled = True
      2. LLMProvider.is_active = True
      3. provider_type ∈ {xai, gemini, ark}
      4. model_metadata[model].model_type == 'image'
    """
    # 全局开关未启用 → 直接返回空列表（前端据此禁用下拉）
    is_enabled = await _get_global_image_enabled(db)

    result = await db.execute(select(LLMProvider).where(LLMProvider.is_active == True))
    providers = result.scalars().all()

    def _build_item(p: LLMProvider) -> dict | None:
        provider_type = (p.provider_type or "").lower()
        is_tool_gen = provider_type in _TOOL_GEN_PROVIDERS
        image_models = [
            {"name": model_name, "display_name": (meta or {}).get("display_name", model_name)}
            for model_name, meta in (p.model_metadata or {}).items()
            if (meta or {}).get("model_type") == "image"
        ]
        return {
            "id": p.id,
            "name": p.name,
            "provider_type": provider_type,
            "models": image_models,
        } if (is_tool_gen and image_models) else None

    items = [
        item
        for item in ((_build_item(p) for p in providers) if is_enabled else [])
        if item is not None
    ]

    return {"enabled": is_enabled, "providers": items}


# ---------------------------------------------------------------------------
# GET /api/images/model-capabilities/{provider_type} —— 供应商能力
# ---------------------------------------------------------------------------
@router.get("/model-capabilities/{provider_type}")
async def get_image_model_capabilities(
    provider_type: str,
    current_user=Depends(get_current_active_user_or_admin),
):
    """返回指定图像供应商的能力（宽高比 / 画质 / 输出格式 / 批量数）。"""
    caps = IMAGE_PROVIDER_CAPABILITIES.get((provider_type or "").lower())
    caps or (_ for _ in ()).throw(
        HTTPException(status_code=404, detail=f"Image provider {provider_type} not supported")
    )
    return caps


# ---------------------------------------------------------------------------
# POST /api/images/generate —— 同步图像生成
# ---------------------------------------------------------------------------
@router.post("/generate", response_model=ImageGenerateResponse)
@limiter.limit(ENDPOINT_LIMITS["image_generate"])
async def generate_images(
    request: Request,
    payload: ImageGenerateRequest,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """同步生成图像，生成完成后写入 Asset 表并完成扣费。"""
    entity_id = current_user.id

    # 全局开关检查
    (await _get_global_image_enabled(db)) or (_ for _ in ()).throw(
        HTTPException(status_code=403, detail="Image generation is disabled globally")
    )

    # 余额预检查
    try:
        balance_ok = await check_balance_sufficient(entity_id, 0, db)
        balance_ok or (_ for _ in ()).throw(
            HTTPException(status_code=402, detail="积分余额不足，请充值后继续使用")
        )
    except BalanceFrozenError:
        raise HTTPException(status_code=403, detail="账户资金已冻结，请联系管理员")

    # 查询 LLMProvider
    provider_result = await db.execute(select(LLMProvider).where(LLMProvider.id == payload.provider_id))
    provider = provider_result.scalar_one_or_none()
    provider or (_ for _ in ()).throw(HTTPException(status_code=404, detail="LLM Provider not found"))
    provider.is_active or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="Provider is inactive")
    )

    provider_type = (provider.provider_type or "").lower()

    # 校验模型在 model_metadata 中标记为 image
    model_meta = (provider.model_metadata or {}).get(payload.model) or {}
    (model_meta.get("model_type") == "image") or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail=f"Model {payload.model} is not an image model")
    )

    # 校验 mode 是否被该供应商支持
    caps = IMAGE_PROVIDER_CAPABILITIES.get(provider_type) or {}
    supported_modes = caps.get("supported_modes") or ["text_to_image"]
    (payload.mode in supported_modes) or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail=f"Mode '{payload.mode}' not supported by provider '{provider_type}'")
    )

    # 构建统一配置并适配为供应商配置
    params = payload.config.model_dump(exclude_none=True) if payload.config else {}
    n = int(params.pop("batch_count", 1) or 1)
    unified = {"image_generation_enabled": True, "image_config": params}
    adapted = to_provider_config(provider_type, unified) or {"image_config": {}}

    # 根据 mode 分派：text_to_image 走 SDK 生成器，edit/reference_images 走 _EDIT_HANDLERS
    try:
        image_urls: list[str] = await _dispatch_image_generation(
            mode=payload.mode,
            provider_type=provider_type,
            provider=provider,
            model=payload.model,
            prompt=payload.prompt,
            reference_images=payload.reference_images,
            adapted=adapted,
            n=n,
            user_id=entity_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Image generate API error: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Image generation failed: {e}")

    image_urls or (_ for _ in ()).throw(
        HTTPException(status_code=502, detail="No images were generated (possibly filtered by content moderation)")
    )

    # 注册 Asset
    await _register_generated_image_assets(image_urls, entity_id, db)

    # 计费：从 provider.model_costs[model].image_generation 读取单价，按张计费
    rate_map = (provider.model_costs or {}).get(payload.model, {}) or {}
    rate = float(rate_map.get("image_generation", 0) or 0)
    credit_cost = rate * len(image_urls)

    try:
        (credit_cost > 0) and await deduct_credits_atomic(
            user_id=entity_id,
            cost=credit_cost,
            session=db,
            metadata={
                "kind": "image_generation",
                "provider_id": provider.id,
                "model": payload.model,
                "count": len(image_urls),
                "rate": rate,
            },
            transaction_type="consumption",
        )
    except InsufficientCreditsError:
        raise HTTPException(status_code=402, detail="积分余额不足")

    await db.commit()

    logger.info(
        "Image generated: user=%s provider=%s model=%s count=%d cost=%.4f",
        entity_id, provider.id, payload.model, len(image_urls), credit_cost,
    )

    return ImageGenerateResponse(
        images=image_urls,
        prompt=payload.prompt,
        model=payload.model,
        provider_id=provider.id,
        provider_name=provider.name,
        credit_cost=credit_cost,
        created_at=datetime.now(timezone.utc),
    )
