"""add composite indexes for hot queries

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
Create Date: 2026-04-28 00:00:00.000000

针对 SaaS 级并发下的热查询路径添加复合索引：
- theaters(user_id, status, updated_at): 我的剧场列表翻页 / 过滤
- theater_nodes(theater_id, node_type): 画布按类型筛选
- assets(user_id, file_type, created_at): 资源浏览分类列表
- chat_messages(session_id, created_at): 会话消息翻页
- credit_transactions(user_id, created_at) + (admin_id, created_at): 账单明细
- task_executions(user_id, status, created_at): 多智能体任务列表
- video_tasks(user_id, status, created_at): 视频任务列表
- music_tasks(user_id, status, created_at): 音乐任务列表
- tool_executions(user_id, created_at) + (tool_name, status): 运维审计
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "v2w3x4y5z6a7"
down_revision = "u1v2w3x4y5z6"
branch_labels = None
depends_on = None


# 索引定义：(index_name, table_name, columns)
_INDEXES = [
    ("ix_theaters_user_status_updated", "theaters", ["user_id", "status", "updated_at"]),
    ("ix_theater_nodes_theater_type", "theater_nodes", ["theater_id", "node_type"]),
    ("ix_assets_user_type_created", "assets", ["user_id", "file_type", "created_at"]),
    ("ix_chat_messages_session_created", "chat_messages", ["session_id", "created_at"]),
    ("ix_credit_tx_user_created", "credit_transactions", ["user_id", "created_at"]),
    ("ix_credit_tx_admin_created", "credit_transactions", ["admin_id", "created_at"]),
    ("ix_task_exec_user_status_created", "task_executions", ["user_id", "status", "created_at"]),
    ("ix_video_tasks_user_status_created", "video_tasks", ["user_id", "status", "created_at"]),
    ("ix_music_tasks_user_status_created", "music_tasks", ["user_id", "status", "created_at"]),
    ("ix_tool_exec_user_created", "tool_executions", ["user_id", "created_at"]),
    ("ix_tool_exec_tool_status", "tool_executions", ["tool_name", "status"]),
]


def upgrade() -> None:
    for name, table, cols in _INDEXES:
        op.create_index(name, table, cols)


def downgrade() -> None:
    for name, table, _cols in reversed(_INDEXES):
        op.drop_index(name, table_name=table)
