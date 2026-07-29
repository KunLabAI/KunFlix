"""add_agent_review_policy

Revision ID: g4h5i6j7k8l9
Revises: f1a2b3c4d5e6
Create Date: 2026-07-19 12:00:00.000000

P0-4: Agent.review_policy 评审策略字段
- disabled       : 完全不评审
- final_only     : (默认) 仅 Leader 整合阶段做一次评审
- per_subtask    : 每个 subtask 单独评审（历史行为，成本高）
- threshold_based: 复杂任务 (>=3 subtasks) 才逐条评审

存为字符串而非 ENUM，方便将来新增策略而不迁移。
既有行 review_policy 默认为 "final_only"，与代码兜底 DEFAULT_REVIEW_POLICY 对齐。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g4h5i6j7k8l9'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 新增 review_policy 字段；nullable=True 便于渐进升级，代码层 resolve_review_policy() 兜底
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'review_policy',
            sa.String(length=20),
            nullable=True,
            server_default='final_only',
        ))

    # 将既有 leader 行（is_leader=1 且 review_policy 为空）显式回填为 final_only
    op.execute(
        "UPDATE agents SET review_policy = 'final_only' "
        "WHERE review_policy IS NULL AND is_leader = 1"
    )


def downgrade() -> None:
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.drop_column('review_policy')
