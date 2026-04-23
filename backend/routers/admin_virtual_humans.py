"""
管理员虚拟人像管理路由 — 火山方舟预制虚拟人像 CRUD
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from auth import require_admin
from database import get_db
from models import Admin, VirtualHumanPreset
from schemas import (
    VirtualHumanPresetCreate,
    VirtualHumanPresetUpdate,
    VirtualHumanPresetResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/admin/virtual-human-presets",
    tags=["admin-virtual-humans"],
    responses={404: {"description": "Not found"}},
)


# ---------------------------------------------------------------------------
# LIST
# ---------------------------------------------------------------------------
@router.get("", response_model=list[VirtualHumanPresetResponse])
async def list_virtual_human_presets(
    gender: Optional[str] = None,
    style: Optional[str] = None,
    is_active: Optional[bool] = None,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """列出所有虚拟人像预制条目，支持筛选。"""
    query = select(VirtualHumanPreset).order_by(
        VirtualHumanPreset.sort_order.asc(),
        VirtualHumanPreset.created_at.desc(),
    )

    query = query.where(VirtualHumanPreset.gender == gender) if gender else query
    query = query.where(VirtualHumanPreset.style == style) if style else query
    query = query.where(VirtualHumanPreset.is_active == is_active) if is_active is not None else query

    result = await db.execute(query)
    return result.scalars().all()


# ---------------------------------------------------------------------------
# CREATE
# ---------------------------------------------------------------------------
@router.post("", response_model=VirtualHumanPresetResponse, status_code=201)
async def create_virtual_human_preset(
    request: Request,
    body: VirtualHumanPresetCreate,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """新增虚拟人像预制条目。"""
    raw = await request.body()
    logger.info("[VH-CREATE] raw body: %s", raw[:500])
    logger.info("[VH-CREATE] parsed body: %s", body.model_dump())
    # 校验 asset_id 唯一性
    existing = await db.execute(
        select(VirtualHumanPreset).where(VirtualHumanPreset.asset_id == body.asset_id)
    )
    existing.scalar_one_or_none() and (_ for _ in ()).throw(
        HTTPException(status_code=400, detail=f"asset_id '{body.asset_id}' already exists")
    )

    preset = VirtualHumanPreset(**body.model_dump())
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    return preset


# ---------------------------------------------------------------------------
# UPDATE
# ---------------------------------------------------------------------------
@router.put("/{preset_id}", response_model=VirtualHumanPresetResponse)
async def update_virtual_human_preset(
    preset_id: str,
    body: VirtualHumanPresetUpdate,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """更新虚拟人像预制条目。"""
    result = await db.execute(
        select(VirtualHumanPreset).where(VirtualHumanPreset.id == preset_id)
    )
    preset = result.scalar_one_or_none()
    preset or (_ for _ in ()).throw(
        HTTPException(status_code=404, detail="Preset not found")
    )

    update_data = body.model_dump(exclude_unset=True)

    # 若修改了 asset_id，检查唯一性
    new_asset_id = update_data.get("asset_id")
    if new_asset_id and new_asset_id != preset.asset_id:
        dup = await db.execute(
            select(VirtualHumanPreset).where(VirtualHumanPreset.asset_id == new_asset_id)
        )
        dup.scalar_one_or_none() and (_ for _ in ()).throw(
            HTTPException(status_code=400, detail=f"asset_id '{new_asset_id}' already exists")
        )

    for key, value in update_data.items():
        setattr(preset, key, value)

    await db.commit()
    await db.refresh(preset)
    return preset


# ---------------------------------------------------------------------------
# DELETE
# ---------------------------------------------------------------------------
@router.delete("/{preset_id}")
async def delete_virtual_human_preset(
    preset_id: str,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """删除虚拟人像预制条目。"""
    result = await db.execute(
        select(VirtualHumanPreset).where(VirtualHumanPreset.id == preset_id)
    )
    preset = result.scalar_one_or_none()
    preset or (_ for _ in ()).throw(
        HTTPException(status_code=404, detail="Preset not found")
    )

    await db.delete(preset)
    await db.commit()
    return {"message": "Preset deleted successfully"}
