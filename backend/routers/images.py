"""
图像生成 API 路由（同步接口）

- GET  /api/images/providers             —— 列出启用的图像供应商与图像类型模型
- GET  /api/images/model-capabilities/{provider_type} —— 指定供应商的能力（aspect/quality/batch_count）
- POST /api/images/generate              —— 同步生成图像并返回本地 URL 列表
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
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
    require_positive_balance,
    InsufficientCreditsError,
    BalanceFrozenError,
)
from errors import BizError
from services._retry_utils import is_transient_network_error, friendly_network_error_message
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
    mask_url: Optional[str] = None,
) -> tuple[list[str], dict]:
    """按 mode 分派到 text-to-image 生成器或 edit handler。

    返回：(image_urls, usage_dict)，其中 usage_dict = {"input_tokens": int, "output_tokens": int}。
    edit 路径不产生 token usage，返回零值。
    """
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
    # 蒙版也可能是 /api/media/... 本地 URL，同样走一轮解析；为避免损坏透明通道，蒙版不压缩（max_dimension=0）。
    resolved_mask = await _resolve_image_url(mask_url, max_dimension=0) if mask_url else None
    # 从适配后的配置提取供应商特定参数（resolution / image_size）
    adapted_img = (adapted.get("image_config") or {})
    extractor = _EDIT_PARAM_EXTRACTORS.get(provider_type, lambda c: {})
    extra = extractor(adapted_img)
    # 仅在取到 mask 时透传（避免为不支持蒙版的 handler 注入多余关键字）
    resolved_mask and extra.update(mask_url=resolved_mask)

    # edit / reference_images 模式下，e个 handler 每次调用仅返回一张图；
    # 若 batch_count > 1 则并行发起 n 次调用合并结果。
    batch = max(1, int(n or 1))
    edited_urls = await asyncio.gather(
        *[
            handler(
                api_key=provider.api_key,
                base_url=provider.base_url,
                model=model,
                image_urls=resolved_urls,
                prompt=prompt,
                aspect_ratio=adapted_img.get("aspect_ratio"),
                user_id=user_id,
                **extra,
            )
            for _ in range(batch)
        ],
        return_exceptions=True,
    )
    return [u for u in edited_urls if isinstance(u, str) and u], {"input_tokens": 0, "output_tokens": 0}


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

    # 余额预检查（严格 >0）+ lazy 触发月度重置
    from services.credit_reset import maybe_reset_monthly_credits
    await maybe_reset_monthly_credits(entity_id, db)
    try:
        await require_positive_balance(entity_id, db)
    except InsufficientCreditsError:
        raise BizError.insufficient_credits()
    except BalanceFrozenError:
        raise BizError.balance_frozen(user_id=entity_id)

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
        image_urls, usage = await _dispatch_image_generation(
            mode=payload.mode,
            provider_type=provider_type,
            provider=provider,
            model=payload.model,
            prompt=payload.prompt,
            reference_images=payload.reference_images,
            adapted=adapted,
            n=n,
            user_id=entity_id,
            mask_url=payload.mask_url,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Image generate API error: %s", e, exc_info=True)
        # 瞬时网络错误（Gemini 响应中断等）→ 503 + 友好提示；其余保持 502
        transient = is_transient_network_error(e)
        raise HTTPException(
            status_code=503 if transient else 502,
            detail=friendly_network_error_message(e, service="图像生成") if transient
                   else f"Image generation failed: {e}",
        )

    image_urls or (_ for _ in ()).throw(
        HTTPException(status_code=502, detail="No images were generated (possibly filtered by content moderation)")
    )

    # 注册 Asset
    await _register_generated_image_assets(image_urls, entity_id, db)

    # 计费：同时支持 token 计费（input/image_output 按 1M token）与按张计费（image_generation）
    # 用户在 ModelPricing 中配了哪个维度就走哪个，避免维度 key 不匹配导致 0 扣费
    from services.billing import load_pricing, BILLING_DIMENSIONS
    rate_map = await load_pricing(provider.id, payload.model, db)
    input_tokens = int(usage.get("input_tokens") or 0)
    output_tokens = int(usage.get("output_tokens") or 0)
    rate_input        = float(rate_map.get("input", 0) or 0)
    rate_image_output = float(rate_map.get("image_output", 0) or 0)
    rate_per_image    = float(rate_map.get("image_generation", 0) or 0)
    credit_cost = (
        rate_input        * input_tokens  / BILLING_DIMENSIONS["input"]
        + rate_image_output * output_tokens / BILLING_DIMENSIONS["image_output"]
        + rate_per_image    * len(image_urls)
    )

    _billing_underpaid = False  # 本次扣费是否不足被兜底扣到 0
    _remaining_credits: Optional[float] = None  # 本次扣费后用户余额
    try:
        tx = (credit_cost > 0) and await deduct_credits_atomic(
            user_id=entity_id,
            cost=credit_cost,
            session=db,
            metadata={
                "kind": "image_generation",
                "provider_id": provider.id,
                "model": payload.model,
                "count": len(image_urls),
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "rates": {
                    "input": rate_input,
                    "image_output": rate_image_output,
                    "image_generation": rate_per_image,
                },
            },
            transaction_type="consumption",
        )
        # 同步最新余额到响应，前端即时刷新 user.credits
        tx and hasattr(tx, 'balance_after') and (_remaining_credits := float(tx.balance_after))
    except InsufficientCreditsError:
        # 图像已生成、已注册资产；deduct_credits_atomic 已把余额兜底扣到 0。
        # 为了让用户拿到已生成的图像，不再抛 402，仅设置 billing_underpaid 标志由响应传递给前端。
        _billing_underpaid = True
        _remaining_credits = 0.0
        logger.warning(
            "Image generation underpaid: user=...%s model=%s, balance drained to 0",
            entity_id[-8:], payload.model,
        )

    await db.commit()

    logger.info(
        "Image generated: user=...%s model=%s count=%d",
        entity_id[-8:], payload.model, len(image_urls),
    )

    return ImageGenerateResponse(
        images=image_urls,
        prompt=payload.prompt,
        model=payload.model,
        provider_id=provider.id,
        provider_name=provider.name,
        credit_cost=credit_cost,
        created_at=datetime.now(timezone.utc),
        billing_underpaid=_billing_underpaid,
        remaining_credits=_remaining_credits,
    )


# ---------------------------------------------------------------------------
# POST /api/images/generate/stream —— SSE 流式生图（OpenRouter gpt-image-* 专享，其他供应商降级为单帧）
# ---------------------------------------------------------------------------
@router.post("/generate/stream")
@limiter.limit(ENDPOINT_LIMITS["image_generate"])
async def generate_images_stream(
    request: Request,
    payload: ImageGenerateRequest,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """流式生图 SSE 端点。

    事件 schema (data: <json>):
      {"type":"partial_image", "index":0, "url":"/api/media/xxx"}
      {"type":"final_image",   "index":0, "url":"/api/media/xxx", "revised_prompt":"..."}
      {"type":"error",         "message":"..."}
      {"type":"done",          "images":["/api/media/..."], "credit_cost":0.05}

    限制：仅 mode=text_to_image；edit/reference_images 请使用同步 /generate 端点。
    """
    payload.mode == "text_to_image" or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="Streaming only supports mode='text_to_image'")
    )

    entity_id = current_user.id
    (await _get_global_image_enabled(db)) or (_ for _ in ()).throw(
        HTTPException(status_code=403, detail="Image generation is disabled globally")
    )

    from services.credit_reset import maybe_reset_monthly_credits
    await maybe_reset_monthly_credits(entity_id, db)
    try:
        await require_positive_balance(entity_id, db)
    except InsufficientCreditsError:
        raise BizError.insufficient_credits()
    except BalanceFrozenError:
        raise BizError.balance_frozen(user_id=entity_id)

    provider_result = await db.execute(select(LLMProvider).where(LLMProvider.id == payload.provider_id))
    provider = provider_result.scalar_one_or_none()
    provider or (_ for _ in ()).throw(HTTPException(status_code=404, detail="LLM Provider not found"))
    provider.is_active or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="Provider is inactive")
    )

    provider_type = (provider.provider_type or "").lower()
    model_meta = (provider.model_metadata or {}).get(payload.model) or {}
    (model_meta.get("model_type") == "image") or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail=f"Model {payload.model} is not an image model")
    )

    # 适配统一配置 → OpenRouter image_config
    params = payload.config.model_dump(exclude_none=True) if payload.config else {}
    n = int(params.pop("batch_count", 1) or 1)
    unified = {"image_generation_enabled": True, "image_config": params}
    adapted = to_provider_config(provider_type, unified) or {"image_config": {}}
    img_cfg = adapted.get("image_config") or {}

    rate = float(((provider.model_costs or {}).get(payload.model, {}) or {}).get("image_generation", 0) or 0)

    return StreamingResponse(
        _sse_stream_image_events(
            provider=provider,
            model=payload.model,
            prompt=payload.prompt,
            img_cfg=img_cfg,
            n=n,
            user_id=entity_id,
            rate=rate,
            db=db,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse_format(event: dict) -> bytes:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode("utf-8")


async def _sse_stream_image_events(
    *,
    provider,
    model: str,
    prompt: str,
    img_cfg: dict,
    n: int,
    user_id: str,
    rate: float,
    db: AsyncSession,
):
    """包装 stream_generate_openrouter_images，流完后同事务资产注册 + 扣费。"""
    from services.openrouter_image_gen import stream_generate_openrouter_images

    final_urls: list[str] = []
    try:
        async for evt in stream_generate_openrouter_images(
            api_key=provider.api_key,
            base_url=provider.base_url,
            model=model,
            prompt=prompt,
            aspect_ratio=img_cfg.get("aspect_ratio"),
            quality=img_cfg.get("quality"),
            output_format=img_cfg.get("output_format"),
            output_compression=img_cfg.get("output_compression"),
            background=img_cfg.get("background"),
            moderation=img_cfg.get("moderation"),
            n=n,
            partial_images=2,
            user_id=user_id,
        ):
            evt.get("type") == "final_image" and evt.get("url") and final_urls.append(evt["url"])
            # 'done' 事件交由后续联合资产注册后重新发送
            evt.get("type") != "done" and (yield _sse_format(evt))
    except Exception as e:
        logger.error("image stream error: %s", e, exc_info=True)
        yield _sse_format({"type": "error", "message": f"Image streaming failed: {e}"})
        return

    # 资产注册 + 计费
    credit_cost = 0.0
    if final_urls:
        try:
            await _register_generated_image_assets(final_urls, user_id, db)
            credit_cost = rate * len(final_urls)
            (credit_cost > 0) and await deduct_credits_atomic(
                user_id=user_id,
                cost=credit_cost,
                session=db,
                metadata={
                    "kind": "image_generation",
                    "provider_id": provider.id,
                    "model": model,
                    "count": len(final_urls),
                    "rate": rate,
                    "streaming": True,
                },
                transaction_type="consumption",
            )
            await db.commit()
        except InsufficientCreditsError:
            yield _sse_format({"type": "error", "message": "Insufficient credits"})
            return
        except Exception as e:
            logger.error("image stream finalize error: %s", e, exc_info=True)
            yield _sse_format({"type": "error", "message": f"Finalize failed: {e}"})
            return

    yield _sse_format({
        "type": "done",
        "images": final_urls,
        "credit_cost": credit_cost,
        "model": model,
        "provider_id": provider.id,
    })
