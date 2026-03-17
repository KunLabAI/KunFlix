"""player_to_user_auth

Revision ID: b5d7e2f8a1c3
Revises: a3b8c9d0e1f2
Create Date: 2026-02-21

Replaces Player with User, adds auth fields, multi-tenant user_id FKs.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b5d7e2f8a1c3'
down_revision = 'a3b8c9d0e1f2'
branch_labels = None
depends_on = None

# Pre-computed bcrypt hashes (avoids passlib import during migration)
PLACEHOLDER_HASH = '$2b$12$9i4d/ySfpAqDO1XnuUlBPei5FndT/IYGKQlWXroKZYrsRKx7noJOu'  # 'changeme'
ADMIN_HASH = '$2b$12$W/T/QaQO3/ymVEr2aCWg4ewCawGBmrZoLya9152UbBpWa2ElI10l.'  # 'admin123'


def upgrade() -> None:
    # 1. Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(36), primary_key=True, index=True),
        sa.Column('email', sa.String(255), unique=True, nullable=False, index=True),
        sa.Column('nickname', sa.String(100), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('google_id', sa.String(255), unique=True, nullable=True),
        sa.Column('github_id', sa.String(255), unique=True, nullable=True),
        sa.Column('role', sa.String(20), default='user', index=True),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('total_input_tokens', sa.BigInteger(), default=0),
        sa.Column('total_output_tokens', sa.BigInteger(), default=0),
        sa.Column('total_input_chars', sa.BigInteger(), default=0),
        sa.Column('total_output_chars', sa.BigInteger(), default=0),
        sa.Column('register_ip', sa.String(45), nullable=True),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_login_ip', sa.String(45), nullable=True),
        sa.Column('current_chapter', sa.Integer(), default=1),
        sa.Column('personality_profile', sa.JSON(), default={}),
        sa.Column('inventory', sa.JSON(), default=[]),
        sa.Column('relationships', sa.JSON(), default={}),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    # 2. Migrate existing player data to users
    op.execute(
        sa.text("""
            INSERT INTO users (
                id, email, nickname, password_hash, role, is_active,
                total_input_tokens, total_output_tokens, total_input_chars, total_output_chars,
                current_chapter, personality_profile, inventory, relationships,
                created_at
            )
            SELECT
                id,
                username || '@migrated.local',
                username,
                :placeholder_hash,
                'user',
                1,
                0, 0, 0, 0,
                current_chapter, personality_profile, inventory, relationships,
                created_at
            FROM players
        """).bindparams(placeholder_hash=PLACEHOLDER_HASH)
    )

    # 3. Insert default admin user
    import uuid
    admin_id = str(uuid.uuid4())
    op.execute(
        sa.text("""
            INSERT INTO users (
                id, email, nickname, password_hash, role, is_active,
                total_input_tokens, total_output_tokens, total_input_chars, total_output_chars,
                current_chapter, created_at
            ) VALUES (
                :id, :email, :nickname, :password_hash, 'admin', 1,
                0, 0, 0, 0, 1, CURRENT_TIMESTAMP
            )
        """).bindparams(
            id=admin_id,
            email='admin@infinite.theater',
            nickname='System Admin',
            password_hash=ADMIN_HASH,
        )
    )

    # 4. Rebuild story_chapters: rename player_id -> user_id
    with op.batch_alter_table('story_chapters') as batch_op:
        batch_op.alter_column('player_id', new_column_name='user_id')

    # 5. Add user_id to assets
    with op.batch_alter_table('assets') as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.String(36), nullable=True))
        batch_op.create_index('ix_assets_user_id', ['user_id'])

    # 6. Add user_id to chat_sessions
    with op.batch_alter_table('chat_sessions') as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.String(36), nullable=True))
        batch_op.create_index('ix_chat_sessions_user_id', ['user_id'])

    # 7. Drop players table
    op.drop_table('players')


def downgrade() -> None:
    # 1. Recreate players table
    op.create_table(
        'players',
        sa.Column('id', sa.String(36), primary_key=True, index=True),
        sa.Column('username', sa.String(), unique=True, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('current_chapter', sa.Integer(), default=1),
        sa.Column('personality_profile', sa.JSON(), default={}),
        sa.Column('inventory', sa.JSON(), default=[]),
        sa.Column('relationships', sa.JSON(), default={}),
    )

    # 2. Migrate non-admin users back to players
    op.execute(
        sa.text("""
            INSERT INTO players (id, username, created_at, current_chapter, personality_profile, inventory, relationships)
            SELECT id, nickname, created_at, current_chapter, personality_profile, inventory, relationships
            FROM users WHERE role != 'admin'
        """)
    )

    # 3. Rename story_chapters.user_id -> player_id
    with op.batch_alter_table('story_chapters') as batch_op:
        batch_op.alter_column('user_id', new_column_name='player_id')

    # 4. Remove user_id from assets
    with op.batch_alter_table('assets') as batch_op:
        batch_op.drop_index('ix_assets_user_id')
        batch_op.drop_column('user_id')

    # 5. Remove user_id from chat_sessions
    with op.batch_alter_table('chat_sessions') as batch_op:
        batch_op.drop_index('ix_chat_sessions_user_id')
        batch_op.drop_column('user_id')

    # 6. Drop users table
    op.drop_table('users')
