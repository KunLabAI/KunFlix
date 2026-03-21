import uuid
from sqlalchemy import Column, Integer, String, Text, ForeignKey, JSON, DateTime, Float, Boolean, BigInteger
from sqlalchemy.sql import func
from database import Base

def generate_uuid():
    return str(uuid.uuid4())


class Admin(Base):
    """管理员表 - 与用户表分离"""
    __tablename__ = "admins"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    nickname = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    permission_level = Column(String(20), default="admin")  # admin | super_admin

    # Operations stats (与用户一致，用于调试积分规则)
    total_input_tokens = Column(BigInteger, default=0)
    total_output_tokens = Column(BigInteger, default=0)
    total_input_chars = Column(BigInteger, default=0)
    total_output_chars = Column(BigInteger, default=0)
    credits = Column(Float, default=0.0, nullable=False)  # 积分余额

    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_login_ip = Column(String(45), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class User(Base):
    """前端用户表"""
    __tablename__ = "users"

    # Identity
    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    nickname = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)

    # Social login (reserved for Google / GitHub OAuth)
    google_id = Column(String(255), unique=True, nullable=True)
    github_id = Column(String(255), unique=True, nullable=True)

    # Status (role 字段已废弃，将在迁移后移除)
    role = Column(String(20), default="user", index=True)  # 已废弃，保留向后兼容
    is_active = Column(Boolean, default=True)
    is_balance_frozen = Column(Boolean, default=False)  # 资金冻结状态

    # Subscription (订阅系统)
    subscription_plan_id = Column(String(36), ForeignKey("subscription_plans.id"), nullable=True)
    subscription_status = Column(String(20), default="inactive")  # inactive | active | expired
    subscription_start_at = Column(DateTime(timezone=True), nullable=True)
    subscription_end_at = Column(DateTime(timezone=True), nullable=True)

    # Operations stats
    total_input_tokens = Column(BigInteger, default=0)
    total_output_tokens = Column(BigInteger, default=0)
    total_input_chars = Column(BigInteger, default=0)
    total_output_chars = Column(BigInteger, default=0)
    credits = Column(Float, default=0.0, nullable=False)  # 积分余额
    register_ip = Column(String(45), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_login_ip = Column(String(45), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Theater(Base):
    """剧场表 - 用户创建的创意项目"""
    __tablename__ = "theaters"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False, default="未命名剧场")
    description = Column(Text, nullable=True)
    thumbnail_url = Column(String, nullable=True)
    status = Column(String(20), default="draft", index=True)  # draft | published | archived
    canvas_viewport = Column(JSON, default=dict)  # {x, y, zoom}
    settings = Column(JSON, default=dict)  # 剧场级别扩展配置
    node_count = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class TheaterNode(Base):
    """剧场节点表 - 画布上的节点"""
    __tablename__ = "theater_nodes"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    theater_id = Column(String(36), ForeignKey("theaters.id", ondelete="CASCADE"), nullable=False, index=True)
    node_type = Column(String(20), nullable=False)  # script | character | storyboard | video
    position_x = Column(Float, default=0)
    position_y = Column(Float, default=0)
    width = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    z_index = Column(Integer, default=0)
    data = Column(JSON, default=dict)  # 节点业务数据（title, content, imageUrl 等）

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class TheaterEdge(Base):
    """剧场边表 - 节点之间的连接"""
    __tablename__ = "theater_edges"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    theater_id = Column(String(36), ForeignKey("theaters.id", ondelete="CASCADE"), nullable=False, index=True)
    source_node_id = Column(String(36), ForeignKey("theater_nodes.id", ondelete="CASCADE"), nullable=False)
    target_node_id = Column(String(36), ForeignKey("theater_nodes.id", ondelete="CASCADE"), nullable=False)
    source_handle = Column(String(50), nullable=True)
    target_handle = Column(String(50), nullable=True)
    edge_type = Column(String(20), default="custom")
    animated = Column(Boolean, default=True)
    style = Column(JSON, default=dict)

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

    # Per-model API costs in USD: {"model_name": {"input": 0.125, "text_output": 0.75, ...}}
    model_costs = Column(JSON, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    title = Column(String, default="New Chat")
    agent_id = Column(String(36), ForeignKey("agents.id"))
    user_id = Column(String(36), nullable=True, index=True)  # 可存储用户或管理员 ID

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

    # Agent Type: text | image | multimodal | video
    agent_type = Column(String(20), default="text", nullable=False)

    # Parameters
    temperature = Column(Float, default=0.7)
    context_window = Column(Integer, default=4096)
    system_prompt = Column(Text)

    # Advanced Config
    tools = Column(JSON, default=[])  # List of enabled tools
    thinking_mode = Column(Boolean, default=False)

    # Credit pricing (per 1M tokens)
    input_credit_per_1m = Column(Float, default=0.0, nullable=False)   # 每1M输入tokens积分
    output_credit_per_1m = Column(Float, default=0.0, nullable=False)  # 每1M输出tokens积分
    image_output_credit_per_1m = Column(Float, default=0.0, nullable=False)  # 每1M图像输出tokens积分
    search_credit_per_query = Column(Float, default=0.0, nullable=False)     # 每次搜索查询积分

    # Video pricing (per unit)
    video_input_image_credit = Column(Float, default=0.0, nullable=False)    # 积分/张输入图片
    video_input_second_credit = Column(Float, default=0.0, nullable=False)   # 积分/秒输入视频(edit)
    video_output_480p_credit = Column(Float, default=0.0, nullable=False)    # 积分/秒480p输出
    video_output_720p_credit = Column(Float, default=0.0, nullable=False)    # 积分/秒720p输出

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
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    admin_id = Column(String(36), ForeignKey("admins.id"), nullable=True, index=True)
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


class PromptTemplate(Base):
    """提示词模板 - 用于剧场创建等场景的 AI 生成任务"""
    __tablename__ = "prompt_templates"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    
    # 模板类型: story_basic | character | scene | storyboard | custom
    template_type = Column(String(50), nullable=False, index=True)
    
    # 适用的智能体类型: text | image | multimodal
    agent_type = Column(String(20), default="text", nullable=False)
    
    # 系统提示词模板（支持 Jinja2 格式变量）
    system_prompt_template = Column(Text, nullable=False)
    
    # 用户提示词模板（可选）
    user_prompt_template = Column(Text, nullable=True)
    
    # 输出格式定义（JSON Schema 或示例）
    output_schema = Column(JSON, default=dict)
    
    # 变量定义说明，用于前端表单生成
    # [{"name": "template_name", "label": "模板名称", "type": "string", "required": true}]
    variables_schema = Column(JSON, default=list)
    
    # 关联的智能体（可选，指定默认使用哪个智能体）
    default_agent_id = Column(String(36), ForeignKey("agents.id"), nullable=True)
    
    is_active = Column(Boolean, default=True)
    is_default = Column(Boolean, default=False)  # 是否为该类型的默认模板
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class SubscriptionPlan(Base):
    """Subscription plan configuration for credit packages"""
    __tablename__ = "subscription_plans"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)

    # Pricing
    price_usd = Column(Float, nullable=False)       # 套餐价格 (USD)
    credits = Column(Float, nullable=False)          # 包含积分数
    billing_period = Column(String(20), default="monthly")  # monthly | yearly | lifetime

    # Features & display
    features = Column(JSON, default=[])              # ["特性1", "特性2", ...]
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)           # 前端排序展示

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class VideoTask(Base):
    """异步视频生成任务追踪"""
    __tablename__ = "video_tasks"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    xai_task_id = Column(String(255), index=True)           # xAI 返回的外部任务ID
    session_id = Column(String(36), ForeignKey("chat_sessions.id"), nullable=True)
    message_id = Column(String(36), ForeignKey("chat_messages.id"), nullable=True)
    provider_id = Column(String(36), ForeignKey("llm_providers.id"))
    model = Column(String, nullable=True)
    user_id = Column(String(36), index=True)

    video_mode = Column(String(20))                         # text_to_video / image_to_video / edit
    prompt = Column(Text)
    image_url = Column(String, nullable=True)               # 输入图片(image_to_video/edit)
    duration = Column(Integer, default=5)                    # 1-15秒
    quality = Column(String(10), default="720p")             # 480p / 720p
    aspect_ratio = Column(String(10), default="16:9")
    mode = Column(String(10), default="normal")              # fun / normal / spicy

    status = Column(String(20), default="pending", index=True)  # pending/processing/completed/failed
    result_video_url = Column(String, nullable=True)         # 本地存储路径
    error_message = Column(Text, nullable=True)

    # 计费相关
    input_image_count = Column(Integer, default=0)
    output_duration_seconds = Column(Float, default=0)
    credit_cost = Column(Float, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
