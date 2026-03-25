"""add_xai_image_config_to_agents

Revision ID: a1b2c3d4e5f6
Revises: 2733ee5c4fd0
Create Date: 2026-03-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '2733ee5c4fd0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # xAI 图像生成配置 (JSON)
    op.add_column('agents', sa.Column('xai_image_config', sa.JSON(), nullable=True))
    # 按张计费费率
    op.add_column('agents', sa.Column('image_credit_per_image', sa.Float(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('agents', 'image_credit_per_image')
    op.drop_column('agents', 'xai_image_config')
