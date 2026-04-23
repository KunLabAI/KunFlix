"""add model_metadata to llm_providers

Revision ID: u1v2w3x4y5z6
Revises: t9u0v1w2x3y4
Create Date: 2026-04-23 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "u1v2w3x4y5z6"
down_revision = "4b9b3c531b6f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "llm_providers",
        sa.Column("model_metadata", sa.JSON(), nullable=True, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("llm_providers", "model_metadata")
