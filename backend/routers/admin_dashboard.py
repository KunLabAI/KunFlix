"""
管理员仪表盘路由 — 核心统计、注册趋势、Token排行、订阅分析、内容生成统计
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case, and_, desc, literal_column
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_admin
from database import get_db
from models import (
    Admin, User, Theater, Asset, LLMProvider,
    VideoTask, MusicTask, CreditTransaction,
    SubscriptionPlan, ToolExecution,
)

router = APIRouter(
    prefix="/api/admin/dashboard",
    tags=["admin-dashboard"],
    responses={404: {"description": "Not found"}},
)

# ---------------------------------------------------------------------------
# 时间分桶工具
# ---------------------------------------------------------------------------

def _time_boundaries() -> dict[str, datetime]:
    """返回 today/yesterday/this_week/this_month 的起始时间边界。"""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return {
        "today": today_start,
        "yesterday": today_start - timedelta(days=1),
        "this_week": today_start - timedelta(days=today_start.weekday()),
        "this_month": today_start.replace(day=1),
    }


# ---------------------------------------------------------------------------
# 1. 核心统计概览
# ---------------------------------------------------------------------------

@router.get("/overview")
async def dashboard_overview(
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """返回仪表盘核心统计指标。"""
    bounds = _time_boundaries()
    today_start = bounds["today"]

    total_users = await db.scalar(select(func.count(User.id))) or 0

    # 今日活跃用户（今日有登录记录）
    today_active_users = await db.scalar(
        select(func.count(User.id)).where(User.last_login_at >= today_start)
    ) or 0

    # 今日营收（仅统计用户付费交易：subscription / purchase）
    _paid_types = ["subscription", "purchase"]
    _revenue_filter = and_(
        CreditTransaction.amount > 0,
        CreditTransaction.transaction_type.in_(_paid_types),
        CreditTransaction.user_id.isnot(None),
    )
    today_revenue = await db.scalar(
        select(func.coalesce(func.sum(CreditTransaction.amount), 0)).where(
            and_(_revenue_filter, CreditTransaction.created_at >= today_start)
        )
    ) or 0

    # 总营收（仅统计用户付费交易）
    total_revenue = await db.scalar(
        select(func.coalesce(func.sum(CreditTransaction.amount), 0)).where(_revenue_filter)
    ) or 0

    return {
        "total_users": total_users,
        "today_active_users": today_active_users,
        "today_revenue": round(float(today_revenue), 2),
        "total_revenue": round(float(total_revenue), 2),
    }


# ---------------------------------------------------------------------------
# 2. 注册趋势
# ---------------------------------------------------------------------------

# 时间筛选周期到天数的映射
PERIOD_DAYS: dict[str, int] = {
    "today": 1,
    "yesterday": 2,
    "week": 7,
    "month": 30,
    "quarter": 90,
    "all": 3650,
}


@router.get("/registration-trend")
async def registration_trend(
    period: str = Query(default="month", description="筛选周期: today/yesterday/week/month/quarter/all"),
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """按时间段和逐日统计新注册用户数。"""
    bounds = _time_boundaries()

    # 时间分桶统计
    buckets: dict[str, int] = {}
    bucket_defs = [
        ("today", bounds["today"], None),
        ("yesterday", bounds["yesterday"], bounds["today"]),
        ("this_week", bounds["this_week"], bounds["yesterday"]),
        ("this_month", bounds["this_month"], bounds["this_week"]),
    ]
    for name, start, end in bucket_defs:
        conditions = [User.created_at >= start]
        end is not None and conditions.append(User.created_at < end)
        buckets[name] = await db.scalar(
            select(func.count(User.id)).where(and_(*conditions))
        ) or 0

    buckets["older"] = await db.scalar(
        select(func.count(User.id)).where(User.created_at < bounds["this_month"])
    ) or 0

    # 根据 period 参数决定查询范围
    days = PERIOD_DAYS.get(period, 30)
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)
    daily_result = await db.execute(
        select(
            func.date(User.created_at).label("day"),
            func.count(User.id).label("count"),
        )
        .where(User.created_at >= start_date)
        .group_by(func.date(User.created_at))
        .order_by(literal_column("day"))
    )
    daily = [{"date": str(r.day), "count": r.count} for r in daily_result.all()]

    return {"buckets": buckets, "daily": daily, "period": period}


# ---------------------------------------------------------------------------
# 2b. 活跃趋势
# ---------------------------------------------------------------------------

@router.get("/active-trend")
async def active_trend(
    period: str = Query(default="month", description="筛选周期: today/yesterday/week/month/quarter/all"),
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """按日统计每天有多少不同用户登录过。"""
    days = PERIOD_DAYS.get(period, 30)
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)

    daily_result = await db.execute(
        select(
            func.date(User.last_login_at).label("day"),
            func.count(func.distinct(User.id)).label("count"),
        )
        .where(User.last_login_at >= start_date)
        .group_by(func.date(User.last_login_at))
        .order_by(literal_column("day"))
    )
    daily = [{"date": str(r.day), "count": r.count} for r in daily_result.all()]
    return {"daily": daily, "period": period}


# ---------------------------------------------------------------------------
# 2c. 订阅转化趋势
# ---------------------------------------------------------------------------

@router.get("/conversion-trend")
async def conversion_trend(
    period: str = Query(default="month", description="筛选周期: today/yesterday/week/month/quarter/all"),
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """按日统计新增订阅数与当天累计用户总数。"""
    days = PERIOD_DAYS.get(period, 30)
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)

    # 新增订阅数（按 subscription_start_at 分组）
    sub_result = await db.execute(
        select(
            func.date(User.subscription_start_at).label("day"),
            func.count(User.id).label("new_subscriptions"),
        )
        .where(
            and_(
                User.subscription_start_at >= start_date,
                User.subscription_status.in_(["active", "expired"]),
            )
        )
        .group_by(func.date(User.subscription_start_at))
        .order_by(literal_column("day"))
    )
    sub_map: dict[str, int] = {str(r.day): r.new_subscriptions for r in sub_result.all()}

    # 每日注册累计用户（用于计算转化基数）
    reg_result = await db.execute(
        select(
            func.date(User.created_at).label("day"),
            func.count(User.id).label("count"),
        )
        .where(User.created_at >= start_date)
        .group_by(func.date(User.created_at))
        .order_by(literal_column("day"))
    )

    # 获取 start_date 之前的用户总数作为基数
    base_users = await db.scalar(
        select(func.count(User.id)).where(User.created_at < start_date)
    ) or 0

    daily: list[dict] = []
    cumulative = base_users
    for r in reg_result.all():
        day_str = str(r.day)
        cumulative += r.count
        daily.append({
            "date": day_str,
            "new_subscriptions": sub_map.get(day_str, 0),
            "total_users_that_day": cumulative,
        })

    return {"daily": daily, "period": period}


# ---------------------------------------------------------------------------
# 3. Token 消耗排行榜
# ---------------------------------------------------------------------------

@router.get("/token-leaderboard")
async def token_leaderboard(
    limit: int = Query(default=10, le=200, description="排行榜数量: 10/50/100"),
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """返回 Token 消耗 Top N 用户（含消耗积分）。"""
    total_expr = (
        func.coalesce(User.total_input_tokens, 0)
        + func.coalesce(User.total_output_tokens, 0)
    )

    # 子查询：每用户消耗积分
    consumed_sub = (
        select(
            CreditTransaction.user_id,
            func.coalesce(func.sum(func.abs(CreditTransaction.amount)), 0).label("consumed"),
        )
        .where(CreditTransaction.amount < 0)
        .group_by(CreditTransaction.user_id)
        .subquery()
    )

    result = await db.execute(
        select(
            User.id,
            User.nickname,
            User.email,
            User.total_input_tokens,
            User.total_output_tokens,
            total_expr.label("total_tokens"),
            User.credits,
            func.coalesce(consumed_sub.c.consumed, 0).label("credits_consumed"),
        )
        .outerjoin(consumed_sub, User.id == consumed_sub.c.user_id)
        .order_by(desc(total_expr))
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "rank": idx + 1,
            "user_id": r.id,
            "nickname": r.nickname,
            "email": r.email,
            "input_tokens": r.total_input_tokens or 0,
            "output_tokens": r.total_output_tokens or 0,
            "total_tokens": r.total_tokens or 0,
            "credits": round(float(r.credits or 0), 2),
            "credits_consumed": round(float(r.credits_consumed or 0), 2),
        }
        for idx, r in enumerate(rows)
    ]


# ---------------------------------------------------------------------------
# 4. 订阅分析
# ---------------------------------------------------------------------------

@router.get("/subscription-analysis")
async def subscription_analysis(
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """按套餐维度和时间维度分析订阅情况。"""
    # 各套餐活跃用户数
    plan_result = await db.execute(
        select(
            SubscriptionPlan.id,
            SubscriptionPlan.name,
            SubscriptionPlan.price_usd,
            func.count(User.id).label("active_count"),
        )
        .outerjoin(
            User,
            and_(
                User.subscription_plan_id == SubscriptionPlan.id,
                User.subscription_status == "active",
            ),
        )
        .group_by(SubscriptionPlan.id, SubscriptionPlan.name, SubscriptionPlan.price_usd)
        .order_by(SubscriptionPlan.sort_order)
    )
    by_plan = [
        {
            "plan_id": r.id,
            "plan_name": r.name,
            "price_usd": r.price_usd,
            "active_count": r.active_count,
            "revenue": round(r.active_count * r.price_usd, 2),
        }
        for r in plan_result.all()
    ]

    # 按时间段统计新增订阅
    bounds = _time_boundaries()
    time_buckets: dict[str, int] = {}
    bucket_defs = [
        ("today", bounds["today"], None),
        ("yesterday", bounds["yesterday"], bounds["today"]),
        ("this_week", bounds["this_week"], bounds["yesterday"]),
        ("this_month", bounds["this_month"], bounds["this_week"]),
    ]
    for name, start, end in bucket_defs:
        conditions = [
            User.subscription_start_at >= start,
            User.subscription_status == "active",
        ]
        end is not None and conditions.append(User.subscription_start_at < end)
        time_buckets[name] = await db.scalar(
            select(func.count(User.id)).where(and_(*conditions))
        ) or 0

    time_buckets["older"] = await db.scalar(
        select(func.count(User.id)).where(
            and_(
                User.subscription_start_at < bounds["this_month"],
                User.subscription_status == "active",
            )
        )
    ) or 0

    total_active = await db.scalar(
        select(func.count(User.id)).where(User.subscription_status == "active")
    ) or 0

    return {
        "total_active_subscriptions": total_active,
        "by_plan": by_plan,
        "time_buckets": time_buckets,
    }


# ---------------------------------------------------------------------------
# 5. 内容生成统计
# ---------------------------------------------------------------------------

@router.get("/content-stats")
async def content_stats(
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """返回视频/音乐/图像等内容生成的统计数据。"""
    # 视频任务统计
    video_total = await db.scalar(select(func.count(VideoTask.id))) or 0
    video_completed = await db.scalar(
        select(func.count(VideoTask.id)).where(VideoTask.status == "completed")
    ) or 0
    video_failed = await db.scalar(
        select(func.count(VideoTask.id)).where(VideoTask.status == "failed")
    ) or 0
    video_success_rate = round(video_completed / video_total * 100, 2) if video_total else 0

    # 音乐任务统计
    music_total = await db.scalar(select(func.count(MusicTask.id))) or 0
    music_completed = await db.scalar(
        select(func.count(MusicTask.id)).where(MusicTask.status == "completed")
    ) or 0
    music_failed = await db.scalar(
        select(func.count(MusicTask.id)).where(MusicTask.status == "failed")
    ) or 0
    music_success_rate = round(music_completed / music_total * 100, 2) if music_total else 0

    # 图像生成统计（通过 ToolExecution 中 tool_name="generate_image" 追踪）
    _img_filter = ToolExecution.tool_name == "generate_image"
    image_total = await db.scalar(
        select(func.count(ToolExecution.id)).where(_img_filter)
    ) or 0
    image_completed = await db.scalar(
        select(func.count(ToolExecution.id)).where(and_(_img_filter, ToolExecution.status == "success"))
    ) or 0
    image_failed = await db.scalar(
        select(func.count(ToolExecution.id)).where(and_(_img_filter, ToolExecution.status == "error"))
    ) or 0
    image_success_rate = round(image_completed / image_total * 100, 2) if image_total else 0

    # 资产按类型分组
    asset_result = await db.execute(
        select(
            Asset.file_type,
            func.count(Asset.id).label("count"),
        )
        .group_by(Asset.file_type)
    )
    asset_by_type = {(r.file_type or "unknown"): r.count for r in asset_result.all()}

    # 工具执行统计
    tool_total = await db.scalar(select(func.count(ToolExecution.id))) or 0
    tool_errors = await db.scalar(
        select(func.count(ToolExecution.id)).where(ToolExecution.status == "error")
    ) or 0
    tool_avg_ms = await db.scalar(select(func.avg(ToolExecution.duration_ms)))

    # 存储按文件类型分布
    storage_result = await db.execute(
        select(
            Asset.file_type,
            func.coalesce(func.sum(Asset.size), 0).label("total_bytes"),
        )
        .group_by(Asset.file_type)
    )
    storage_by_type = {(r.file_type or "unknown"): r.total_bytes for r in storage_result.all()}

    return {
        "video": {
            "total": video_total,
            "completed": video_completed,
            "failed": video_failed,
            "success_rate": video_success_rate,
        },
        "image": {
            "total": image_total,
            "completed": image_completed,
            "failed": image_failed,
            "success_rate": image_success_rate,
        },
        "music": {
            "total": music_total,
            "completed": music_completed,
            "failed": music_failed,
            "success_rate": music_success_rate,
        },
        "assets_by_type": asset_by_type,
        "storage_by_type": storage_by_type,
        "tool_execution": {
            "total": tool_total,
            "errors": tool_errors,
            "error_rate": round(tool_errors / tool_total * 100, 2) if tool_total else 0,
            "avg_duration_ms": round(tool_avg_ms, 1) if tool_avg_ms else None,
        },
    }


# ---------------------------------------------------------------------------
# 6. 运营指标（PUR / 留存率 / MRR / 退订率）
# ---------------------------------------------------------------------------

@router.get("/operational-metrics")
async def operational_metrics(
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """返回核心运营指标。"""
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)

    total_users = await db.scalar(select(func.count(User.id))) or 0
    paid_users = await db.scalar(
        select(func.count(User.id)).where(User.subscription_status == "active")
    ) or 0

    # PUR — 付费用户占比
    pur = round(paid_users / total_users * 100, 2) if total_users else 0

    # 留存率 — 7天内登录用户中，30天前也登录过的比例
    recent_active = await db.scalar(
        select(func.count(User.id)).where(User.last_login_at >= seven_days_ago)
    ) or 0
    retained = await db.scalar(
        select(func.count(User.id)).where(
            and_(
                User.last_login_at >= seven_days_ago,
                User.created_at < seven_days_ago,
            )
        )
    ) or 0
    retention_rate = round(retained / recent_active * 100, 2) if recent_active else 0

    # MRR — 月经常性收入
    mrr_result = await db.execute(
        select(
            SubscriptionPlan.price_usd,
            SubscriptionPlan.billing_period,
            func.count(User.id).label("cnt"),
        )
        .join(User, and_(
            User.subscription_plan_id == SubscriptionPlan.id,
            User.subscription_status == "active",
        ))
        .group_by(SubscriptionPlan.id, SubscriptionPlan.price_usd, SubscriptionPlan.billing_period)
    )
    mrr = 0.0
    for r in mrr_result.all():
        monthly_price = r.price_usd / 12 if r.billing_period == "yearly" else r.price_usd
        mrr += monthly_price * r.cnt
    mrr = round(mrr, 2)

    # 退订率 — expired / (expired + active)
    expired_users = await db.scalar(
        select(func.count(User.id)).where(User.subscription_status == "expired")
    ) or 0
    churn_base = expired_users + paid_users
    churn_rate = round(expired_users / churn_base * 100, 2) if churn_base else 0

    return {
        "pur": pur,
        "retention_rate": retention_rate,
        "mrr": mrr,
        "churn_rate": churn_rate,
    }
