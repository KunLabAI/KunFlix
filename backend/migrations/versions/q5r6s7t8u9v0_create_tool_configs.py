"""create_tool_configs

Revision ID: q5r6s7t8u9v0
Revises: p4q5r6s7t8u9
Create Date: 2026-04-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = 'q5r6s7t8u9v0'
down_revision: Union[str, None] = 'p4q5r6s7t8u9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 创建 tool_configs 表
    op.create_table('tool_configs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('tool_name', sa.String(length=100), nullable=False),
        sa.Column('config', sa.JSON(), nullable=True, default=dict),
        sa.Column('is_enabled', sa.Boolean(), nullable=True, default=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('tool_configs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_tool_configs_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_tool_configs_tool_name'), ['tool_name'], unique=True)

    # 迁移现有图像生成配置：查找第一个启用图像生成的智能体，将其配置合并到 tool_configs
    conn = op.get_bind()
    
    # 查找第一个启用图像生成的智能体配置
    result = conn.execute(text("""
        SELECT image_config 
        FROM agents 
        WHERE image_config IS NOT NULL 
          AND json_extract(image_config, '$.image_generation_enabled') = 1
        LIMIT 1
    """))
    row = result.fetchone()
    
    if row and row[0]:
        import json
        try:
            image_config = json.loads(row[0]) if isinstance(row[0], str) else row[0]
            # 插入到 tool_configs 表
            conn.execute(text("""
                INSERT INTO tool_configs (id, tool_name, config, is_enabled, created_at)
                VALUES ('tool-config-generate-image', 'generate_image', :config, 1, datetime('now'))
            """), {"config": json.dumps(image_config)})
        except (json.JSONDecodeError, TypeError):
            pass  # 如果解析失败，跳过迁移


def downgrade() -> None:
    op.drop_table('tool_configs')
