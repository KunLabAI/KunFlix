"""Fix credit_transactions user_id nullable

Revision ID: k7l8m9n0o1p2
Revises: j6k7l8m9n0o1
Create Date: 2026-02-28

"""
from alembic import op
import sqlalchemy as sa


revision = 'k7l8m9n0o1p2'
down_revision = 'j6k7l8m9n0o1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite requires batch mode to change column nullable
    with op.batch_alter_table('credit_transactions', recreate='always') as batch_op:
        batch_op.alter_column('user_id', existing_type=sa.String(36), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('credit_transactions', recreate='always') as batch_op:
        batch_op.alter_column('user_id', existing_type=sa.String(36), nullable=False)
