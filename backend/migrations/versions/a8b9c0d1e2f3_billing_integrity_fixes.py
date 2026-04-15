"""billing_integrity_fixes

Revision ID: a8b9c0d1e2f3
Revises: 1f5bc3b7cc86
Create Date: 2026-04-15 12:00:00.000000

Billing system hardening:
- Add idempotency_key (unique) to credit_transactions for dedup protection
- Add index on credit_transactions.created_at for report queries
- Migrate all financial fields from Float to Numeric(18,4) for precision
  (users.credits, admins.credits, credit_transactions.amount/balance_before/balance_after, subscription_plans.credits)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8b9c0d1e2f3'
down_revision: Union[str, None] = '1f5bc3b7cc86'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # credit_transactions: add idempotency_key, created_at index, Float -> Numeric
    with op.batch_alter_table('credit_transactions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('idempotency_key', sa.String(length=100), nullable=True))
        batch_op.create_unique_constraint('uq_credit_transactions_idempotency_key', ['idempotency_key'])
        batch_op.create_index('ix_credit_transactions_idempotency_key', ['idempotency_key'])
        batch_op.create_index('ix_credit_transactions_created_at', ['created_at'])
        batch_op.alter_column('amount', existing_type=sa.Float(), type_=sa.Numeric(precision=18, scale=4), existing_nullable=False)
        batch_op.alter_column('balance_before', existing_type=sa.Float(), type_=sa.Numeric(precision=18, scale=4), existing_nullable=False)
        batch_op.alter_column('balance_after', existing_type=sa.Float(), type_=sa.Numeric(precision=18, scale=4), existing_nullable=False)

    # users: credits Float -> Numeric
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('credits', existing_type=sa.Float(), type_=sa.Numeric(precision=18, scale=4), existing_nullable=False)

    # admins: credits Float -> Numeric
    with op.batch_alter_table('admins', schema=None) as batch_op:
        batch_op.alter_column('credits', existing_type=sa.Float(), type_=sa.Numeric(precision=18, scale=4), existing_nullable=False)

    # subscription_plans: credits Float -> Numeric
    with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
        batch_op.alter_column('credits', existing_type=sa.Float(), type_=sa.Numeric(precision=18, scale=4), existing_nullable=False)


def downgrade() -> None:
    # subscription_plans: Numeric -> Float
    with op.batch_alter_table('subscription_plans', schema=None) as batch_op:
        batch_op.alter_column('credits', existing_type=sa.Numeric(precision=18, scale=4), type_=sa.Float(), existing_nullable=False)

    # admins: Numeric -> Float
    with op.batch_alter_table('admins', schema=None) as batch_op:
        batch_op.alter_column('credits', existing_type=sa.Numeric(precision=18, scale=4), type_=sa.Float(), existing_nullable=False)

    # users: Numeric -> Float
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('credits', existing_type=sa.Numeric(precision=18, scale=4), type_=sa.Float(), existing_nullable=False)

    # credit_transactions: remove idempotency_key, indexes, Numeric -> Float
    with op.batch_alter_table('credit_transactions', schema=None) as batch_op:
        batch_op.alter_column('balance_after', existing_type=sa.Numeric(precision=18, scale=4), type_=sa.Float(), existing_nullable=False)
        batch_op.alter_column('balance_before', existing_type=sa.Numeric(precision=18, scale=4), type_=sa.Float(), existing_nullable=False)
        batch_op.alter_column('amount', existing_type=sa.Numeric(precision=18, scale=4), type_=sa.Float(), existing_nullable=False)
        batch_op.drop_index('ix_credit_transactions_created_at')
        batch_op.drop_index('ix_credit_transactions_idempotency_key')
        batch_op.drop_constraint('uq_credit_transactions_idempotency_key', type_='unique')
        batch_op.drop_column('idempotency_key')
