"""add music_tasks table

Revision ID: t9u0v1w2x3y4
Revises: s8t9u0v1w2x3
Create Date: 2026-04-09

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 't9u0v1w2x3y4'
down_revision = 's8t9u0v1w2x3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'music_tasks',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('chat_sessions.id'), nullable=True, index=True),
        sa.Column('provider_id', sa.String(36), sa.ForeignKey('llm_providers.id'), nullable=True),
        sa.Column('model', sa.String(100), nullable=False),
        sa.Column('user_id', sa.String(36), nullable=False, index=True),
        sa.Column('prompt', sa.Text(), nullable=False),
        sa.Column('lyrics', sa.Text(), nullable=True),
        sa.Column('output_format', sa.String(10), server_default='mp3'),
        sa.Column('input_image_count', sa.Integer(), server_default='0'),
        sa.Column('status', sa.String(20), server_default='pending', index=True),
        sa.Column('result_audio_url', sa.String(500), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('credit_cost', sa.Float(), server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('music_tasks')
