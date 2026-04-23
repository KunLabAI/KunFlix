"""add virtual_human_presets table

Revision ID: 4b9b3c531b6f
Revises: b9c0d1e2f3a4
Create Date: 2026-04-22 20:52:34.268558

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b9b3c531b6f'
down_revision: Union[str, None] = 'b9c0d1e2f3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('virtual_human_presets',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('asset_id', sa.String(length=100), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('gender', sa.String(length=10), nullable=False),
    sa.Column('style', sa.String(length=50), nullable=False),
    sa.Column('preview_url', sa.String(length=500), nullable=False),
    sa.Column('description', sa.String(length=500), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=True),
    sa.Column('sort_order', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('virtual_human_presets', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_virtual_human_presets_asset_id'), ['asset_id'], unique=True)
        batch_op.create_index(batch_op.f('ix_virtual_human_presets_id'), ['id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('virtual_human_presets', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_virtual_human_presets_id'))
        batch_op.drop_index(batch_op.f('ix_virtual_human_presets_asset_id'))

    op.drop_table('virtual_human_presets')
