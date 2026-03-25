"""add_unified_image_config_to_agents

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-25 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6g7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 统一图像生成配置 (JSON) — 供应商无关
    op.add_column('agents', sa.Column('image_config', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('agents', 'image_config')
