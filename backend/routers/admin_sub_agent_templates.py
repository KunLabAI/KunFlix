"""P1-1: SubAgentTemplate CRUD API (admin-only)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from database import get_db
from models import Agent, SubAgentTemplate
from schemas import (
    SubAgentTemplateCreate,
    SubAgentTemplateUpdate,
    SubAgentTemplateResponse,
)
from auth import require_admin

router = APIRouter(
    prefix="/api/admin/sub-agent-templates",
    tags=["sub-agent-templates"],
    responses={404: {"description": "Not found"}},
)


@router.post("", response_model=SubAgentTemplateResponse)
async def create_template(
    payload: SubAgentTemplateCreate,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new SubAgentTemplate blueprint."""
    # Unique constraint on `type`
    existing = await db.execute(
        select(SubAgentTemplate).filter(SubAgentTemplate.type == payload.type)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail=f"Template type '{payload.type}' already exists")

    template = SubAgentTemplate(**payload.model_dump())
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.get("", response_model=List[SubAgentTemplateResponse])
async def list_templates(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all SubAgentTemplate blueprints."""
    result = await db.execute(
        select(SubAgentTemplate).order_by(SubAgentTemplate.type)
    )
    return result.scalars().all()


@router.get("/{template_id}", response_model=SubAgentTemplateResponse)
async def get_template(
    template_id: str,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get a single SubAgentTemplate by ID."""
    result = await db.execute(
        select(SubAgentTemplate).filter(SubAgentTemplate.id == template_id)
    )
    template = result.scalars().first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.put("/{template_id}", response_model=SubAgentTemplateResponse)
async def update_template(
    template_id: str,
    payload: SubAgentTemplateUpdate,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing SubAgentTemplate."""
    result = await db.execute(
        select(SubAgentTemplate).filter(SubAgentTemplate.id == template_id)
    )
    template = result.scalars().first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = payload.model_dump(exclude_unset=True)

    # If type is being changed, check uniqueness
    new_type = update_data.get("type")
    if new_type and new_type != template.type:
        dup = await db.execute(
            select(SubAgentTemplate).filter(SubAgentTemplate.type == new_type)
        )
        if dup.scalars().first():
            raise HTTPException(status_code=400, detail=f"Template type '{new_type}' already exists")

    for key, value in update_data.items():
        setattr(template, key, value)

    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a SubAgentTemplate.

    Rejects deletion if any leader agent's sub_agent_template_types still references this template's type.
    """
    result = await db.execute(
        select(SubAgentTemplate).filter(SubAgentTemplate.id == template_id)
    )
    template = result.scalars().first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Check if any leader references this template type
    agents_result = await db.execute(
        select(Agent).filter(Agent.is_leader == True)  # noqa: E712
    )
    leaders = agents_result.scalars().all()
    referencing_leaders = [
        a.name for a in leaders
        if template.type in (a.sub_agent_template_types or [])
    ]
    if referencing_leaders:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot delete template '{template.type}': still referenced by leader(s): "
                f"{', '.join(referencing_leaders)}. Remove the reference first."
            ),
        )

    await db.delete(template)
    await db.commit()
    return {"message": f"Template '{template.type}' deleted successfully"}
