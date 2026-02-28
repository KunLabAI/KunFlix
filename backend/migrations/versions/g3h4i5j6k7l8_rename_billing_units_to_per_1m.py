"""rename billing units from per_1k to per_1m

Revision ID: g3h4i5j6k7l8
Revises: f2a3b4c5d6e7
Create Date: 2026-02-28 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g3h4i5j6k7l8'
down_revision: Union[str, None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 字段重命名映射表 (old_name, new_name)
_RENAME_COLUMNS = [
    ("input_credit_per_1k",        "input_credit_per_1m"),
    ("output_credit_per_1k",       "output_credit_per_1m"),
    ("image_output_credit_per_1k", "image_output_credit_per_1m"),
]


def upgrade() -> None:
    with op.batch_alter_table('agents', schema=None) as batch_op:
        for old_name, new_name in _RENAME_COLUMNS:
            batch_op.alter_column(old_name, new_column_name=new_name)

    # 将现有费率值乘以 1000（从 /1K 换算到 /1M 单位）
    agents = sa.table(
        'agents',
        sa.column('input_credit_per_1m', sa.Float),
        sa.column('output_credit_per_1m', sa.Float),
        sa.column('image_output_credit_per_1m', sa.Float),
    )
    op.execute(
        agents.update().values(
            input_credit_per_1m=agents.c.input_credit_per_1m * 1000,
            output_credit_per_1m=agents.c.output_credit_per_1m * 1000,
            image_output_credit_per_1m=agents.c.image_output_credit_per_1m * 1000,
        )
    )


def downgrade() -> None:
    # 先将费率值除以 1000（从 /1M 换算回 /1K 单位）
    agents = sa.table(
        'agents',
        sa.column('input_credit_per_1m', sa.Float),
        sa.column('output_credit_per_1m', sa.Float),
        sa.column('image_output_credit_per_1m', sa.Float),
    )
    op.execute(
        agents.update().values(
            input_credit_per_1m=agents.c.input_credit_per_1m / 1000,
            output_credit_per_1m=agents.c.output_credit_per_1m / 1000,
            image_output_credit_per_1m=agents.c.image_output_credit_per_1m / 1000,
        )
    )

    with op.batch_alter_table('agents', schema=None) as batch_op:
        for old_name, new_name in _RENAME_COLUMNS:
            batch_op.alter_column(new_name, new_column_name=old_name)
