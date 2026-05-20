"""\u540e\u53f0\u8def\u7531\uff1a\u8ba1\u8d39\u5b9a\u4ef7\u7ba1\u7406\uff08ModelPricing\uff09\u3002

- \u8def\u7531\u524d\u7f00\uff1a/api/admin/pricing
- \u9274\u6743\uff1arequire_admin\uff08\u540c\u3007\u3007\u3007\u3007 LLMProvider \u8def\u7531\uff09
- \u7f13\u5b58\u4e00\u81f4\u6027\uff1a\u6bcf\u6b21\u53d8\u66f4\u540c\u65f6\u8c03\u7528 invalidate_pricing_cache + publish_invalidate("model_pricing", key)\uff0c
  \u7531 Task 7 \u8d1f\u8d23\u8ba2\u9605\u540e\u6e05\u7406\u591a\u5b9e\u4f8b\u8fdb\u7a0b\u7f13\u5b58\u3002
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, delete

from database import get_db
from models import ModelPricing, LLMProvider, Admin
from schemas import (
    ModelPricingCreate,
    ModelPricingUpdate,
    ModelPricingResponse,
    ModelPricingBulkApply,
)
from auth import require_admin
from cache.pubsub import invalidate as publish_invalidate
from services import audit
from services.billing import invalidate_pricing_cache, BILLING_DIMENSIONS, VIDEO_BILLING_DIMENSIONS, MUSIC_BILLING_DIMENSIONS

router = APIRouter(
    prefix="/api/admin/pricing",
    tags=["admin", "pricing"],
    responses={404: {"description": "Not found"}},
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
async def _provider_lookup(db: AsyncSession, provider_ids: List[str]) -> dict:
    """\u4e00\u6279\u53d6\u4f9b\u5e94\u5546\u540d\u79f0 + model_costs\uff0c\u4f9b\u54cd\u5e94\u62fc\u88c5\u3002"""
    if not provider_ids:
        return {}
    rs = await db.execute(
        select(LLMProvider.id, LLMProvider.name, LLMProvider.model_costs).where(
            LLMProvider.id.in_(provider_ids)
        )
    )
    return {r.id: {"name": r.name, "model_costs": r.model_costs or {}} for r in rs.all()}


def _to_response(row: ModelPricing, provider_meta: dict) -> ModelPricingResponse:
    meta = provider_meta.get(row.provider_id) or {}
    api_costs_full = meta.get("model_costs") or {}
    api_costs_for_model = api_costs_full.get(row.model) or {}
    return ModelPricingResponse(
        id=row.id,
        provider_id=row.provider_id,
        model=row.model,
        dimensions=dict(row.dimensions or {}),
        is_active=bool(row.is_active),
        notes=row.notes,
        provider_name=meta.get("name"),
        api_costs={k: float(v or 0) for k, v in api_costs_for_model.items() if isinstance(v, (int, float))},
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def _invalidate(provider_id: Optional[str], model: Optional[str]) -> None:
    """\u540c\u65f6\u6e05\u672c\u8fdb\u7a0b\u7f13\u5b58\u4e0e\u5e7f\u64ad\u5176\u4ed6\u5b9e\u4f8b\u3002"""
    invalidate_pricing_cache(provider_id, model)
    key = f"{provider_id or '*'}::{model or '*'}"
    await publish_invalidate("model_pricing", key)


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------
@router.get("", response_model=List[ModelPricingResponse])
async def list_pricings(
    provider_id: Optional[str] = Query(default=None),
    model: Optional[str] = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ModelPricing)
    provider_id and (stmt := stmt.where(ModelPricing.provider_id == provider_id))
    model and (stmt := stmt.where(ModelPricing.model == model))
    is_active is None or (stmt := stmt.where(ModelPricing.is_active == bool(is_active)))
    stmt = stmt.order_by(ModelPricing.provider_id, ModelPricing.model).offset(skip).limit(limit)

    rows = (await db.execute(stmt)).scalars().all()
    provider_meta = await _provider_lookup(db, list({r.provider_id for r in rows}))
    return [_to_response(r, provider_meta) for r in rows]


@router.get("/{pricing_id}", response_model=ModelPricingResponse)
async def read_pricing(
    pricing_id: str,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(select(ModelPricing).where(ModelPricing.id == pricing_id))).scalar_one_or_none()
    row or (_ for _ in ()).throw(HTTPException(status_code=404, detail="ModelPricing not found"))
    provider_meta = await _provider_lookup(db, [row.provider_id])
    return _to_response(row, provider_meta)


@router.post("", response_model=ModelPricingResponse)
async def create_pricing(
    payload: ModelPricingCreate,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # \u4f9b\u5e94\u5546\u5408\u6cd5\u6027
    provider = (await db.execute(select(LLMProvider).where(LLMProvider.id == payload.provider_id))).scalar_one_or_none()
    provider or (_ for _ in ()).throw(HTTPException(status_code=400, detail="Provider not found"))

    # \u4e0d\u5141\u8bb8\u91cd\u590d (provider_id, model)
    dup = (await db.execute(
        select(func.count(ModelPricing.id)).where(
            ModelPricing.provider_id == payload.provider_id,
            ModelPricing.model == payload.model,
        )
    )).scalar() or 0
    dup and (_ for _ in ()).throw(HTTPException(status_code=409, detail="Pricing for (provider, model) already exists"))

    row = ModelPricing(
        provider_id=payload.provider_id,
        model=payload.model,
        dimensions=payload.dimensions.model_dump(),
        is_active=payload.is_active,
        notes=payload.notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    await _invalidate(row.provider_id, row.model)
    audit.record(
        action="model_pricing.create", actor=current_admin,
        resource_type="model_pricing", resource_id=row.id,
        detail={"provider_id": row.provider_id, "model": row.model, "dimensions": row.dimensions},
        request=request,
    )
    provider_meta = await _provider_lookup(db, [row.provider_id])
    return _to_response(row, provider_meta)


@router.put("/{pricing_id}", response_model=ModelPricingResponse)
async def update_pricing(
    pricing_id: str,
    payload: ModelPricingUpdate,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(select(ModelPricing).where(ModelPricing.id == pricing_id))).scalar_one_or_none()
    row or (_ for _ in ()).throw(HTTPException(status_code=404, detail="ModelPricing not found"))

    update_data = payload.model_dump(exclude_unset=True)
    # dimensions \u662f\u5d4c\u5957 BaseModel\uff0c\u9700\u4ee5 dict \u5199\u5165
    if "dimensions" in update_data and update_data["dimensions"] is not None:
        update_data["dimensions"] = payload.dimensions.model_dump()

    for k, v in update_data.items():
        setattr(row, k, v)

    await db.commit()
    await db.refresh(row)

    await _invalidate(row.provider_id, row.model)
    audit.record(
        action="model_pricing.update", actor=current_admin,
        resource_type="model_pricing", resource_id=row.id,
        detail={"changed_fields": sorted(update_data.keys()), "values": update_data},
        request=request,
    )
    provider_meta = await _provider_lookup(db, [row.provider_id])
    return _to_response(row, provider_meta)


@router.delete("/{pricing_id}")
async def delete_pricing(
    pricing_id: str,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(select(ModelPricing).where(ModelPricing.id == pricing_id))).scalar_one_or_none()
    row or (_ for _ in ()).throw(HTTPException(status_code=404, detail="ModelPricing not found"))

    snapshot = {
        "provider_id": row.provider_id,
        "model": row.model,
        "dimensions": dict(row.dimensions or {}),
    }
    provider_id, model = row.provider_id, row.model
    await db.delete(row)
    await db.commit()

    await _invalidate(provider_id, model)
    audit.record(
        action="model_pricing.delete", actor=current_admin,
        resource_type="model_pricing", resource_id=pricing_id,
        detail=snapshot,
        request=request,
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Bulk apply: api_costs * multiplier -> dimensions
# ---------------------------------------------------------------------------
# \u8fdb\u4ef7\u4ee3\u7801 -> \u5356\u4ef7\u7ef4\u5ea6\u540d\u6620\u5c04\uff08\u5141\u8bb8\u4e00\u81f4\u540d\u79f0\u900f\u4f20\uff09
_KNOWN_DIMS = set(BILLING_DIMENSIONS) | set(VIDEO_BILLING_DIMENSIONS) | set(MUSIC_BILLING_DIMENSIONS)


@router.post("/bulk-apply", response_model=List[ModelPricingResponse])
async def bulk_apply(
    payload: ModelPricingBulkApply,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """\u6309\u500d\u7387\u4e00\u952e\u5e94\u7528\uff1a\u5c06\u4f9b\u5e94\u5546 model_costs[model] \u4e2d\u8fdb\u4ef7\u7ef4\u5ea6 * multiplier \u5199\u5165 ModelPricing.dimensions\u3002

    - \u5b58\u5728\u5219\u66f4\u65b0\uff0c\u4e0d\u5b58\u5728\u5219\u65b0\u5efa\u3002
    - only_models 不为空时，仅作用于该子集。
    """
    provider = (await db.execute(select(LLMProvider).where(LLMProvider.id == payload.provider_id))).scalar_one_or_none()
    provider or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Provider not found"))

    api_costs = provider.model_costs or {}
    api_costs and isinstance(api_costs, dict) or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="Provider has no model_costs configured")
    )

    target_models = list((payload.only_models or list(api_costs.keys())))
    target_models = [m for m in target_models if m in api_costs]

    # \u5df2\u5b58\u5728\u7684 ModelPricing \u884c\u67e5\u8be2
    existing_rows = (await db.execute(
        select(ModelPricing).where(
            ModelPricing.provider_id == payload.provider_id,
            ModelPricing.model.in_(target_models),
        )
    )).scalars().all()
    existing_map = {r.model: r for r in existing_rows}

    multiplier = float(payload.markup_multiplier)
    written: List[ModelPricing] = []
    for model_name in target_models:
        api_dims = api_costs.get(model_name) or {}
        if not isinstance(api_dims, dict):
            continue
        new_dims = {}
        for k, v in api_dims.items():
            k in _KNOWN_DIMS and isinstance(v, (int, float)) and (new_dims.__setitem__(k, float(v) * multiplier))
        if not new_dims:
            continue
        existing = existing_map.get(model_name)
        if existing:
            existing.dimensions = new_dims
            existing.is_active = True
            written.append(existing)
        else:
            row = ModelPricing(
                provider_id=payload.provider_id,
                model=model_name,
                dimensions=new_dims,
                is_active=True,
                notes=f"bulk-apply x{multiplier:g}",
            )
            db.add(row)
            written.append(row)

    await db.commit()
    for r in written:
        await db.refresh(r)
        invalidate_pricing_cache(r.provider_id, r.model)
    await publish_invalidate("model_pricing", f"{payload.provider_id}::*")

    audit.record(
        action="model_pricing.bulk_apply", actor=current_admin,
        resource_type="model_pricing", resource_id=payload.provider_id,
        detail={
            "provider_id": payload.provider_id,
            "multiplier": multiplier,
            "models": [r.model for r in written],
        },
        request=request,
    )
    provider_meta = await _provider_lookup(db, [payload.provider_id])
    return [_to_response(r, provider_meta) for r in written]
