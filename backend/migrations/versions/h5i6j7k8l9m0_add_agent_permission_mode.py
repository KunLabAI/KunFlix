"""add_agent_permission_mode

Revision ID: h5i6j7k8l9m0
Revises: g4h5i6j7k8l9
Create Date: 2026-07-19 13:30:00.000000

P1-3: Agent.permission_mode 极简权限模式字段
- explore : 只读工具放行，其余 DENY（只读探索会话）
- default : (默认) 委托给既有 skill_gate / tool_manager 检查，无额外拦截
- bypass  : 完全信任（后台批处理 / CI）

存为字符串而非 ENUM，方便未来新增模式而不迁移。
既有行 permission_mode 默认为 "default"，与 security.permission._coerce_mode 兜底对齐。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h5i6j7k8l9m0'
down_revision: Union[str, None] = 'g4h5i6j7k8l9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'permission_mode',
            sa.String(length=20),
            nullable=True,
            server_default='default',
        ))

    # 既有 agent 行显式回填 default，与代码兜底保持一致
    op.execute(
        "UPDATE agents SET permission_mode = 'default' "
        "WHERE permission_mode IS NULL"
    )


def downgrade() -> None:
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.drop_column('permission_mode')
