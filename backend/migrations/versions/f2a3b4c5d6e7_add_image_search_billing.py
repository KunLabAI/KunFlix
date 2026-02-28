"""add_image_search_billing

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-02-28 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('image_output_credit_per_1k', sa.Float(), nullable=False, server_default='0')
        )
        batch_op.add_column(
            sa.Column('search_credit_per_query', sa.Float(), nullable=False, server_default='0')
        )


def downgrade() -> None:
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.drop_column('search_credit_per_query')
        batch_op.drop_column('image_output_credit_per_1k')
