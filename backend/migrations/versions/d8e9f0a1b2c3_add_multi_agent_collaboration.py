"""add_multi_agent_collaboration

Revision ID: d8e9f0a1b2c3
Revises: c74e516c6d87
Create Date: 2026-02-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8e9f0a1b2c3'
down_revision: Union[str, None] = 'c74e516c6d87'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Agent 新增 Leader 配置字段
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_leader', sa.Boolean(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('coordination_modes', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('member_agent_ids', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('max_subtasks', sa.Integer(), nullable=False, server_default='10'))
        batch_op.add_column(sa.Column('enable_auto_review', sa.Boolean(), nullable=False, server_default='1'))

    # 2. 创建 task_executions 表
    op.create_table('task_executions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('leader_agent_id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('session_id', sa.String(length=36), nullable=True),
        sa.Column('task_description', sa.Text(), nullable=False),
        sa.Column('coordination_mode', sa.String(length=20), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('result', sa.JSON(), nullable=True),
        sa.Column('total_input_tokens', sa.Integer(), nullable=True),
        sa.Column('total_output_tokens', sa.Integer(), nullable=True),
        sa.Column('total_credit_cost', sa.Float(), nullable=True),
        sa.Column('execution_metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['leader_agent_id'], ['agents.id']),
        sa.ForeignKeyConstraint(['session_id'], ['chat_sessions.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('task_executions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_task_executions_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_task_executions_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_task_executions_status'), ['status'], unique=False)

    # 3. 创建 subtasks 表
    op.create_table('subtasks',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('task_execution_id', sa.String(length=36), nullable=False),
        sa.Column('agent_id', sa.String(length=36), nullable=False),
        sa.Column('parent_subtask_id', sa.String(length=36), nullable=True),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('order_index', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('input_data', sa.JSON(), nullable=True),
        sa.Column('output_data', sa.JSON(), nullable=True),
        sa.Column('input_tokens', sa.Integer(), nullable=True),
        sa.Column('output_tokens', sa.Integer(), nullable=True),
        sa.Column('credit_cost', sa.Float(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id']),
        sa.ForeignKeyConstraint(['parent_subtask_id'], ['subtasks.id']),
        sa.ForeignKeyConstraint(['task_execution_id'], ['task_executions.id']),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('subtasks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_subtasks_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_subtasks_task_execution_id'), ['task_execution_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('subtasks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_subtasks_task_execution_id'))
        batch_op.drop_index(batch_op.f('ix_subtasks_id'))

    op.drop_table('subtasks')

    with op.batch_alter_table('task_executions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_task_executions_status'))
        batch_op.drop_index(batch_op.f('ix_task_executions_user_id'))
        batch_op.drop_index(batch_op.f('ix_task_executions_id'))

    op.drop_table('task_executions')

    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.drop_column('enable_auto_review')
        batch_op.drop_column('max_subtasks')
        batch_op.drop_column('member_agent_ids')
        batch_op.drop_column('coordination_modes')
        batch_op.drop_column('is_leader')
