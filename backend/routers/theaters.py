from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from database import get_db
from auth import get_current_active_user
from models import User
from services.theater import TheaterService
from schemas import (
    TheaterCreate, TheaterUpdate, TheaterSaveRequest,
    TheaterResponse, TheaterDetailResponse, TheaterListResponse,
)

router = APIRouter(
    prefix="/api/theaters",
    tags=["theaters"],
)


@router.post("", response_model=TheaterResponse)
async def create_theater(
    data: TheaterCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """创建新剧场"""
    service = TheaterService(db)
    return await service.create_theater(current_user.id, data)


@router.get("", response_model=TheaterListResponse)
async def list_theaters(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """列出当前用户的剧场"""
    service = TheaterService(db)
    return await service.list_user_theaters(current_user.id, page, page_size, status)


@router.get("/{theater_id}", response_model=TheaterDetailResponse)
async def get_theater(
    theater_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """获取剧场详情（含节点和边）"""
    service = TheaterService(db)
    detail = await service.get_theater_detail(theater_id, current_user.id)
    return TheaterDetailResponse.model_validate({
        **TheaterResponse.model_validate(detail["theater"]).model_dump(),
        "nodes": detail["nodes"],
        "edges": detail["edges"],
    })


@router.put("/{theater_id}", response_model=TheaterResponse)
async def update_theater(
    theater_id: str,
    data: TheaterUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """更新剧场元信息"""
    service = TheaterService(db)
    return await service.update_theater(theater_id, current_user.id, data)


@router.delete("/{theater_id}")
async def delete_theater(
    theater_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """删除剧场（级联删除所有节点和边）"""
    service = TheaterService(db)
    await service.delete_theater(theater_id, current_user.id)
    return {"detail": "Theater deleted"}


@router.put("/{theater_id}/canvas", response_model=TheaterDetailResponse)
async def save_canvas(
    theater_id: str,
    data: TheaterSaveRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """保存画布状态（全量同步节点和边）"""
    service = TheaterService(db)
    detail = await service.save_canvas(theater_id, current_user.id, data)
    return TheaterDetailResponse.model_validate({
        **TheaterResponse.model_validate(detail["theater"]).model_dump(),
        "nodes": detail["nodes"],
        "edges": detail["edges"],
    })


@router.post("/{theater_id}/duplicate", response_model=TheaterResponse)
async def duplicate_theater(
    theater_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """复制剧场（含所有节点和边）"""
    service = TheaterService(db)
    return await service.duplicate_theater(theater_id, current_user.id)
