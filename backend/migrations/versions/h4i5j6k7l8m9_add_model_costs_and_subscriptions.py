"""add model_costs and subscription_plans

Revision ID: h4i5j6k7l8m9
Revises: g3h4i5j6k7l8
Create Date: 2026-02-28 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h4i5j6k7l8m9'
down_revision: Union[str, None] = 'g3h4i5j6k7l8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add model_costs to llm_providers
    with op.batch_alter_table('llm_providers', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('model_costs', sa.JSON(), server_default='{}')
        )

    # Create subscription_plans table
    op.create_table(
        'subscription_plans',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('price_usd', sa.Float(), nullable=False),
        sa.Column('credits', sa.Float(), nullable=False),
        sa.Column('billing_period', sa.String(20), server_default='monthly'),
        sa.Column('features', sa.JSON(), server_default='[]'),
        sa.Column('is_active', sa.Boolean(), server_default='1'),
        sa.Column('sort_order', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_subscription_plans_id', 'subscription_plans', ['id'])
    op.create_index('ix_subscription_plans_name', 'subscription_plans', ['name'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_subscription_plans_name', table_name='subscription_plans')
    op.drop_index('ix_subscription_plans_id', table_name='subscription_plans')
    op.drop_table('subscription_plans')

    with op.batch_alter_table('llm_providers', schema=None) as batch_op:
        batch_op.drop_column('model_costs')
