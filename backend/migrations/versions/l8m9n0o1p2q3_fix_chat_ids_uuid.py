
"""fix chat_sessions and chat_messages ids to uuid

Revision ID: l8m9n0o1p2q3
Revises: k7l8m9n0o1p2
Create Date: 2026-03-12 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import uuid

# revision identifiers, used by Alembic.
revision: str = 'l8m9n0o1p2q3'
down_revision: Union[str, None] = '7459f2d26782'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    
    # Disable foreign keys to allow table drops and modifications
    conn.execute(sa.text("PRAGMA foreign_keys=OFF"))

    # --- Step 1: Read existing data and generate UUID mappings ---
    session_map = {}  # old_int_id -> new_uuid_str

    # Read chat_sessions
    # Check if user_id column exists (it should based on previous migrations)
    # We assume schema: id, title, agent_id, created_at, updated_at, user_id
    # Note: user_id might be null
    sessions_data = []
    try:
        rows = conn.execute(sa.text("SELECT id, title, agent_id, created_at, updated_at, user_id FROM chat_sessions")).fetchall()
        for row in rows:
            new_uuid = str(uuid.uuid4())
            session_map[row[0]] = new_uuid
            sessions_data.append({
                "id": new_uuid,
                "title": row[1],
                "agent_id": row[2],
                "created_at": row[3],
                "updated_at": row[4],
                "user_id": row[5]
            })
    except Exception as e:
        print(f"Error reading chat_sessions: {e}")
        # If table doesn't exist or schema is different, we might fail here. 
        # But we assume standard progression.

    # Read chat_messages
    messages_data = []
    try:
        rows = conn.execute(sa.text("SELECT id, session_id, role, content, created_at FROM chat_messages")).fetchall()
        for row in rows:
            new_msg_uuid = str(uuid.uuid4())
            old_session_id = row[1]
            new_session_id = session_map.get(old_session_id)
            
            # Only keep messages for sessions we know about
            if new_session_id:
                messages_data.append({
                    "id": new_msg_uuid,
                    "session_id": new_session_id,
                    "role": row[2],
                    "content": row[3],
                    "created_at": row[4]
                })
    except Exception as e:
        print(f"Error reading chat_messages: {e}")

    # --- Step 2: Drop old tables ---
    op.drop_table('chat_messages')
    op.drop_table('chat_sessions')

    # --- Step 3: Create new tables with UUID columns ---
    op.create_table('chat_sessions',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('agent_id', sa.String(36), nullable=True),
        sa.Column('user_id', sa.String(36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('chat_sessions', schema=None) as batch_op:
        batch_op.create_index('ix_chat_sessions_id', ['id'], unique=False)
        batch_op.create_index('ix_chat_sessions_user_id', ['user_id'], unique=False)

    op.create_table('chat_messages',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('session_id', sa.String(36), nullable=True),
        sa.Column('role', sa.String(), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['session_id'], ['chat_sessions.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('chat_messages', schema=None) as batch_op:
        batch_op.create_index('ix_chat_messages_id', ['id'], unique=False)
        batch_op.create_index('ix_chat_messages_session_id', ['session_id'], unique=False)

    # --- Step 4: Insert migrated data ---
    if sessions_data:
        # Use raw SQL to avoid reflection issues
        for session in sessions_data:
            conn.execute(
                sa.text("INSERT INTO chat_sessions (id, title, agent_id, user_id, created_at, updated_at) VALUES (:id, :title, :agent_id, :user_id, :created_at, :updated_at)"),
                session
            )
    
    if messages_data:
        for msg in messages_data:
            conn.execute(
                sa.text("INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES (:id, :session_id, :role, :content, :created_at)"),
                msg
            )

    # --- Step 5: Update referencing tables (task_executions, credit_transactions) ---
    # Since we can't easily bulk update with logic in SQL for this map, we do it one by one or via case statement
    # But since SQLite doesn't support FROM in UPDATE easily in older versions, and we have a map in Python...
    
    # Update task_executions
    # We check if table exists first
    has_task_executions = conn.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name='task_executions'")).fetchone()
    if has_task_executions:
        for old_sid, new_sid in session_map.items():
            # Use bind parameters to handle both string and integer IDs safely
            conn.execute(
                sa.text("UPDATE task_executions SET session_id = :new_sid WHERE session_id = :old_sid"),
                {"new_sid": new_sid, "old_sid": old_sid}
            )

    # Update credit_transactions
    has_credit_transactions = conn.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name='credit_transactions'")).fetchone()
    if has_credit_transactions:
        for old_sid, new_sid in session_map.items():
            conn.execute(
                sa.text("UPDATE credit_transactions SET session_id = :new_sid WHERE session_id = :old_sid"),
                {"new_sid": new_sid, "old_sid": old_sid}
            )

    # Re-enable foreign keys
    conn.execute(sa.text("PRAGMA foreign_keys=ON"))


def downgrade() -> None:
    # Downgrade is complicated because we lost the integer IDs (we generated new UUIDs).
    # A lossless downgrade is not possible without preserving the original integer IDs.
    # Therefore, this migration is considered irreversible.
    raise NotImplementedError(
        "Downgrade from UUID back to integer IDs is not supported for this migration. "
        "The original integer IDs were not preserved, making a lossless downgrade impossible."
    )
