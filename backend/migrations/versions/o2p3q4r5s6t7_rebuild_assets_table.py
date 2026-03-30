"""rebuild_assets_table

Revision ID: o2p3q4r5s6t7
Revises: n1o2p3q4r5s6
Create Date: 2026-03-30 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'o2p3q4r5s6t7'
down_revision: Union[str, None] = 'n1o2p3q4r5s6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 旧 assets 表 schema 与 ORM 模型完全不一致，且无数据，直接重建
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    'assets' in tables and op.drop_table('assets')

    op.create_table('assets',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.String(36), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('original_name', sa.String(255), nullable=True),
        sa.Column('file_path', sa.String(500), nullable=False),
        sa.Column('file_type', sa.String(50), nullable=True),
        sa.Column('mime_type', sa.String(100), nullable=True),
        sa.Column('size', sa.Integer(), nullable=True),
        sa.Column('width', sa.Integer(), nullable=True),
        sa.Column('height', sa.Integer(), nullable=True),
        sa.Column('duration', sa.Float(), nullable=True),
        sa.Column('metadata_json', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('assets', schema=None) as batch_op:
        batch_op.create_index('ix_assets_id', ['id'], unique=False)
        batch_op.create_index('ix_assets_user_id', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_table('assets')
    op.create_table('assets',
        sa.Column('id', sa.INTEGER(), nullable=False),
        sa.Column('user_id', sa.VARCHAR(36), nullable=True),
        sa.Column('type', sa.VARCHAR(), nullable=True),
        sa.Column('content_hash', sa.VARCHAR(), nullable=True),
        sa.Column('url', sa.VARCHAR(), nullable=True),
        sa.Column('prompt', sa.TEXT(), nullable=True),
        sa.Column('last_accessed', sa.DATETIME(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('file_path', sa.VARCHAR(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
