"""chat_sessions.theater_id FK ondelete SET NULL

Revision ID: y5z6a7b8c9d0
Revises: x4y5z6a7b8c9
Create Date: 2026-05-11 00:00:00.000000

将 chat_sessions.theater_id 的外键约束改为 ON DELETE SET NULL。
旧约束为默认 NO ACTION/RESTRICT，导致删除 theater 时若存在关联
的 chat_sessions 记录就会抛出 ForeignKeyViolationError 500。

语义：剧场被删除时，关联会话仅断开 theater 引用，保留会话历史
便于用户回看；与 ChatSession.theater_id 允许 nullable=True 一致。

兼容性说明：
- 历史走 alembic 链路建库 → FK 名为 `fk_chat_sessions_theater_id`
- 走 startup._try_fast_bootstrap → create_all() 建库 → FK 名为
  PG 默认 `chat_sessions_theater_id_fkey`
本脚本通过 inspector 按列名反查真实 FK 名，兼容两种历史路径，
并对「已为 SET NULL」的情况幂等跳过。
"""
from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "y5z6a7b8c9d0"
down_revision = "x4y5z6a7b8c9"
branch_labels = None
depends_on = None


FK_NAME = "fk_chat_sessions_theater_id"
TABLE = "chat_sessions"
COLUMN = "theater_id"


def _find_theater_fk(bind) -> dict | None:
    """按列名反查 chat_sessions.theater_id 的外键元信息；找不到返回 None。"""
    insp = inspect(bind)
    return next(
        (
            fk
            for fk in insp.get_foreign_keys(TABLE)
            if COLUMN in (fk.get("constrained_columns") or [])
        ),
        None,
    )


def _fk_ondelete(fk: dict | None) -> str:
    return ((fk or {}).get("options") or {}).get("ondelete", "").upper()


def upgrade() -> None:
    bind = op.get_bind()
    fk = _find_theater_fk(bind)

    # 幂等：create_all 路径下建出来就是 SET NULL，直接跳过
    already_set_null = _fk_ondelete(fk) == "SET NULL"
    actions = {
        True: lambda: None,
        False: lambda: _rebuild_fk(fk),
    }
    actions[already_set_null]()


def _rebuild_fk(fk: dict | None) -> None:
    existing_name = (fk or {}).get("name") or FK_NAME
    with op.batch_alter_table(TABLE) as batch_op:
        batch_op.drop_constraint(existing_name, type_="foreignkey")
        batch_op.create_foreign_key(
            FK_NAME,
            "theaters",
            [COLUMN],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    bind = op.get_bind()
    fk = _find_theater_fk(bind)
    existing_name = (fk or {}).get("name") or FK_NAME
    with op.batch_alter_table(TABLE) as batch_op:
        batch_op.drop_constraint(existing_name, type_="foreignkey")
        batch_op.create_foreign_key(
            FK_NAME,
            "theaters",
            [COLUMN],
            ["id"],
        )
