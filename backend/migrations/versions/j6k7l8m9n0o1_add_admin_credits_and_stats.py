"""Add admin credits and stats fields

Revision ID: j6k7l8m9n0o1
Revises: i5j6k7l8m9n0
Create Date: 2026-02-28

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'j6k7l8m9n0o1'
down_revision = 'i5j6k7l8m9n0'
branch_labels = None
depends_on = None


def _column_exists(table, column):
    """Check if a column already exists in a table (SQLite compatible)."""
    from alembic import context
    bind = context.get_bind()
    result = bind.execute(sa.text(f"PRAGMA table_info({table})"))
    return any(row[1] == column for row in result)


def upgrade() -> None:
    # Add stats and credits fields to admins table (idempotent)
    cols = [
        ('total_input_tokens', sa.BigInteger(), True, '0'),
        ('total_output_tokens', sa.BigInteger(), True, '0'),
        ('total_input_chars', sa.BigInteger(), True, '0'),
        ('total_output_chars', sa.BigInteger(), True, '0'),
        ('credits', sa.Float(), False, '0.0'),
    ]
    for col_name, col_type, nullable, default in cols:
        if not _column_exists('admins', col_name):
            op.add_column('admins', sa.Column(col_name, col_type, nullable=nullable, server_default=default))

    # Add admin_id to credit_transactions (idempotent)
    if not _column_exists('credit_transactions', 'admin_id'):
        op.add_column('credit_transactions', sa.Column('admin_id', sa.String(36), nullable=True))
        op.create_index('ix_credit_transactions_admin_id', 'credit_transactions', ['admin_id'])

    # Rebuild chat_sessions without user_id FK constraint (batch mode for SQLite)
    with op.batch_alter_table('chat_sessions', recreate='always') as batch_op:
        # Batch recreate will rebuild table without the FK since model no longer has it
        pass


def downgrade() -> None:
    # Restore FK constraint on chat_sessions.user_id
    with op.batch_alter_table('chat_sessions') as batch_op:
        batch_op.create_foreign_key('chat_sessions_user_id_fkey', 'users', ['user_id'], ['id'])

    # Remove admin_id from credit_transactions
    with op.batch_alter_table('credit_transactions') as batch_op:
        batch_op.drop_index('ix_credit_transactions_admin_id')
        batch_op.drop_column('admin_id')

    # Remove stats and credits fields from admins table
    op.drop_column('admins', 'credits')
    op.drop_column('admins', 'total_output_chars')
    op.drop_column('admins', 'total_input_chars')
    op.drop_column('admins', 'total_output_tokens')
    op.drop_column('admins', 'total_input_tokens')
