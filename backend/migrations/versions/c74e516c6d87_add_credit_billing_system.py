"""add_credit_billing_system

Revision ID: c74e516c6d87
Revises: b5d7e2f8a1c3
Create Date: 2026-02-22 21:23:35.190333

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c74e516c6d87'
down_revision: Union[str, None] = 'b5d7e2f8a1c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 创建 credit_transactions 表
    op.create_table('credit_transactions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('agent_id', sa.String(length=36), nullable=True),
        sa.Column('session_id', sa.String(length=36), nullable=True),
        sa.Column('transaction_type', sa.String(length=20), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('balance_before', sa.Float(), nullable=False),
        sa.Column('balance_after', sa.Float(), nullable=False),
        sa.Column('input_tokens', sa.Integer(), nullable=True),
        sa.Column('output_tokens', sa.Integer(), nullable=True),
        sa.Column('metadata_json', sa.JSON(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id']),
        sa.ForeignKeyConstraint(['session_id'], ['chat_sessions.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('credit_transactions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_credit_transactions_user_id'), ['user_id'], unique=False)

    # 2. Agent 新增积分费率字段
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.add_column(sa.Column('input_credit_per_1k', sa.Float(), nullable=False, server_default='0.0'))
        batch_op.add_column(sa.Column('output_credit_per_1k', sa.Float(), nullable=False, server_default='0.0'))

    # 3. User 新增积分余额字段
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('credits', sa.Float(), nullable=False, server_default='0.0'))


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('credits')

    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.drop_column('output_credit_per_1k')
        batch_op.drop_column('input_credit_per_1k')

    with op.batch_alter_table('credit_transactions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_credit_transactions_user_id'))

    op.drop_table('credit_transactions')
