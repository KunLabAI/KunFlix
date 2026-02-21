from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func, delete
from typing import List, Dict, Any

from database import get_db
from models import User, StoryChapter, LLMProvider, Asset
from auth import require_admin

router = APIRouter(
    prefix="/api/admin",
    tags=["admin_general"],
    responses={404: {"description": "Not found"}},
)


@router.get("/stats", response_model=Dict[str, int])
async def get_stats(
    _current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard statistics."""
    user_count = await db.scalar(select(func.count(User.id)))
    story_count = await db.scalar(select(func.count(StoryChapter.id)))
    asset_count = await db.scalar(select(func.count(Asset.id)))
    provider_count = await db.scalar(select(func.count(LLMProvider.id)))

    return {
        "users": user_count or 0,
        "stories": story_count or 0,
        "assets": asset_count or 0,
        "providers": provider_count or 0,
    }


@router.get("/users", response_model=List[Dict[str, Any]])
async def get_users(
    skip: int = 0,
    limit: int = 50,
    _current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List users with basic info (admin only)."""
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(skip).limit(limit)
    )
    users = result.scalars().all()

    return [
        {
            "id": u.id,
            "email": u.email,
            "nickname": u.nickname,
            "role": u.role,
            "is_active": u.is_active,
            "total_input_tokens": u.total_input_tokens or 0,
            "total_output_tokens": u.total_output_tokens or 0,
            "last_login_at": u.last_login_at,
            "created_at": u.created_at,
        }
        for u in users
    ]


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    _current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user and their stories (admin only)."""
    result = await db.execute(select(User).filter(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Delete associated stories
    await db.execute(delete(StoryChapter).where(StoryChapter.user_id == user_id))

    await db.delete(user)
    await db.commit()
    return {"ok": True}


@router.get("/stories", response_model=List[Dict[str, Any]])
async def get_stories(
    skip: int = 0,
    limit: int = 50,
    user_id: str = None,
    _current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List stories (admin only)."""
    query = select(StoryChapter).order_by(StoryChapter.created_at.desc())

    if user_id:
        query = query.filter(StoryChapter.user_id == user_id)

    result = await db.execute(query.offset(skip).limit(limit))
    stories = result.scalars().all()

    return [
        {
            "id": s.id,
            "user_id": s.user_id,
            "chapter_number": s.chapter_number,
            "title": s.title,
            "status": s.status,
            "created_at": s.created_at,
        }
        for s in stories
    ]
