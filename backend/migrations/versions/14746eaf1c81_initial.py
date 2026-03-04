"""initial

Revision ID: 14746eaf1c81
Revises: 
Create Date: 2026-02-19 16:59:03.451596

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '14746eaf1c81'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 创建基础表（如果不存在）
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'llm_providers' not in existing_tables:
        op.create_table('llm_providers',
            sa.Column('id', sa.String(36), nullable=False),
            sa.Column('name', sa.String(), nullable=True),
            sa.Column('provider_type', sa.String(), nullable=True),
            sa.Column('api_key', sa.String(), nullable=True),
            sa.Column('base_url', sa.String(), nullable=True),
            sa.Column('models', sa.JSON(), nullable=True),
            sa.Column('tags', sa.JSON(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=True),
            sa.Column('is_default', sa.Boolean(), nullable=True),
            sa.Column('config_json', sa.JSON(), nullable=True),
            sa.Column('model_costs', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
    else:
        # 表已存在，只做 alter
        with op.batch_alter_table('llm_providers', schema=None) as batch_op:
            batch_op.alter_column('tags',
                   existing_type=sa.TEXT(),
                   type_=sa.JSON(),
                   existing_nullable=True,
                   existing_server_default=sa.text("'[]'"))


def downgrade() -> None:
    pass
