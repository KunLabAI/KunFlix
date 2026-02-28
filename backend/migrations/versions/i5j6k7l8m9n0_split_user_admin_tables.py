"""split user and admin tables, add subscription fields

Revision ID: i5j6k7l8m9n0
Revises: h4i5j6k7l8m9
Create Date: 2026-02-28 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'i5j6k7l8m9n0'
down_revision: Union[str, None] = 'h4i5j6k7l8m9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 创建 admins 表
    op.create_table(
        'admins',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('nickname', sa.String(100), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='1'),
        sa.Column('permission_level', sa.String(20), server_default="'admin'"),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_login_ip', sa.String(45), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_admins_id', 'admins', ['id'])
    op.create_index('ix_admins_email', 'admins', ['email'], unique=True)

    # 2. 从 users 表迁移管理员数据到 admins 表
    # 使用原生 SQL 进行数据迁移
    op.execute("""
        INSERT INTO admins (id, email, nickname, password_hash, is_active, permission_level, last_login_at, last_login_ip, created_at)
        SELECT id, email, nickname, password_hash, is_active, 'admin', last_login_at, last_login_ip, created_at
        FROM users
        WHERE role = 'admin'
    """)

    # 3. 为 users 表添加订阅相关字段
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('subscription_plan_id', sa.String(36), nullable=True)
        )
        batch_op.add_column(
            sa.Column('subscription_status', sa.String(20), server_default="'inactive'")
        )
        batch_op.add_column(
            sa.Column('subscription_start_at', sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(
            sa.Column('subscription_end_at', sa.DateTime(timezone=True), nullable=True)
        )
        # 创建外键关联
        batch_op.create_foreign_key(
            'fk_users_subscription_plan',
            'subscription_plans',
            ['subscription_plan_id'],
            ['id']
        )

    # 4. 删除 users 表中的管理员记录（已迁移到 admins 表）
    op.execute("DELETE FROM users WHERE role = 'admin'")

    # 注意：暂时保留 users.role 字段以保持向后兼容
    # 后续可在稳定后通过另一个迁移移除该字段


def downgrade() -> None:
    # 1. 将 admins 数据迁移回 users 表
    op.execute("""
        INSERT INTO users (id, email, nickname, password_hash, is_active, role, last_login_at, last_login_ip, created_at)
        SELECT id, email, nickname, password_hash, is_active, 'admin', last_login_at, last_login_ip, created_at
        FROM admins
    """)

    # 2. 移除 users 表的订阅字段
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_constraint('fk_users_subscription_plan', type_='foreignkey')
        batch_op.drop_column('subscription_end_at')
        batch_op.drop_column('subscription_start_at')
        batch_op.drop_column('subscription_status')
        batch_op.drop_column('subscription_plan_id')

    # 3. 删除 admins 表
    op.drop_index('ix_admins_email', table_name='admins')
    op.drop_index('ix_admins_id', table_name='admins')
    op.drop_table('admins')
