"""
火山方舟预制虚拟人像库 — 数据库查询层

Seedance 2.0 系列模型不支持直接上传含真人人脸的参考图/视频。
平台提供预置虚拟人像库，每个素材对应一个 asset ID，
在 content.image_url.url 字段中传入 asset://<asset ID> 即可生成视频。

管理员通过后台管理端 (/admin/virtual-humans) 动态维护虚拟人像列表。
"""
from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal
from models import VirtualHumanPreset


def _preset_to_dict(p: VirtualHumanPreset) -> dict:
    """将 ORM 对象转为字典（含 asset_uri）"""
    return {
        "id": p.id,
        "asset_id": p.asset_id,
        "asset_uri": p.asset_uri,
        "name": p.name,
        "gender": p.gender,
        "style": p.style,
        "preview_url": p.preview_url,
        "description": p.description or "",
        "is_active": p.is_active,
        "sort_order": p.sort_order,
    }


async def list_presets(
    gender: Optional[str] = None,
    style: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> List[dict]:
    """
    返回可用的虚拟人像预制列表（仅 is_active=True），支持按标签筛选。

    Args:
        gender: 按性别筛选 (male / female)，None 表示全部
        style:  按风格筛选，None 表示全部
        db:     可选的数据库会话，未提供时自动创建
    """
    async def _query(session: AsyncSession) -> List[dict]:
        query = (
            select(VirtualHumanPreset)
            .where(VirtualHumanPreset.is_active == True)
            .order_by(VirtualHumanPreset.sort_order.asc(), VirtualHumanPreset.created_at.desc())
        )
        query = query.where(VirtualHumanPreset.gender == gender) if gender else query
        query = query.where(VirtualHumanPreset.style == style) if style else query

        result = await session.execute(query)
        return [_preset_to_dict(p) for p in result.scalars().all()]

    return await _query(db) if db else await _run_with_session(_query)


async def get_preset_by_asset_id(
    asset_id: str,
    db: Optional[AsyncSession] = None,
) -> Optional[dict]:
    """根据 asset_id 获取单个虚拟人像信息"""
    async def _query(session: AsyncSession) -> Optional[dict]:
        result = await session.execute(
            select(VirtualHumanPreset).where(VirtualHumanPreset.asset_id == asset_id)
        )
        p = result.scalar_one_or_none()
        return _preset_to_dict(p) if p else None

    return await _query(db) if db else await _run_with_session(_query)


async def get_all_asset_ids(
    db: Optional[AsyncSession] = None,
) -> List[str]:
    """返回所有可用的 asset ID 列表"""
    async def _query(session: AsyncSession) -> List[str]:
        result = await session.execute(
            select(VirtualHumanPreset.asset_id).where(VirtualHumanPreset.is_active == True)
        )
        return list(result.scalars().all())

    return await _query(db) if db else await _run_with_session(_query)


async def _run_with_session(fn):
    """创建临时会话执行查询"""
    async with AsyncSessionLocal() as session:
        return await fn(session)
