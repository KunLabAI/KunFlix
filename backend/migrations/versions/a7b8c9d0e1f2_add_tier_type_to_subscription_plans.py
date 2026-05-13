"""add_tier_type_to_subscription_plans

Revision ID: a7b8c9d0e1f2
Revises: z6a7b8c9d0e1
Create Date: 2026-05-13 10:00:00.000000

添加 subscription_plans.tier_type 字段，区分「注册自动分配」与「付费购买」两类套餐。
- free_tier：注册时自动分配给新用户
- paid：用户通过购买获得

数据回填规则：将历史 price_usd=0 的记录标记为 free_tier，其余为 paid。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'z6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 新增字段（允许 NULL 以便回填），默认 "paid"
    with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('tier_type', sa.String(length=32), nullable=True, server_default='paid')
        )

    # 2. 数据回填：price_usd=0 的记录升级为 free_tier
    op.execute(
        "UPDATE subscription_plans SET tier_type = 'free_tier' WHERE price_usd = 0"
    )
    op.execute(
        "UPDATE subscription_plans SET tier_type = 'paid' WHERE tier_type IS NULL"
    )

    # 3. 收紧为 NOT NULL + 建索引
    with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
        batch_op.alter_column(
            'tier_type',
            existing_type=sa.String(length=32),
            nullable=False,
            server_default='paid',
        )
        batch_op.create_index(
            batch_op.f('ix_subscription_plans_tier_type'),
            ['tier_type'],
            unique=False,
        )


def downgrade() -> None:
    with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_subscription_plans_tier_type'))
        batch_op.drop_column('tier_type')
