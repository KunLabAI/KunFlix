"""add_canvas_node_id_to_video_and_music_tasks

Revision ID: f1a2b3c4d5e6
Revises: d7e8f9a0b1c2
Create Date: 2026-06-07 12:00:00.000000

变更摘要：
为 video_tasks 和 music_tasks 表添加 canvas_node_id 字段，
用于媒体生成工具自动创建画布占位节点后追踪节点 ID，
以便任务完成时回填实际媒体 URL。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "d7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("video_tasks", sa.Column("canvas_node_id", sa.String(36), nullable=True))
    op.add_column("music_tasks", sa.Column("canvas_node_id", sa.String(36), nullable=True))


def downgrade() -> None:
    op.drop_column("video_tasks", "canvas_node_id")
    op.drop_column("music_tasks", "canvas_node_id")
