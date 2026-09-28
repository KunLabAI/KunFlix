"""add tts_tasks table

Revision ID: k8l9m0n1o2p3
Revises: j7k8l9m0n1o2
Create Date: 2026-09-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'k8l9m0n1o2p3'
down_revision: Union[str, Sequence[str], None] = 'j7k8l9m0n1o2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tts_tasks',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('session_id', sa.String(length=36), nullable=True),
        sa.Column('provider_id', sa.String(length=36), nullable=True),
        sa.Column('model', sa.String(length=100), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('voice', sa.String(length=100), nullable=True),
        sa.Column('style', sa.String(length=500), nullable=True),
        sa.Column('speakers_json', sa.JSON(), nullable=True),
        sa.Column('output_format', sa.String(length=10), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('result_audio_url', sa.String(length=500), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('canvas_node_id', sa.String(length=36), nullable=True),
        sa.Column('credit_cost', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['session_id'], ['chat_sessions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['provider_id'], ['llm_providers.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_tts_tasks_id'), 'tts_tasks', ['id'], unique=False)
    op.create_index(op.f('ix_tts_tasks_session_id'), 'tts_tasks', ['session_id'], unique=False)
    op.create_index(op.f('ix_tts_tasks_user_id'), 'tts_tasks', ['user_id'], unique=False)
    op.create_index(op.f('ix_tts_tasks_status'), 'tts_tasks', ['status'], unique=False)
    op.create_index('ix_tts_tasks_user_status_created', 'tts_tasks', ['user_id', 'status', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_tts_tasks_user_status_created', table_name='tts_tasks')
    op.drop_index(op.f('ix_tts_tasks_status'), table_name='tts_tasks')
    op.drop_index(op.f('ix_tts_tasks_user_id'), table_name='tts_tasks')
    op.drop_index(op.f('ix_tts_tasks_session_id'), table_name='tts_tasks')
    op.drop_index(op.f('ix_tts_tasks_id'), table_name='tts_tasks')
    op.drop_table('tts_tasks')
