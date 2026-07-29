"""add_sub_agent_templates

Revision ID: i6j7k8l9m0n1
Revises: h5i6j7k8l9m0
Create Date: 2026-07-19 15:00:00.000000

P1-1: SubAgentTemplate 表 + Agent.sub_agent_template_types 字段 + 3 条内置种子蓝图。

蓝图让 Admin 预定义可复用的 Worker 模板（researcher/writer/reviewer），
Leader agent 通过 sub_agent_template_types 声明可派生的蓝图类型。
运行时 spawn 逻辑留给 P1-4 Team 工具骨架。
"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'i6j7k8l9m0n1'
down_revision: Union[str, None] = 'h5i6j7k8l9m0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# 内置蓝图种子数据
# ---------------------------------------------------------------------------

_SEED_TEMPLATES = [
    {
        "id": str(uuid.uuid4()),
        "type": "researcher",
        "description": "Read-only explorer that investigates, analyzes, and reports findings without making any changes.",
        "system_prompt_template": (
            "You are {member_name}, a researcher in team '{team_name}' led by {leader_name}.\n\n"
            "Team goal: {team_description}\n\n"
            "Your role: {member_description}\n\n"
            "## Responsibilities\n"
            "- Complete the research task assigned by the team leader.\n"
            "- You are READ-ONLY: you may inspect files, data, and code but must NEVER modify, create, or delete anything.\n\n"
            "## Reporting\n"
            "- Report your findings clearly and concisely when the task is done."
        ),
        "permission_mode": "explore",
        "tools": "[]",
        "context_config": "{}",
        "max_tool_rounds": 30,
    },
    {
        "id": str(uuid.uuid4()),
        "type": "writer",
        "description": "Content creator that produces written materials — stories, scripts, documentation, etc.",
        "system_prompt_template": (
            "You are {member_name}, a writer in team '{team_name}' led by {leader_name}.\n\n"
            "Team goal: {team_description}\n\n"
            "Your role: {member_description}\n\n"
            "## Responsibilities\n"
            "- Produce high-quality written content as specified by the team leader.\n"
            "- Follow style guidelines and maintain consistency with existing materials.\n\n"
            "## Reporting\n"
            "- Deliver the final written output when complete."
        ),
        "permission_mode": "default",
        "tools": "[]",
        "context_config": "{}",
        "max_tool_rounds": 50,
    },
    {
        "id": str(uuid.uuid4()),
        "type": "reviewer",
        "description": "Quality reviewer that evaluates outputs against criteria and provides structured feedback.",
        "system_prompt_template": (
            "You are {member_name}, a reviewer in team '{team_name}' led by {leader_name}.\n\n"
            "Team goal: {team_description}\n\n"
            "Your role: {member_description}\n\n"
            "## Responsibilities\n"
            "- Evaluate the provided output against the quality criteria.\n"
            "- You are READ-ONLY: review and provide feedback, do NOT modify outputs directly.\n\n"
            "## Reporting\n"
            "- Provide a structured review: score (1-10), strengths, weaknesses, and specific improvement suggestions."
        ),
        "permission_mode": "explore",
        "tools": "[]",
        "context_config": "{}",
        "max_tool_rounds": 20,
    },
]


def upgrade() -> None:
    # 1. 创建 sub_agent_templates 表
    op.create_table(
        'sub_agent_templates',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('system_prompt_template', sa.Text(), nullable=False),
        sa.Column('permission_mode', sa.String(length=20), nullable=True, server_default='default'),
        sa.Column('context_config', sa.JSON(), nullable=True),
        sa.Column('tools', sa.JSON(), nullable=True),
        sa.Column('max_tool_rounds', sa.Integer(), nullable=True, server_default='50'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('sub_agent_templates', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_sub_agent_templates_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_sub_agent_templates_type'), ['type'], unique=True)

    # 2. Agent 表新增 sub_agent_template_types 字段
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'sub_agent_template_types',
            sa.JSON(),
            nullable=True,
            server_default='[]',
        ))

    # 3. 插入种子蓝图
    for tpl in _SEED_TEMPLATES:
        op.execute(
            f"INSERT INTO sub_agent_templates (id, type, description, system_prompt_template, "
            f"permission_mode, context_config, tools, max_tool_rounds) VALUES ("
            f"'{tpl['id']}', '{tpl['type']}', '{tpl['description'].replace(chr(39), chr(39)+chr(39))}', "
            f"'{tpl['system_prompt_template'].replace(chr(39), chr(39)+chr(39))}', "
            f"'{tpl['permission_mode']}', '{tpl['context_config']}', '{tpl['tools']}', {tpl['max_tool_rounds']})"
        )


def downgrade() -> None:
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.drop_column('sub_agent_template_types')

    with op.batch_alter_table('sub_agent_templates', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sub_agent_templates_type'))
        batch_op.drop_index(batch_op.f('ix_sub_agent_templates_id'))

    op.drop_table('sub_agent_templates')
