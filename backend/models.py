import uuid
from sqlalchemy import Column, Integer, String, Text, ForeignKey, JSON, DateTime, Float, Boolean, BigInteger
from sqlalchemy.sql import func
from database import Base

def generate_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    # Identity
    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    nickname = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)

    # Social login (reserved for Google / GitHub OAuth)
    google_id = Column(String(255), unique=True, nullable=True)
    github_id = Column(String(255), unique=True, nullable=True)

    # Role & status
    role = Column(String(20), default="user", index=True)  # "user" | "admin"
    is_active = Column(Boolean, default=True)

    # Operations stats
    total_input_tokens = Column(BigInteger, default=0)
    total_output_tokens = Column(BigInteger, default=0)
    total_input_chars = Column(BigInteger, default=0)
    total_output_chars = Column(BigInteger, default=0)
    credits = Column(Float, default=0.0, nullable=False)  # 积分余额
    register_ip = Column(String(45), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_login_ip = Column(String(45), nullable=True)

    # Game state (migrated from Player)
    current_chapter = Column(Integer, default=1)
    personality_profile = Column(JSON, default={})
    inventory = Column(JSON, default=[])
    relationships = Column(JSON, default={})  # {npc_id: {affinity, trust, hidden}}

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class StoryChapter(Base):
    __tablename__ = "story_chapters"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id"))
    chapter_number = Column(Integer)
    title = Column(String)
    content = Column(Text)  # The main text content

    # Status: pending, generating, ready, completed
    status = Column(String, default="pending")

    # Choices leading to next branches
    choices = Column(JSON, default=[])

    # Metadata for consistency check
    summary_embedding = Column(JSON)  # Vector for consistency check
    world_state_snapshot = Column(JSON)  # Snapshot of variables

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    type = Column(String)  # image, audio, voice, video
    content_hash = Column(String, index=True)  # MD5 for deduplication
    url = Column(String)
    prompt = Column(Text)

    # Cache management
    last_accessed = Column(DateTime(timezone=True), server_default=func.now())
    file_path = Column(String)


class LLMProvider(Base):
    __tablename__ = "llm_providers"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    name = Column(String, unique=True, index=True)  # e.g. "OpenAI", "DashScope"
    provider_type = Column(String)  # e.g. "openai_chat", "dashscope_chat", "post_api_chat"

    api_key = Column(String)  # Encrypted ideally, but plain for now
    base_url = Column(String, nullable=True)  # e.g. "https://api.openai.com/v1"

    models = Column(JSON, default=[])  # List of model names e.g. ["gpt-4", "gpt-3.5"]

    tags = Column(JSON, default=[])  # e.g. ["llm", "audio", "image"]

    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)

    config_json = Column(JSON, default={})  # Extra config for AgentScope

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    title = Column(String, default="New Chat")
    agent_id = Column(String(36), ForeignKey("agents.id"))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    session_id = Column(String(36), ForeignKey("chat_sessions.id"), index=True)
    role = Column(String)  # user, assistant, system
    content = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Agent(Base):
    __tablename__ = "agents"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    name = Column(String(50), unique=True, index=True)
    description = Column(String(500))

    # Provider Association
    provider_id = Column(String(36), ForeignKey("llm_providers.id"))
    model = Column(String)  # The specific model name under the provider

    # Parameters
    temperature = Column(Float, default=0.7)
    context_window = Column(Integer, default=4096)
    system_prompt = Column(Text)

    # Advanced Config
    tools = Column(JSON, default=[])  # List of enabled tools
    thinking_mode = Column(Boolean, default=False)

    # Credit pricing
    input_credit_per_1k = Column(Float, default=0.0, nullable=False)   # 每1K输入tokens积分
    output_credit_per_1k = Column(Float, default=0.0, nullable=False)  # 每1K输出tokens积分

    # Multi-Agent Orchestration (Leader Config)
    is_leader = Column(Boolean, default=False)
    coordination_modes = Column(JSON, default=[])  # ["pipeline", "plan", "discussion"]
    member_agent_ids = Column(JSON, default=[])    # UUIDs of agents this leader can orchestrate
    max_subtasks = Column(Integer, default=10)
    enable_auto_review = Column(Boolean, default=True)

    # Gemini 3.1 配置 (thinking_level, media_resolution, image_config)
    gemini_config = Column(JSON, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    @property
    def effective_thinking_level(self) -> str | None:
        """向后兼容：优先使用 gemini_config.thinking_level，否则根据 thinking_mode 返回"""
        level = (self.gemini_config or {}).get("thinking_level")
        return level or ("high" if self.thinking_mode else None)


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    agent_id = Column(String(36), ForeignKey("agents.id"), nullable=True)
    session_id = Column(String(36), ForeignKey("chat_sessions.id"), nullable=True)

    transaction_type = Column(String(20), nullable=False)  # deduction | recharge | admin_adjust
    amount = Column(Float, nullable=False)          # 负数=扣费, 正数=充值
    balance_before = Column(Float, nullable=False)
    balance_after = Column(Float, nullable=False)

    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    metadata_json = Column(JSON, default={})  # 费率快照等扩展信息
    description = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TaskExecution(Base):
    """Multi-agent task execution record"""
    __tablename__ = "task_executions"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    leader_agent_id = Column(String(36), ForeignKey("agents.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    session_id = Column(String(36), ForeignKey("chat_sessions.id"), nullable=True)

    task_description = Column(Text, nullable=False)
    coordination_mode = Column(String(20))  # auto, pipeline, plan, discussion
    status = Column(String(20), default="pending", index=True)  # pending, running, completed, failed
    result = Column(JSON)

    total_input_tokens = Column(Integer, default=0)
    total_output_tokens = Column(Integer, default=0)
    total_credit_cost = Column(Float, default=0.0)
    execution_metadata = Column(JSON, default={})

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)


class SubTask(Base):
    """Sub-task within a multi-agent task execution"""
    __tablename__ = "subtasks"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    task_execution_id = Column(String(36), ForeignKey("task_executions.id"), nullable=False, index=True)
    agent_id = Column(String(36), ForeignKey("agents.id"), nullable=False)
    parent_subtask_id = Column(String(36), ForeignKey("subtasks.id"), nullable=True)

    description = Column(Text, nullable=False)
    order_index = Column(Integer, default=0)
    status = Column(String(20), default="pending")  # pending, running, completed, failed

    input_data = Column(JSON)
    output_data = Column(JSON)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    credit_cost = Column(Float, default=0.0)

    retry_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
