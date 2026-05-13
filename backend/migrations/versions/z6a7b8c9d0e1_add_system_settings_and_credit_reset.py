"""add_system_settings_and_credit_reset

Revision ID: z6a7b8c9d0e1
Revises: y5z6a7b8c9d0
Create Date: 2026-05-13 10:00:00.000000

Credit system enhancements:
- system_settings table (key/value JSON) for runtime configuration
- users.next_credit_reset_at for Lazy monthly reset trigger
- Seed default credit_policy
- Backfill next_credit_reset_at for active subscription users (next month 1st UTC)
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "z6a7b8c9d0e1"
down_revision: Union[str, None] = "y5z6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DEFAULT_CREDIT_POLICY = {
    "new_user_initial_credits": 100.0,
    "subscription_reset_enabled": True,
    "subscription_reset_mode": "override",   # override | accumulate | floor（预留扩展）
    "free_tier_reset_enabled": False,
    "free_tier_reset_credits": 0,
}


def _next_month_first_utc() -> datetime:
    """返回下月 1 日 UTC 00:00 的 datetime。"""
    now = datetime.now(timezone.utc)
    # 跨年处理：12 月 → 次年 1 月
    year = now.year + (1 if now.month == 12 else 0)
    month = 1 if now.month == 12 else now.month + 1
    return datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)


def upgrade() -> None:
    # 1) 创建 system_settings 表
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(length=100), primary_key=True),
        sa.Column("value", sa.JSON(), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
    )

    # 2) users 新增 next_credit_reset_at
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("next_credit_reset_at", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.create_index(
            "ix_users_next_credit_reset_at", ["next_credit_reset_at"]
        )

    # 3) Seed 默认 credit_policy
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO system_settings (key, value, description) "
            "VALUES (:k, :v, :d)"
        ),
        {
            "k": "credit_policy",
            "v": json.dumps(DEFAULT_CREDIT_POLICY),
            "d": "积分策略：新用户初始积分、月度重置参数",
        },
    )

    # 4) 回填活跃订阅用户的 next_credit_reset_at（下月 1 日 UTC 00:00）
    #    只对 subscription_status='active' 且 next_credit_reset_at IS NULL 的用户回填
    next_ts = _next_month_first_utc()
    conn.execute(
        sa.text(
            "UPDATE users SET next_credit_reset_at = :ts "
            "WHERE subscription_status = 'active' AND next_credit_reset_at IS NULL"
        ),
        {"ts": next_ts},
    )


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index("ix_users_next_credit_reset_at")
        batch_op.drop_column("next_credit_reset_at")
    op.drop_table("system_settings")
