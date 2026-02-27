"""add_gemini_config

Revision ID: e1f2a3b4c5d6
Revises: d8e9f0a1b2c3
Create Date: 2026-02-27 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd8e9f0a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 新增 gemini_config 字段到 agents 表
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.add_column(sa.Column('gemini_config', sa.JSON(), nullable=True))

    # 数据迁移: 将 thinking_mode=True 的记录迁移到 gemini_config.thinking_level="high"
    # 使用原生 SQL 进行更新
    connection = op.get_bind()
    connection.execute(
        sa.text("""
            UPDATE agents 
            SET gemini_config = '{"thinking_level": "high"}'
            WHERE thinking_mode = 1
        """)
    )


def downgrade() -> None:
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.drop_column('gemini_config')
