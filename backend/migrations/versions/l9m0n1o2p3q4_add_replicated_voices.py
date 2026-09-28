"""add replicated_voices table

Revision ID: l9m0n1o2p3q4
Revises: k8l9m0n1o2p3
Create Date: 2026-09-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'l9m0n1o2p3q4'
down_revision: Union[str, Sequence[str], None] = 'k8l9m0n1o2p3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'replicated_voices',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('provider_id', sa.String(length=36), nullable=True),
        sa.Column('model', sa.String(length=100), nullable=True),
        sa.Column('display_name', sa.String(length=100), nullable=False),
        sa.Column('voice_id', sa.String(length=200), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['provider_id'], ['llm_providers.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_replicated_voices_id'), 'replicated_voices', ['id'], unique=False)
    op.create_index(op.f('ix_replicated_voices_user_id'), 'replicated_voices', ['user_id'], unique=False)
    op.create_index(op.f('ix_replicated_voices_status'), 'replicated_voices', ['status'], unique=False)
    op.create_index('ix_replicated_voices_user_created', 'replicated_voices', ['user_id', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_replicated_voices_user_created', table_name='replicated_voices')
    op.drop_index(op.f('ix_replicated_voices_status'), table_name='replicated_voices')
    op.drop_index(op.f('ix_replicated_voices_user_id'), table_name='replicated_voices')
    op.drop_index(op.f('ix_replicated_voices_id'), table_name='replicated_voices')
    op.drop_table('replicated_voices')
