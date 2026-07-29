"""add_agent_orchestration_style

Revision ID: j7k8l9m0n1o2
Revises: i6j7k8l9m0n1
Create Date: 2026-07-19 16:00:00.000000

P1-4: Agent.orchestration_style 灰度开关
- legacy_json (默认): 一次 JSON 计划 + UnifiedStrategy（零改变既有行为）
- team_tools: leader ReAct 循环 + 5 个 team 内置工具增量编排
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'j7k8l9m0n1o2'
down_revision: Union[str, None] = 'i6j7k8l9m0n1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'orchestration_style',
            sa.String(length=20),
            nullable=True,
            server_default='legacy_json',
        ))


def downgrade() -> None:
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.drop_column('orchestration_style')
