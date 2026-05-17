"""unify FK ondelete policies (CASCADE / SET NULL)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-05-13 00:00:00.000000

统一全表外键的 ON DELETE 策略，根治删除父记录时频繁触发的
ForeignKeyViolationError 500 问题。

策略原则：
- 父记录被删除后子表仍有保留意义（历史/审计/配置）→ SET NULL
- 子表无父就失去意义（消息属于会话/子任务属于任务等）→ CASCADE

兼容性：
- 旧库走 alembic 链路 → FK 名 fk_<table>_<column>
- 新库走 startup._try_fast_bootstrap (create_all) → FK 名
  PG 默认 <table>_<column>_fkey
本脚本通过 inspector 按列名反查真实 FK 名，幂等：当前 ondelete
已与目标一致则跳过。
"""
from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


# (table, column, referred_table, referred_column, ondelete)
FK_POLICIES: list[tuple[str, str, str, str, str]] = [
    # users 子表
    ("theaters", "user_id", "users", "id", "CASCADE"),
    ("assets", "user_id", "users", "id", "CASCADE"),
    ("credit_transactions", "user_id", "users", "id", "SET NULL"),
    ("task_executions", "user_id", "users", "id", "CASCADE"),
    # subscription_plans
    ("users", "subscription_plan_id", "subscription_plans", "id", "SET NULL"),
    # theaters 子表（拓扑结构强一致：剧场删除则节点/连线一并清理）
    ("theater_nodes", "theater_id", "theaters", "id", "CASCADE"),
    ("theater_edges", "theater_id", "theaters", "id", "CASCADE"),
    ("chat_sessions", "theater_id", "theaters", "id", "SET NULL"),
    # theater_nodes 子表
    ("theater_edges", "source_node_id", "theater_nodes", "id", "CASCADE"),
    ("theater_edges", "target_node_id", "theater_nodes", "id", "CASCADE"),
    # chat_sessions 子表
    ("chat_messages", "session_id", "chat_sessions", "id", "CASCADE"),
    ("credit_transactions", "session_id", "chat_sessions", "id", "SET NULL"),
    ("task_executions", "session_id", "chat_sessions", "id", "SET NULL"),
    ("video_tasks", "session_id", "chat_sessions", "id", "SET NULL"),
    ("music_tasks", "session_id", "chat_sessions", "id", "SET NULL"),
    # chat_messages 子表
    ("video_tasks", "message_id", "chat_messages", "id", "SET NULL"),
    # llm_providers 子表
    ("agents", "provider_id", "llm_providers", "id", "SET NULL"),
    ("video_tasks", "provider_id", "llm_providers", "id", "SET NULL"),
    ("music_tasks", "provider_id", "llm_providers", "id", "SET NULL"),
    # agents 子表
    ("theater_nodes", "created_by_agent_id", "agents", "id", "SET NULL"),
    ("chat_sessions", "agent_id", "agents", "id", "SET NULL"),
    ("credit_transactions", "agent_id", "agents", "id", "SET NULL"),
    ("task_executions", "leader_agent_id", "agents", "id", "CASCADE"),
    ("subtasks", "agent_id", "agents", "id", "CASCADE"),
    ("prompt_templates", "default_agent_id", "agents", "id", "SET NULL"),
    ("admin_debug_sessions", "agent_id", "agents", "id", "CASCADE"),
    ("tool_executions", "agent_id", "agents", "id", "SET NULL"),
    # task_executions / subtasks
    ("subtasks", "task_execution_id", "task_executions", "id", "CASCADE"),
    ("subtasks", "parent_subtask_id", "subtasks", "id", "SET NULL"),
    # admin_debug_sessions 子表
    ("admin_debug_messages", "session_id", "admin_debug_sessions", "id", "CASCADE"),
    # admins 子表
    ("credit_transactions", "admin_id", "admins", "id", "SET NULL"),
    ("admin_debug_sessions", "admin_id", "admins", "id", "CASCADE"),
]


def _find_fk(insp, table: str, column: str) -> dict | None:
    """按列名反查指定表的外键元信息；找不到返回 None。"""
    return next(
        (
            fk
            for fk in insp.get_foreign_keys(table)
            if column in (fk.get("constrained_columns") or [])
        ),
        None,
    )


def _ondelete(fk: dict | None) -> str:
    return ((fk or {}).get("options") or {}).get("ondelete", "").upper()


def _apply(table: str, column: str, ref_table: str, ref_col: str, ondelete: str) -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    # 表不存在直接跳过（兼容部分模块在历史分支被裁剪的情况）
    if not insp.has_table(table):
        return

    fk = _find_fk(insp, table, column)
    # 幂等：已是目标策略则跳过
    if _ondelete(fk) == ondelete.upper():
        return

    desired_name = f"fk_{table}_{column}"
    existing_name = (fk or {}).get("name") or desired_name
    drop_dispatch = {
        True: lambda b: b.drop_constraint(existing_name, type_="foreignkey"),
        False: lambda b: None,
    }
    with op.batch_alter_table(table) as batch_op:
        drop_dispatch[fk is not None](batch_op)
        batch_op.create_foreign_key(
            desired_name,
            ref_table,
            [column],
            [ref_col],
            ondelete=ondelete,
        )


def _revert(table: str, column: str, ref_table: str, ref_col: str) -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return
    fk = _find_fk(insp, table, column)
    desired_name = f"fk_{table}_{column}"
    existing_name = (fk or {}).get("name") or desired_name
    drop_dispatch = {
        True: lambda b: b.drop_constraint(existing_name, type_="foreignkey"),
        False: lambda b: None,
    }
    with op.batch_alter_table(table) as batch_op:
        drop_dispatch[fk is not None](batch_op)
        batch_op.create_foreign_key(
            desired_name,
            ref_table,
            [column],
            [ref_col],
        )


def upgrade() -> None:
    # SQLite 不强制执行 FK 策略，且 batch_alter_table 处理匿名外键有缺陷，
    # 本地开发环境跳过整个批量调整，生产 PostgreSQL 仍照常执行。
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        return
    for table, column, ref_table, ref_col, ondelete in FK_POLICIES:
        _apply(table, column, ref_table, ref_col, ondelete)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        return
    for table, column, ref_table, ref_col, _ondelete in FK_POLICIES:
        _revert(table, column, ref_table, ref_col)
