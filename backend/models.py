import uuid
from sqlalchemy import Column, Integer, String, Text, ForeignKey, JSON, DateTime, Float, Boolean, BigInteger, Numeric
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
    credits = Column(Numeric(18, 4), default=0.0, nullable=False)  # 积分余额

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
    credits = Column(Numeric(18, 4), default=0.0, nullable=False)  # 积分余额

    # 存储空间
    storage_used_bytes = Column(BigInteger, default=0)              # 已用空间(字节)
    storage_quota_bytes = Column(BigInteger, default=2147483648)    # 个人配额(字节)，默认2GB，可被订阅覆盖

    # 登录追踪
    register_ip = Column(String(45), nullable=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    last_login_ip = Column(String(45), nullable=True)

    # 用户偏好
    preferred_theme = Column(String(20), default="system")     # light | dark | system
    preferred_language = Column(String(10), default="zh-CN")   # zh-CN | en-US

    # 设备信息（最近一次登录）
    last_device_type = Column(String(50), nullable=True)     # desktop / mobile / tablet
    last_os = Column(String(100), nullable=True)              # Windows 11, macOS 15 等
    last_browser = Column(String(100), nullable=True)         # Chrome 120, Safari 18 等
    last_user_agent = Column(String(500), nullable=True)      # 完整 UA 字符串

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

    # 创建此节点的 Agent（可选）
    created_by_agent_id = Column(String(36), ForeignKey("agents.id"), nullable=True)

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
    """用户媒体资源表 - 账号级别共享，跨剧场通用"""
    __tablename__ = "assets"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)        # UUID 文件名 (xxx.png)
    original_name = Column(String(255), nullable=True)     # 用户原始文件名
    file_path = Column(String(500), nullable=False)        # 存储路径 (同 filename)
    file_type = Column(String(50), nullable=True)          # image / video / audio
    mime_type = Column(String(100), nullable=True)         # image/png 等
    size = Column(Integer, nullable=True)                  # 字节数
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    duration = Column(Float, nullable=True)                # 音视频时长(秒)
    metadata_json = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


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

    # Per-model metadata: {"model_name": {"model_type": "language|image|video|audio|multimodal", "display_name": "可选别称"}}
    model_metadata = Column(JSON, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    title = Column(String, default="New Chat")
    agent_id = Column(String(36), ForeignKey("agents.id"))
    user_id = Column(String(36), nullable=True, index=True)  # 可存储用户或管理员 ID
    theater_id = Column(String(36), ForeignKey("theaters.id"), nullable=True, index=True)  # 关联画布/剧场

    # 上下文使用统计（累计 token 使用量）
    total_tokens_used = Column(BigInteger, default=0)
    last_round_tokens = Column(Integer, nullable=True)     # 上一轮实际 token 数（供应商返回），用于下轮压缩决策

    # 上下文压缩
    compressed_summary = Column(Text, nullable=True)       # 旧消息的 LLM 摘要
    compressed_before_id = Column(String(36), nullable=True)  # 此 ID 之前（含）的消息已被摘要覆盖

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


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

    # xAI 图像生成配置 (image_generation_enabled, image_config)
    xai_image_config = Column(JSON, default=dict)
    image_credit_per_image = Column(Float, default=0.0, nullable=False)

    # 统一图像生成配置（供应商无关，优先级高于 gemini_config/xai_image_config 中的图像配置）
    image_config = Column(JSON, default=dict)

    # 视频生成配置（供应商无关）
    video_config = Column(JSON, default=dict)

    # 上下文压缩配置（智能体级别）
    compaction_config = Column(JSON, default=dict)

    # 可控制的画布节点类型: ["script", "character", "storyboard", "video"]
    target_node_types = Column(JSON, default=[])

    # 工具调用轮次限制（智能体级别）
    max_tool_rounds = Column(Integer, default=100)

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

    transaction_type = Column(String(20), nullable=False)  # deduction | recharge | admin_adjust | refund
    amount = Column(Numeric(18, 4), nullable=False)          # 负数=扣费, 正数=充值
    balance_before = Column(Numeric(18, 4), nullable=False)
    balance_after = Column(Numeric(18, 4), nullable=False)

    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    metadata_json = Column(JSON, default={})  # 费率快照等扩展信息
    description = Column(Text, nullable=True)
    idempotency_key = Column(String(100), unique=True, nullable=True, index=True)  # 幂等键

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


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
    credits = Column(Numeric(18, 4), nullable=False)          # 包含积分数
    billing_period = Column(String(20), default="monthly")  # monthly | yearly | lifetime

    # Resource limits
    storage_quota_bytes = Column(BigInteger, default=2147483648)  # 存储配额(字节)，默认2GB

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


class MusicTask(Base):
    """异步音乐生成任务追踪（Lyria 3）"""
    __tablename__ = "music_tasks"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    session_id = Column(String(36), ForeignKey("chat_sessions.id"), nullable=True, index=True)
    provider_id = Column(String(36), ForeignKey("llm_providers.id"), nullable=True)
    model = Column(String(100), nullable=False)
    user_id = Column(String(36), nullable=False, index=True)

    prompt = Column(Text, nullable=False)
    lyrics = Column(Text, nullable=True)                     # 生成的歌词/结构文本
    output_format = Column(String(10), default="mp3")        # mp3 / wav
    input_image_count = Column(Integer, default=0)           # 输入参考图片数量

    status = Column(String(20), default="pending", index=True)  # pending/processing/completed/failed
    result_audio_url = Column(String(500), nullable=True)    # /api/media/{uuid}.mp3
    error_message = Column(Text, nullable=True)

    # 计费
    credit_cost = Column(Float, default=0.0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)


class AdminDebugSession(Base):
    """管理员调试会话 - 与普通用户会话完全隔离"""
    __tablename__ = "admin_debug_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    title = Column(String, default="Debug Chat")
    agent_id = Column(String(36), ForeignKey("agents.id"), nullable=False, index=True)
    admin_id = Column(String(36), ForeignKey("admins.id"), nullable=False, index=True)

    # 上下文压缩
    compressed_summary = Column(Text, nullable=True)
    compressed_before_id = Column(String(36), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class AdminDebugMessage(Base):
    """管理员调试消息 - 与 AdminDebugSession 关联"""
    __tablename__ = "admin_debug_messages"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    session_id = Column(String(36), ForeignKey("admin_debug_sessions.id"), nullable=False, index=True)
    role = Column(String)  # user, assistant, system
    content = Column(Text)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class VirtualHumanPreset(Base):
    """火山方舟预制虚拟人像"""
    __tablename__ = "virtual_human_presets"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    asset_id = Column(String(100), unique=True, nullable=False, index=True)  # 火山方舟 asset ID
    name = Column(String(100), nullable=False)
    gender = Column(String(10), nullable=False)           # male / female
    style = Column(String(50), nullable=False)             # realistic / youthful 等
    preview_url = Column(String(2000), nullable=False)     # 缩略图 URL（火山方舟签名 URL 较长）
    description = Column(String(500), default="")
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)                # 排序权重
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    @property
    def asset_uri(self) -> str:
        return f"asset://{self.asset_id}"


class ToolConfig(Base):
    """工具级别配置 — 存储工具的全局配置参数"""
    __tablename__ = "tool_configs"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    tool_name = Column(String(100), unique=True, nullable=False, index=True)  # 如 "generate_image"
    config = Column(JSON, default=dict)  # 工具特定配置
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ToolExecution(Base):
    """工具执行日志 — 记录每次工具调用的详细信息"""
    __tablename__ = "tool_executions"

    id = Column(String(36), primary_key=True, default=generate_uuid, index=True)
    tool_name = Column(String(100), nullable=False, index=True)
    provider_name = Column(String(50), nullable=False, index=True)
    agent_id = Column(String(36), ForeignKey("agents.id"), nullable=True, index=True)
    session_id = Column(String(36), nullable=True, index=True)
    user_id = Column(String(36), nullable=True, index=True)
    is_admin = Column(Boolean, default=False)
    theater_id = Column(String(36), nullable=True)
    arguments = Column(JSON, nullable=True)
    result_summary = Column(Text, nullable=True)
    status = Column(String(20), default="success", index=True)
    error_message = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
