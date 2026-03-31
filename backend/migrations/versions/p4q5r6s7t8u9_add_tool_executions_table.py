"""add_tool_executions_table

Revision ID: p4q5r6s7t8u9
Revises: o2p3q4r5s6t7
Create Date: 2026-03-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'p4q5r6s7t8u9'
down_revision: Union[str, None] = 'o2p3q4r5s6t7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('tool_executions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tool_name', sa.String(length=100), nullable=False),
        sa.Column('provider_name', sa.String(length=50), nullable=False),
        sa.Column('agent_id', sa.String(length=36), nullable=True),
        sa.Column('session_id', sa.String(length=36), nullable=True),
        sa.Column('user_id', sa.String(length=36), nullable=True),
        sa.Column('is_admin', sa.Boolean(), nullable=True, default=False),
        sa.Column('theater_id', sa.String(length=36), nullable=True),
        sa.Column('arguments', sa.JSON(), nullable=True),
        sa.Column('result_summary', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, default='success'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('tool_executions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_tool_executions_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_tool_executions_tool_name'), ['tool_name'], unique=False)
        batch_op.create_index(batch_op.f('ix_tool_executions_provider_name'), ['provider_name'], unique=False)
        batch_op.create_index(batch_op.f('ix_tool_executions_agent_id'), ['agent_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_tool_executions_session_id'), ['session_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_tool_executions_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_tool_executions_status'), ['status'], unique=False)
        batch_op.create_index(batch_op.f('ix_tool_executions_created_at'), ['created_at'], unique=False)


def downgrade() -> None:
    op.drop_table('tool_executions')
