"""relax theater_nodes/edges id length from 36 to 64

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b8
Create Date: 2026-05-09 00:00:00.000000

放宽 theater_nodes.id、theater_edges.id/source_node_id/target_node_id 的长度上限
从 VARCHAR(36) 增加到 VARCHAR(64)，以兼容前端 localStorage 中残留的带前缀 UUID
（如 image-<uuid>、xy-edge__<source>-<target> 等 >36 字符的 ID），避免生产
PostgreSQL 报 "value too long for type character varying(36)" 导致 canvas 保存
500 错误、图像数据丢失。
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "x4y5z6a7b8c9"
down_revision = "w3x4y5z6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # theater_edges 有外键引用 theater_nodes.id，先放宽被引用列，再放宽引用列
    with op.batch_alter_table("theater_nodes") as batch_op:
        batch_op.alter_column(
            "id",
            existing_type=sa.String(length=36),
            type_=sa.String(length=64),
            existing_nullable=False,
        )

    with op.batch_alter_table("theater_edges") as batch_op:
        batch_op.alter_column(
            "id",
            existing_type=sa.String(length=36),
            type_=sa.String(length=64),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "source_node_id",
            existing_type=sa.String(length=36),
            type_=sa.String(length=64),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "target_node_id",
            existing_type=sa.String(length=36),
            type_=sa.String(length=64),
            existing_nullable=False,
        )


def downgrade() -> None:
    # 回滚顺序与 upgrade 相反：先收紧引用列，再收紧被引用列
    with op.batch_alter_table("theater_edges") as batch_op:
        batch_op.alter_column(
            "target_node_id",
            existing_type=sa.String(length=64),
            type_=sa.String(length=36),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "source_node_id",
            existing_type=sa.String(length=64),
            type_=sa.String(length=36),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "id",
            existing_type=sa.String(length=64),
            type_=sa.String(length=36),
            existing_nullable=False,
        )

    with op.batch_alter_table("theater_nodes") as batch_op:
        batch_op.alter_column(
            "id",
            existing_type=sa.String(length=64),
            type_=sa.String(length=36),
            existing_nullable=False,
        )
