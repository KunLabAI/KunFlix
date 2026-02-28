from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from database import get_db
from models import SubscriptionPlan, Admin
from schemas import (
    SubscriptionPlanCreate,
    SubscriptionPlanUpdate,
    SubscriptionPlanResponse,
)
from auth import require_admin

router = APIRouter(
    prefix="/api/admin/subscriptions",
    tags=["subscriptions"],
    responses={404: {"description": "Not found"}},
)


@router.post("/", response_model=SubscriptionPlanResponse)
async def create_plan(
    plan: SubscriptionPlanCreate,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(SubscriptionPlan).filter(SubscriptionPlan.name == plan.name)
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Plan name already exists")

    new_plan = SubscriptionPlan(**plan.model_dump())
    db.add(new_plan)
    await db.commit()
    await db.refresh(new_plan)
    return new_plan


@router.get("/", response_model=List[SubscriptionPlanResponse])
async def list_plans(
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SubscriptionPlan).order_by(
            SubscriptionPlan.sort_order.asc(),
            SubscriptionPlan.created_at.desc(),
        )
    )
    return result.scalars().all()


@router.get("/{plan_id}", response_model=SubscriptionPlanResponse)
async def get_plan(
    plan_id: str,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id)
    )
    plan = result.scalars().first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.put("/{plan_id}", response_model=SubscriptionPlanResponse)
async def update_plan(
    plan_id: str,
    plan_update: SubscriptionPlanUpdate,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id)
    )
    plan = result.scalars().first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    update_data = plan_update.model_dump(exclude_unset=True)

    # Validate name uniqueness on rename
    if "name" in update_data and update_data["name"] != plan.name:
        existing = await db.execute(
            select(SubscriptionPlan).filter(
                SubscriptionPlan.name == update_data["name"]
            )
        )
        if existing.scalars().first():
            raise HTTPException(status_code=400, detail="Plan name already exists")

    for key, value in update_data.items():
        setattr(plan, key, value)

    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/{plan_id}")
async def delete_plan(
    plan_id: str,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id)
    )
    plan = result.scalars().first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    await db.delete(plan)
    await db.commit()
    return {"message": "Plan deleted successfully"}
