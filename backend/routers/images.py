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
from services.image_config_adapter import (
    IMAGE_PROVIDER_CAPABILITIES,
    IMAGE_MODEL_CAPABILITIES,
    to_provider_config,
)
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


def _inject_sequential_refs(adapted: dict, ref_urls: list[str]) -> None:
    """将参考图 URL 注入 adapted 配置（组图模式下的参考图输入）。"""
    img_cfg = adapted.setdefault("image_config", {})
    img_cfg["reference_images"] = ref_urls


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
    """按 mode 分派到 text-to-image / sequential / edit handler。

    返回：(image_urls, usage_dict)，其中 usage_dict = {"input_tokens": int, "output_tokens": int}。
    edit 路径不产生 token usage，返回零值。
    """
    # sequential → 组图生成（可带参考图，强制 sequential=True）
    # 将 sequential 模式当作 n > 1 的 text_to_image 处理（强制 sequential）
    is_sequential = (mode == "sequential")

    # text_to_image / sequential → SDK 生成器
    if mode not in _EDIT_MODES:
        generator = _IMAGE_GENERATORS.get(provider_type)
        generator or (_ for _ in ()).throw(
            HTTPException(status_code=400, detail=f"Unsupported image provider type: {provider_type}")
        )
        # sequential 模式：强制 n >= 2 以触发组图逻辑
        effective_n = max(2, n) if is_sequential else n
        # 如果有参考图，注入到 adapted 配置中（组图模式支持参考图输入）
        is_sequential and reference_images and _inject_sequential_refs(
            adapted, [ref.url for ref in reference_images if ref and ref.url]
        )
        return await generator(
            api_key=provider.api_key,
            base_url=provider.base_url,
            model=model,
            prompt=prompt,
            config=adapted,
            n=effective_n,
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
# GET /api/images/model-capabilities/{provider_type}/{model} —— 模型级能力
# 在 provider 级能力上叠加 IMAGE_MODEL_CAPABILITIES 中的模型差异（image_sizes / 14 比例 / 参考图上限）
# ---------------------------------------------------------------------------
@router.get("/model-capabilities/{provider_type}/{model:path}")
async def get_image_model_capabilities_by_model(
    provider_type: str,
    model: str,
    current_user=Depends(get_current_active_user_or_admin),
):
    """返回 provider 级能力 + 模型级差异（如 Flash 支持 512、Pro 不支持等）。"""
    provider_caps = IMAGE_PROVIDER_CAPABILITIES.get((provider_type or "").lower())
    provider_caps or (_ for _ in ()).throw(
        HTTPException(status_code=404, detail=f"Image provider {provider_type} not supported")
    )
    model_caps = IMAGE_MODEL_CAPABILITIES.get(model) or {}
    # 模型级覆盖 provider 级（dict 合并语义：模型独有 image_sizes / max_reference_images / supports_thinking 等会附加）
    return {**provider_caps, **model_caps}


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
# POST /api/images/generate/stream —— SSE 流式生图（通用，所有供应商 + 心跳保活）
# ---------------------------------------------------------------------------
_HEARTBEAT_INTERVAL = 15.0  # 心跳间隔（秒），防止中间代理因空闲超时断连


@router.post("/generate/stream")
@limiter.limit(ENDPOINT_LIMITS["image_generate"])
async def generate_images_stream(
    request: Request,
    payload: ImageGenerateRequest,
    current_user=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """流式生图 SSE 端点（带心跳保活）。

    事件 schema (data: <json>):
      {"type":"heartbeat"}
      {"type":"final_image",   "index":0, "url":"/api/media/xxx"}
      {"type":"error",         "message":"..."}
      {"type":"done",          "images":["/api/media/..."], "credit_cost":0.05, ...}
    """
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

    # 校验 mode
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

    return StreamingResponse(
        _sse_stream_with_heartbeat(
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
            db=db,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse_format(event: dict) -> bytes:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode("utf-8")


async def _sse_stream_with_heartbeat(
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
    mask_url: Optional[str],
    db: AsyncSession,
):
    """通用 SSE 流式图像生成：复用 _dispatch_image_generation + 心跳保活。"""
    # 创建生成任务
    gen_task = asyncio.create_task(
        _dispatch_image_generation(
            mode=mode,
            provider_type=provider_type,
            provider=provider,
            model=model,
            prompt=prompt,
            reference_images=reference_images,
            adapted=adapted,
            n=n,
            user_id=user_id,
            mask_url=mask_url,
        )
    )

    # 心跳等待循环：每 15s 发送一次心跳事件保持连接活跃
    while not gen_task.done():
        done, _ = await asyncio.wait({gen_task}, timeout=_HEARTBEAT_INTERVAL)
        (not done) and (yield _sse_format({"type": "heartbeat"}))

    # 检查任务结果
    try:
        image_urls, usage = gen_task.result()
    except Exception as e:
        logger.error("image stream error: %s", e, exc_info=True)
        transient = is_transient_network_error(e)
        yield _sse_format({"type": "error", "message": (
            friendly_network_error_message(e, service="图像生成") if transient
            else f"Image generation failed: {e}"
        )})
        return

    # 发送每张图片的 final_image 事件
    for idx, url in enumerate(image_urls):
        yield _sse_format({"type": "final_image", "index": idx, "url": url})

    # 资产注册 + 计费
    credit_cost = 0.0
    _billing_underpaid = False
    _remaining_credits: Optional[float] = None
    try:
        await _register_generated_image_assets(image_urls, user_id, db)
        from services.billing import load_pricing, BILLING_DIMENSIONS
        rate_map = await load_pricing(provider.id, model, db)
        input_tokens = int(usage.get("input_tokens") or 0)
        output_tokens = int(usage.get("output_tokens") or 0)
        rate_input = float(rate_map.get("input", 0) or 0)
        rate_image_output = float(rate_map.get("image_output", 0) or 0)
        rate_per_image = float(rate_map.get("image_generation", 0) or 0)
        credit_cost = (
            rate_input * input_tokens / BILLING_DIMENSIONS["input"]
            + rate_image_output * output_tokens / BILLING_DIMENSIONS["image_output"]
            + rate_per_image * len(image_urls)
        )
        tx = (credit_cost > 0) and await deduct_credits_atomic(
            user_id=user_id,
            cost=credit_cost,
            session=db,
            metadata={
                "kind": "image_generation",
                "provider_id": provider.id,
                "model": model,
                "count": len(image_urls),
                "streaming": True,
            },
            transaction_type="consumption",
        )
        tx and hasattr(tx, 'balance_after') and (_remaining_credits := float(tx.balance_after))
    except InsufficientCreditsError:
        _billing_underpaid = True
        _remaining_credits = 0.0
    except Exception as e:
        logger.error("image stream finalize error: %s", e, exc_info=True)
        yield _sse_format({"type": "error", "message": f"Finalize failed: {e}"})
        return

    await db.commit()

    yield _sse_format({
        "type": "done",
        "images": image_urls,
        "prompt": prompt,
        "model": model,
        "provider_id": provider.id,
        "credit_cost": credit_cost,
        "billing_underpaid": _billing_underpaid,
        "remaining_credits": _remaining_credits,
    })
