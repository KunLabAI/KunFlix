"""convert player, llm_provider, agent IDs to UUID

Revision ID: a3b8c9d0e1f2
Revises: f1580ee10d5e
Create Date: 2026-02-20 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import uuid


# revision identifiers, used by Alembic.
revision: str = 'a3b8c9d0e1f2'
down_revision: Union[str, None] = 'f1580ee10d5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # --- Step 1: Read all existing data and build UUID mappings ---
    player_map = {}  # old_int_id -> new_uuid_str
    provider_map = {}
    agent_map = {}

    # Read players
    players_data = []
    for row in conn.execute(sa.text("SELECT id, username, created_at, current_chapter, personality_profile, inventory, relationships FROM players")).fetchall():
        new_uuid = str(uuid.uuid4())
        player_map[row[0]] = new_uuid
        players_data.append((new_uuid, row[1], row[2], row[3], row[4], row[5], row[6]))

    # Read llm_providers
    providers_data = []
    for row in conn.execute(sa.text("SELECT id, name, provider_type, api_key, base_url, models, tags, is_active, is_default, config_json, created_at, updated_at FROM llm_providers")).fetchall():
        new_uuid = str(uuid.uuid4())
        provider_map[row[0]] = new_uuid
        providers_data.append((new_uuid, row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11]))

    # Read agents
    agents_data = []
    for row in conn.execute(sa.text("SELECT id, name, description, provider_id, model, temperature, context_window, system_prompt, tools, thinking_mode, created_at, updated_at FROM agents")).fetchall():
        new_uuid = str(uuid.uuid4())
        agent_map[row[0]] = new_uuid
        new_provider_id = provider_map.get(row[3])
        agents_data.append((new_uuid, row[1], row[2], new_provider_id, row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11]))

    # Read story_chapters
    chapters_data = []
    for row in conn.execute(sa.text("SELECT id, player_id, chapter_number, title, content, status, choices, summary_embedding, world_state_snapshot, created_at FROM story_chapters")).fetchall():
        new_player_id = player_map.get(row[1])
        chapters_data.append((row[0], new_player_id, row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9]))

    # Read chat_sessions
    sessions_data = []
    for row in conn.execute(sa.text("SELECT id, title, agent_id, created_at, updated_at FROM chat_sessions")).fetchall():
        new_agent_id = agent_map.get(row[2])
        sessions_data.append((row[0], row[1], new_agent_id, row[3], row[4]))

    # Read chat_messages
    messages_data = []
    for row in conn.execute(sa.text("SELECT id, session_id, role, content, created_at FROM chat_messages")).fetchall():
        messages_data.append((row[0], row[1], row[2], row[3], row[4]))

    # --- Step 2: Drop all affected tables (leaf-first order) ---
    op.drop_table('chat_messages')
    op.drop_table('chat_sessions')
    op.drop_table('story_chapters')
    op.drop_table('agents')
    op.drop_table('llm_providers')
    op.drop_table('players')

    # --- Step 3: Recreate all tables with UUID columns ---
    op.create_table('players',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('current_chapter', sa.Integer(), nullable=True),
        sa.Column('personality_profile', sa.JSON(), nullable=True),
        sa.Column('inventory', sa.JSON(), nullable=True),
        sa.Column('relationships', sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('players', schema=None) as batch_op:
        batch_op.create_index('ix_players_id', ['id'], unique=False)
        batch_op.create_index('ix_players_username', ['username'], unique=True)

    op.create_table('llm_providers',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('provider_type', sa.String(), nullable=True),
        sa.Column('api_key', sa.String(), nullable=True),
        sa.Column('base_url', sa.String(), nullable=True),
        sa.Column('models', sa.JSON(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=True),
        sa.Column('config_json', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('llm_providers', schema=None) as batch_op:
        batch_op.create_index('ix_llm_providers_id', ['id'], unique=False)
        batch_op.create_index('ix_llm_providers_name', ['name'], unique=True)

    op.create_table('agents',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=True),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('provider_id', sa.String(36), nullable=True),
        sa.Column('model', sa.String(), nullable=True),
        sa.Column('temperature', sa.Float(), nullable=True),
        sa.Column('context_window', sa.Integer(), nullable=True),
        sa.Column('system_prompt', sa.Text(), nullable=True),
        sa.Column('tools', sa.JSON(), nullable=True),
        sa.Column('thinking_mode', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['provider_id'], ['llm_providers.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.create_index('ix_agents_id', ['id'], unique=False)
        batch_op.create_index('ix_agents_name', ['name'], unique=True)

    op.create_table('story_chapters',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('player_id', sa.String(36), nullable=True),
        sa.Column('chapter_number', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('choices', sa.JSON(), nullable=True),
        sa.Column('summary_embedding', sa.JSON(), nullable=True),
        sa.Column('world_state_snapshot', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('story_chapters', schema=None) as batch_op:
        batch_op.create_index('ix_story_chapters_id', ['id'], unique=False)

    op.create_table('chat_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('agent_id', sa.String(36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('chat_sessions', schema=None) as batch_op:
        batch_op.create_index('ix_chat_sessions_id', ['id'], unique=False)

    op.create_table('chat_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=True),
        sa.Column('role', sa.String(), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['session_id'], ['chat_sessions.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('chat_messages', schema=None) as batch_op:
        batch_op.create_index('ix_chat_messages_id', ['id'], unique=False)
        batch_op.create_index('ix_chat_messages_session_id', ['session_id'], unique=False)

    # --- Step 4: Re-insert existing data with UUID IDs ---
    if players_data:
        for p in players_data:
            conn.execute(sa.text(
                "INSERT INTO players (id, username, created_at, current_chapter, personality_profile, inventory, relationships) "
                "VALUES (:id, :username, :created_at, :current_chapter, :personality_profile, :inventory, :relationships)"
            ), {"id": p[0], "username": p[1], "created_at": p[2], "current_chapter": p[3],
                "personality_profile": p[4], "inventory": p[5], "relationships": p[6]})

    if providers_data:
        for p in providers_data:
            conn.execute(sa.text(
                "INSERT INTO llm_providers (id, name, provider_type, api_key, base_url, models, tags, is_active, is_default, config_json, created_at, updated_at) "
                "VALUES (:id, :name, :provider_type, :api_key, :base_url, :models, :tags, :is_active, :is_default, :config_json, :created_at, :updated_at)"
            ), {"id": p[0], "name": p[1], "provider_type": p[2], "api_key": p[3], "base_url": p[4],
                "models": p[5], "tags": p[6], "is_active": p[7], "is_default": p[8],
                "config_json": p[9], "created_at": p[10], "updated_at": p[11]})

    if agents_data:
        for a in agents_data:
            conn.execute(sa.text(
                "INSERT INTO agents (id, name, description, provider_id, model, temperature, context_window, system_prompt, tools, thinking_mode, created_at, updated_at) "
                "VALUES (:id, :name, :description, :provider_id, :model, :temperature, :context_window, :system_prompt, :tools, :thinking_mode, :created_at, :updated_at)"
            ), {"id": a[0], "name": a[1], "description": a[2], "provider_id": a[3], "model": a[4],
                "temperature": a[5], "context_window": a[6], "system_prompt": a[7],
                "tools": a[8], "thinking_mode": a[9], "created_at": a[10], "updated_at": a[11]})

    if chapters_data:
        for c in chapters_data:
            conn.execute(sa.text(
                "INSERT INTO story_chapters (id, player_id, chapter_number, title, content, status, choices, summary_embedding, world_state_snapshot, created_at) "
                "VALUES (:id, :player_id, :chapter_number, :title, :content, :status, :choices, :summary_embedding, :world_state_snapshot, :created_at)"
            ), {"id": c[0], "player_id": c[1], "chapter_number": c[2], "title": c[3], "content": c[4],
                "status": c[5], "choices": c[6], "summary_embedding": c[7], "world_state_snapshot": c[8], "created_at": c[9]})

    if sessions_data:
        for s in sessions_data:
            conn.execute(sa.text(
                "INSERT INTO chat_sessions (id, title, agent_id, created_at, updated_at) "
                "VALUES (:id, :title, :agent_id, :created_at, :updated_at)"
            ), {"id": s[0], "title": s[1], "agent_id": s[2], "created_at": s[3], "updated_at": s[4]})

    if messages_data:
        for m in messages_data:
            conn.execute(sa.text(
                "INSERT INTO chat_messages (id, session_id, role, content, created_at) "
                "VALUES (:id, :session_id, :role, :content, :created_at)"
            ), {"id": m[0], "session_id": m[1], "role": m[2], "content": m[3], "created_at": m[4]})


def downgrade() -> None:
    # Downgrade is destructive - UUID values cannot be mapped back to original integers.
    # Drop all affected tables and recreate with Integer IDs.
    op.drop_table('chat_messages')
    op.drop_table('chat_sessions')
    op.drop_table('story_chapters')
    op.drop_table('agents')
    op.drop_table('llm_providers')
    op.drop_table('players')

    op.create_table('players',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('current_chapter', sa.Integer(), nullable=True),
        sa.Column('personality_profile', sa.JSON(), nullable=True),
        sa.Column('inventory', sa.JSON(), nullable=True),
        sa.Column('relationships', sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('players', schema=None) as batch_op:
        batch_op.create_index('ix_players_id', ['id'], unique=False)
        batch_op.create_index('ix_players_username', ['username'], unique=True)

    op.create_table('llm_providers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('provider_type', sa.String(), nullable=True),
        sa.Column('api_key', sa.String(), nullable=True),
        sa.Column('base_url', sa.String(), nullable=True),
        sa.Column('models', sa.JSON(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=True),
        sa.Column('config_json', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('llm_providers', schema=None) as batch_op:
        batch_op.create_index('ix_llm_providers_id', ['id'], unique=False)
        batch_op.create_index('ix_llm_providers_name', ['name'], unique=True)

    op.create_table('agents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=True),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('provider_id', sa.Integer(), nullable=True),
        sa.Column('model', sa.String(), nullable=True),
        sa.Column('temperature', sa.Float(), nullable=True),
        sa.Column('context_window', sa.Integer(), nullable=True),
        sa.Column('system_prompt', sa.Text(), nullable=True),
        sa.Column('tools', sa.JSON(), nullable=True),
        sa.Column('thinking_mode', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['provider_id'], ['llm_providers.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.create_index('ix_agents_id', ['id'], unique=False)
        batch_op.create_index('ix_agents_name', ['name'], unique=True)

    op.create_table('story_chapters',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('player_id', sa.Integer(), nullable=True),
        sa.Column('chapter_number', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('choices', sa.JSON(), nullable=True),
        sa.Column('summary_embedding', sa.JSON(), nullable=True),
        sa.Column('world_state_snapshot', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['player_id'], ['players.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('story_chapters', schema=None) as batch_op:
        batch_op.create_index('ix_story_chapters_id', ['id'], unique=False)

    op.create_table('chat_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('agent_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('chat_sessions', schema=None) as batch_op:
        batch_op.create_index('ix_chat_sessions_id', ['id'], unique=False)

    op.create_table('chat_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=True),
        sa.Column('role', sa.String(), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['session_id'], ['chat_sessions.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('chat_messages', schema=None) as batch_op:
        batch_op.create_index('ix_chat_messages_id', ['id'], unique=False)
        batch_op.create_index('ix_chat_messages_session_id', ['session_id'], unique=False)
