"""add_video_tasks_provider_id_model

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-04-15 20:00:00.000000

Add provider_id and model columns to video_tasks table.
The model previously had agent_id which was replaced by provider_id + model
in the codebase, but no migration was created for this change.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b9c0d1e2f3a4'
down_revision: Union[str, None] = 'a8b9c0d1e2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('video_tasks', schema=None) as batch_op:
        batch_op.add_column(sa.Column('provider_id', sa.String(36), nullable=True))
        batch_op.add_column(sa.Column('model', sa.String(), nullable=True))
        batch_op.create_foreign_key(
            'fk_video_tasks_provider_id',
            'llm_providers',
            ['provider_id'],
            ['id'],
        )


def downgrade() -> None:
    with op.batch_alter_table('video_tasks', schema=None) as batch_op:
        batch_op.drop_constraint('fk_video_tasks_provider_id', type_='foreignkey')
        batch_op.drop_column('model')
        batch_op.drop_column('provider_id')
