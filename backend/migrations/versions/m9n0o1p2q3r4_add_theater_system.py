"""add theater system, remove story_chapters and user legacy fields

Revision ID: m9n0o1p2q3r4
Revises: l8m9n0o1p2q3
Create Date: 2026-03-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'm9n0o1p2q3r4'
down_revision: Union[str, None] = 'l8m9n0o1p2q3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 创建 theaters 表
    op.create_table(
        'theaters',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('title', sa.String(200), nullable=False, server_default='未命名剧场'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('thumbnail_url', sa.String(), nullable=True),
        sa.Column('status', sa.String(20), server_default='draft', index=True),
        sa.Column('canvas_viewport', sa.JSON(), server_default='{}'),
        sa.Column('settings', sa.JSON(), server_default='{}'),
        sa.Column('node_count', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    # 2. 创建 theater_nodes 表
    op.create_table(
        'theater_nodes',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('theater_id', sa.String(36), sa.ForeignKey('theaters.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('node_type', sa.String(20), nullable=False),
        sa.Column('position_x', sa.Float(), server_default='0'),
        sa.Column('position_y', sa.Float(), server_default='0'),
        sa.Column('width', sa.Float(), nullable=True),
        sa.Column('height', sa.Float(), nullable=True),
        sa.Column('z_index', sa.Integer(), server_default='0'),
        sa.Column('data', sa.JSON(), server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    # 3. 创建 theater_edges 表
    op.create_table(
        'theater_edges',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('theater_id', sa.String(36), sa.ForeignKey('theaters.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('source_node_id', sa.String(36), sa.ForeignKey('theater_nodes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('target_node_id', sa.String(36), sa.ForeignKey('theater_nodes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_handle', sa.String(50), nullable=True),
        sa.Column('target_handle', sa.String(50), nullable=True),
        sa.Column('edge_type', sa.String(20), server_default='custom'),
        sa.Column('animated', sa.Boolean(), server_default='1'),
        sa.Column('style', sa.JSON(), server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # 4. 清理 users 表遗留字段
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('current_chapter')
        batch_op.drop_column('personality_profile')
        batch_op.drop_column('inventory')
        batch_op.drop_column('relationships')

    # 5. 删除 story_chapters 表
    op.drop_table('story_chapters')


def downgrade() -> None:
    # 1. 重建 story_chapters 表
    op.create_table(
        'story_chapters',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('chapter_number', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), server_default='pending'),
        sa.Column('choices', sa.JSON(), server_default='[]'),
        sa.Column('summary_embedding', sa.JSON(), nullable=True),
        sa.Column('world_state_snapshot', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # 2. 恢复 users 表遗留字段
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('current_chapter', sa.Integer(), server_default='1'))
        batch_op.add_column(sa.Column('personality_profile', sa.JSON(), server_default='{}'))
        batch_op.add_column(sa.Column('inventory', sa.JSON(), server_default='[]'))
        batch_op.add_column(sa.Column('relationships', sa.JSON(), server_default='{}'))

    # 3. 删除剧场系统表（逆序）
    op.drop_table('theater_edges')
    op.drop_table('theater_nodes')
    op.drop_table('theaters')
