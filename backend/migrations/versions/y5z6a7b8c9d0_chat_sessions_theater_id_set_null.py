"""chat_sessions.theater_id FK ondelete SET NULL

Revision ID: y5z6a7b8c9d0
Revises: x4y5z6a7b8c9
Create Date: 2026-05-11 00:00:00.000000

将 chat_sessions.theater_id 的外键约束改为 ON DELETE SET NULL。
旧约束为默认 NO ACTION/RESTRICT，导致删除 theater 时若存在关联
的 chat_sessions 记录就会抛出 ForeignKeyViolationError 500。

语义：剧场被删除时，关联会话仅断开 theater 引用，保留会话历史
便于用户回看；与 ChatSession.theater_id 允许 nullable=True 一致。
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "y5z6a7b8c9d0"
down_revision = "x4y5z6a7b8c9"
branch_labels = None
depends_on = None


FK_NAME = "fk_chat_sessions_theater_id"


def upgrade() -> None:
    with op.batch_alter_table("chat_sessions") as batch_op:
        batch_op.drop_constraint(FK_NAME, type_="foreignkey")
        batch_op.create_foreign_key(
            FK_NAME,
            "theaters",
            ["theater_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("chat_sessions") as batch_op:
        batch_op.drop_constraint(FK_NAME, type_="foreignkey")
        batch_op.create_foreign_key(
            FK_NAME,
            "theaters",
            ["theater_id"],
            ["id"],
        )
