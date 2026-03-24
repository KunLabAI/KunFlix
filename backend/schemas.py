from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator
from typing import Optional, Dict, Any, List, Literal
from datetime import datetime


# 画布节点类型常量
NODE_TYPES = {"script", "character", "storyboard", "video"}


# ---------------------------------------------------------------------------
# Auth schemas (用户)
# ---------------------------------------------------------------------------
class UserRegister(BaseModel):
    email: EmailStr
    nickname: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenRefresh(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: str
    email: str
    nickname: str
    role: str = "user"  # 已废弃，保留向后兼容
    is_active: bool = True
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_input_chars: int = 0
    total_output_chars: int = 0
    credits: float = 0.0
    # 订阅信息
    subscription_plan_id: Optional[str] = None
    subscription_status: str = "inactive"
    subscription_start_at: Optional[Any] = None
    subscription_end_at: Optional[Any] = None
    last_login_at: Optional[Any] = None
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


# ---------------------------------------------------------------------------
# Admin schemas (管理员)
# ---------------------------------------------------------------------------
class AdminLogin(BaseModel):
    email: EmailStr
    password: str


class AdminCreate(BaseModel):
    email: EmailStr
    nickname: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=6)
    permission_level: str = "admin"


class AdminUpdate(BaseModel):
    nickname: Optional[str] = Field(None, min_length=1, max_length=100)
    password: Optional[str] = Field(None, min_length=6)
    permission_level: Optional[str] = None
    is_active: Optional[bool] = None


class AdminResponse(BaseModel):
    id: str
    email: str
    nickname: str
    permission_level: str
    is_active: bool = True
    credits: float = 0.0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_input_chars: int = 0
    total_output_chars: int = 0
    last_login_at: Optional[Any] = None
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class AdminTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    admin: AdminResponse


# ---------------------------------------------------------------------------
# Subscription assign schema (订阅设置)
# ---------------------------------------------------------------------------
class SubscriptionAssignRequest(BaseModel):
    plan_id: str
    start_at: datetime
    end_at: datetime
    auto_grant_credits: bool = False


# ---------------------------------------------------------------------------
# LLM Provider schemas
# ---------------------------------------------------------------------------
class LLMProviderBase(BaseModel):
    name: str
    provider_type: str
    api_key: str
    base_url: Optional[str] = None
    models: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    is_active: bool = True
    is_default: bool = False
    config_json: Dict[str, Any] = {}
    model_costs: Dict[str, Dict[str, float]] = Field(default_factory=dict)  # Per-model API costs (USD)


class LLMProviderCreate(LLMProviderBase):
    pass


class LLMProviderUpdate(BaseModel):
    name: Optional[str] = None
    provider_type: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    models: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    config_json: Optional[Dict[str, Any]] = None
    model_costs: Optional[Dict[str, Dict[str, float]]] = None


class LLMProviderResponse(LLMProviderBase):
    id: str
    created_at: Any
    updated_at: Any

    model_config = ConfigDict(from_attributes=True)


class TestConnectionRequest(BaseModel):
    provider_type: str
    api_key: str
    base_url: Optional[str] = None
    model: str
    config_json: Optional[Dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Gemini 3.1 配置 schemas
# ---------------------------------------------------------------------------
class GeminiImageConfig(BaseModel):
    """Gemini 图片生成配置"""
    aspect_ratio: Optional[Literal["auto", "16:9", "4:3", "1:1", "3:4", "9:16"]] = None
    image_size: Optional[Literal["4K", "2K", "1024", "512", "auto"]] = None
    output_format: Optional[Literal["png", "jpeg", "webp"]] = None  # 输出格式
    batch_count: Optional[int] = Field(None, ge=1, le=8)  # 批量生成数量 (1-8)
    # 参考图片数量限制配置
    max_person_images: Optional[int] = Field(None, ge=0, le=4)  # 角色参考图片最大数量 (0-4)
    max_object_images: Optional[int] = Field(None, ge=0, le=10)  # 高保真对象图片最大数量 (0-10)


class GeminiConfig(BaseModel):
    """Gemini 3.1 配置 (thinking_level, media_resolution, image_config)"""
    thinking_level: Optional[Literal["high", "medium", "low", "minimal"]] = None
    media_resolution: Optional[Literal["ultra_high", "high", "medium", "low"]] = None
    image_generation_enabled: bool = False  # 图片生成开关
    image_config: Optional[GeminiImageConfig] = None
    google_search_enabled: bool = False  # Google 搜索开关
    google_image_search_enabled: bool = False  # Google 图片搜索开关


# ---------------------------------------------------------------------------
# Agent schemas
# ---------------------------------------------------------------------------
class AgentBase(BaseModel):
    name: str = Field(..., max_length=50)
    description: str = Field(..., max_length=500)
    provider_id: str
    model: str
    agent_type: Literal["text", "image", "multimodal", "video"] = Field(default="text")
    temperature: float = Field(default=0.7, ge=0.0, le=1.0)
    context_window: int = Field(default=4096, ge=4096, le=262144)
    system_prompt: str
    tools: List[str] = Field(default_factory=list)
    thinking_mode: bool = False
    input_credit_per_1m: float = Field(default=0.0, ge=0.0)
    output_credit_per_1m: float = Field(default=0.0, ge=0.0)
    image_output_credit_per_1m: float = Field(default=0.0, ge=0.0)
    search_credit_per_query: float = Field(default=0.0, ge=0.0)
    # Video pricing (per unit)
    video_input_image_credit: float = Field(default=0.0, ge=0.0)
    video_input_second_credit: float = Field(default=0.0, ge=0.0)
    video_output_480p_credit: float = Field(default=0.0, ge=0.0)
    video_output_720p_credit: float = Field(default=0.0, ge=0.0)
    # Leader configuration
    is_leader: bool = False
    coordination_modes: List[str] = Field(default_factory=list)  # ["pipeline", "plan", "discussion"]
    member_agent_ids: List[str] = Field(default_factory=list)
    max_subtasks: int = Field(default=10, ge=1, le=20)
    enable_auto_review: bool = True
    # Gemini 3.1 配置
    gemini_config: Optional[GeminiConfig] = None
    # 可控制的画布节点类型
    target_node_types: List[str] = Field(default_factory=list)

    @field_validator('target_node_types', mode='before')
    @classmethod
    def validate_node_types(cls, v):
        v = v or []
        invalid = set(v) - NODE_TYPES
        assert not invalid, f"Invalid node types: {invalid}. Must be in {NODE_TYPES}"
        return v


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = Field(None, max_length=500)
    provider_id: Optional[str] = None
    model: Optional[str] = None
    agent_type: Optional[Literal["text", "image", "multimodal", "video"]] = None
    temperature: Optional[float] = Field(None, ge=0.0, le=1.0)
    context_window: Optional[int] = Field(None, ge=4096, le=262144)
    system_prompt: Optional[str] = None
    tools: Optional[List[str]] = None
    thinking_mode: Optional[bool] = None
    input_credit_per_1m: Optional[float] = Field(None, ge=0.0)
    output_credit_per_1m: Optional[float] = Field(None, ge=0.0)
    image_output_credit_per_1m: Optional[float] = Field(None, ge=0.0)
    search_credit_per_query: Optional[float] = Field(None, ge=0.0)
    # Video pricing
    video_input_image_credit: Optional[float] = Field(None, ge=0.0)
    video_input_second_credit: Optional[float] = Field(None, ge=0.0)
    video_output_480p_credit: Optional[float] = Field(None, ge=0.0)
    video_output_720p_credit: Optional[float] = Field(None, ge=0.0)
    # Leader configuration
    is_leader: Optional[bool] = None
    coordination_modes: Optional[List[str]] = None
    member_agent_ids: Optional[List[str]] = None
    max_subtasks: Optional[int] = Field(None, ge=1, le=20)
    enable_auto_review: Optional[bool] = None
    # Gemini 3.1 配置
    gemini_config: Optional[GeminiConfig] = None
    # 可控制的画布节点类型
    target_node_types: Optional[List[str]] = None

    @field_validator('target_node_types', mode='before')
    @classmethod
    def validate_node_types(cls, v):
        v = v or []
        invalid = set(v) - NODE_TYPES
        assert not invalid, f"Invalid node types: {invalid}. Must be in {NODE_TYPES}"
        return v


class AgentResponse(AgentBase):
    id: str
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator('coordination_modes', 'member_agent_ids', 'tools', 'target_node_types', mode='before')
    @classmethod
    def none_to_list(cls, v):
        return v or []

    @field_validator('gemini_config', mode='before')
    @classmethod
    def none_to_gemini_config(cls, v):
        return v or None


# ---------------------------------------------------------------------------
# Chat schemas
# ---------------------------------------------------------------------------
class ChatSessionBase(BaseModel):
    title: str = "New Chat"
    agent_id: str
    theater_id: Optional[str] = None  # 关联画布/剧场


class ChatSessionCreate(ChatSessionBase):
    pass


class ChatSessionResponse(ChatSessionBase):
    id: str
    user_id: Optional[str] = None
    theater_id: Optional[str] = None
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class ChatMessageBase(BaseModel):
    role: str
    content: Any  # str 或 List[Dict] (多模态消息: [{type: "text", text: "..."}, {type: "image_url", ...}])


class ChatMessageCreate(ChatMessageBase):
    edit_last_image: bool = False
    theater_id: Optional[str] = None  # 画布上下文，用于启用画布工具


class ChatMessageResponse(ChatMessageBase):
    id: str
    session_id: str
    created_at: Any

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Credit schemas
# ---------------------------------------------------------------------------
class CreditTransactionResponse(BaseModel):
    id: str
    user_id: str
    agent_id: Optional[str] = None
    session_id: Optional[str] = None
    transaction_type: str
    amount: float
    balance_before: float
    balance_after: float
    input_tokens: int = 0
    output_tokens: int = 0
    metadata_json: Optional[Dict[str, Any]] = None
    description: Optional[str] = None
    created_at: Any

    model_config = ConfigDict(from_attributes=True)


class CreditAdjustRequest(BaseModel):
    amount: float
    description: str = ""


# ---------------------------------------------------------------------------
# Orchestration schemas
# ---------------------------------------------------------------------------
class OrchestrationOptions(BaseModel):
    max_iterations: int = Field(default=3, ge=1, le=10)
    enable_review: bool = True


class OrchestrationRequest(BaseModel):
    task_description: str = Field(..., min_length=1, max_length=5000)
    leader_agent_id: str
    session_id: Optional[str] = None
    theater_id: Optional[str] = None  # 画布上下文，用于启用画布工具
    coordination_mode: str = Field(default="auto")  # auto, pipeline, plan, discussion
    options: OrchestrationOptions = Field(default_factory=OrchestrationOptions)


class SubTaskResponse(BaseModel):
    id: str
    task_execution_id: str
    agent_id: str
    parent_subtask_id: Optional[str] = None
    description: str
    order_index: int = 0
    status: str
    input_data: Optional[Dict[str, Any]] = None
    output_data: Optional[Dict[str, Any]] = None
    input_tokens: int = 0
    output_tokens: int = 0
    credit_cost: float = 0.0
    retry_count: int = 0
    error_message: Optional[str] = None
    created_at: Any
    completed_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class TaskExecutionResponse(BaseModel):
    id: str
    leader_agent_id: str
    user_id: str
    session_id: Optional[str] = None
    task_description: str
    coordination_mode: Optional[str] = None
    status: str
    result: Optional[Dict[str, Any]] = None
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_credit_cost: float = 0.0
    execution_metadata: Optional[Dict[str, Any]] = None
    subtasks: List[SubTaskResponse] = Field(default_factory=list)
    created_at: Any
    completed_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Subscription Plan schemas
# ---------------------------------------------------------------------------
class SubscriptionPlanBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    price_usd: float = Field(..., gt=0)
    credits: float = Field(..., gt=0)
    billing_period: Literal["monthly", "yearly", "lifetime"] = "monthly"
    features: List[str] = Field(default_factory=list)
    is_active: bool = True
    sort_order: int = 0


class SubscriptionPlanCreate(SubscriptionPlanBase):
    pass


class SubscriptionPlanUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    price_usd: Optional[float] = Field(None, gt=0)
    credits: Optional[float] = Field(None, gt=0)
    billing_period: Optional[Literal["monthly", "yearly", "lifetime"]] = None
    features: Optional[List[str]] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class SubscriptionPlanResponse(SubscriptionPlanBase):
    id: str
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Batch Image Generation schemas
# ---------------------------------------------------------------------------
class BatchImageConfigRequest(BaseModel):
    """批量图片生成配置"""
    aspect_ratio: Literal["auto", "16:9", "4:3", "1:1", "3:4", "9:16"] = "1:1"
    image_size: Literal["4K", "2K", "1024", "512", "auto"] = "2K"
    output_format: Literal["png", "jpeg", "webp"] = "png"
    google_search_enabled: bool = False
    google_image_search_enabled: bool = False


class BatchImageGenerateRequest(BaseModel):
    """批量图片生成请求"""
    agent_id: str  # 使用指定智能体的配置（API key、模型等）
    prompts: List[str] = Field(..., min_length=1, max_length=8)
    config: Optional[BatchImageConfigRequest] = None
    max_concurrent: int = Field(default=4, ge=1, le=8)


class SingleImageResultResponse(BaseModel):
    """单张图片生成结果"""
    prompt_index: int
    prompt: str
    success: bool
    image_url: Optional[str] = None
    text_response: Optional[str] = None
    input_tokens: int = 0
    output_tokens: int = 0
    error: Optional[str] = None


class BatchImageGenerateResponse(BaseModel):
    """批量图片生成响应"""
    success: bool
    total_prompts: int
    completed: int
    failed: int
    results: List[SingleImageResultResponse]


# ---------------------------------------------------------------------------
# Prompt Template schemas
# ---------------------------------------------------------------------------
class PromptTemplateVariable(BaseModel):
    """模板变量定义"""
    name: str
    label: str
    type: Literal["string", "number", "boolean", "select", "textarea"] = "string"
    required: bool = True
    options: Optional[List[str]] = None  # 用于 select 类型
    default: Optional[Any] = None
    description: Optional[str] = None


class PromptTemplateBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    template_type: str = Field(..., min_length=1, max_length=50)  # story_basic | character | scene | storyboard | custom
    agent_type: Literal["text", "image", "multimodal", "video"] = Field(default="text")
    system_prompt_template: str = Field(..., min_length=1)
    user_prompt_template: Optional[str] = None
    output_schema: Dict[str, Any] = Field(default_factory=dict)
    variables_schema: List[PromptTemplateVariable] = Field(default_factory=list)
    default_agent_id: Optional[str] = None
    is_active: bool = True
    is_default: bool = False


class PromptTemplateCreate(PromptTemplateBase):
    pass


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    template_type: Optional[str] = Field(None, min_length=1, max_length=50)
    agent_type: Optional[Literal["text", "image", "multimodal", "video"]] = None
    system_prompt_template: Optional[str] = None
    user_prompt_template: Optional[str] = None
    output_schema: Optional[Dict[str, Any]] = None
    variables_schema: Optional[List[PromptTemplateVariable]] = None
    default_agent_id: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class PromptTemplateResponse(PromptTemplateBase):
    id: str
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# AI Generation schemas (for theater creation)
# ---------------------------------------------------------------------------
class AIGenerateRequest(BaseModel):
    """AI 生成请求"""
    template_id: str  # 使用哪个提示词模板
    variables: Dict[str, Any] = Field(default_factory=dict)  # 模板变量值
    agent_id: Optional[str] = None  # 可选：指定智能体（覆盖模板的 default_agent_id）


class AIGenerateResponse(BaseModel):
    """AI 生成响应"""
    success: bool
    data: Dict[str, Any]  # 根据模板 output_schema 生成的数据
    tokens_used: Dict[str, int] = Field(default_factory=dict)
    credit_cost: float = 0.0


# ---------------------------------------------------------------------------
# Video Generation schemas
# ---------------------------------------------------------------------------
class VideoConfig(BaseModel):
    """视频生成配置"""
    duration: int = Field(default=6, ge=1, le=15)
    quality: Literal["480p", "720p", "768p", "1080p"] = "720p"
    aspect_ratio: str = "16:9"
    mode: str = "normal"  # 保留字段兼容前端，部分 API 不使用
    # MiniMax 特有配置
    prompt_optimizer: bool = True  # 自动优化提示词
    fast_pretreatment: bool = False  # 快速预处理


class VideoGenerateRequest(BaseModel):
    """视频生成请求"""
    provider_id: str
    model: str
    session_id: Optional[str] = None
    video_mode: Literal["text_to_video", "image_to_video", "edit"] = "text_to_video"
    prompt: str = Field(..., min_length=1, max_length=2000)
    image_url: Optional[str] = None  # 首帧图片 (image_to_video/edit)
    last_frame_image: Optional[str] = None  # 尾帧图片 (MiniMax-Hailuo-02 支持)
    config: Optional[VideoConfig] = None


class VideoTaskResponse(BaseModel):
    """视频任务响应"""
    id: str
    xai_task_id: str = ""
    status: str
    video_mode: str = ""
    prompt: str = ""
    duration: int = 5
    quality: str = "720p"
    aspect_ratio: str = "16:9"
    video_url: Optional[str] = None
    credit_cost: float = 0.0
    error_message: Optional[str] = None
    provider_id: str = ""
    provider_name: Optional[str] = None
    model: str = ""
    user_id: str = ""
    image_url: Optional[str] = None
    created_at: Any
    completed_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator('video_url', mode='before')
    @classmethod
    def map_result_video_url(cls, v, info):
        """兼容数据库字段名 result_video_url"""
        return v


class VideoTaskListResponse(BaseModel):
    """视频任务分页列表响应"""
    items: List[VideoTaskResponse]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Theater schemas (剧场系统)
# ---------------------------------------------------------------------------
class TheaterNodeCreate(BaseModel):
    """创建/保存画布节点"""
    id: Optional[str] = None
    node_type: str
    position_x: float = 0
    position_y: float = 0
    width: Optional[float] = None
    height: Optional[float] = None
    z_index: int = 0
    data: Dict[str, Any] = Field(default_factory=dict)


class TheaterNodeUpdate(BaseModel):
    """更新节点（所有字段可选）"""
    node_type: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    z_index: Optional[int] = None
    data: Optional[Dict[str, Any]] = None


class TheaterNodeResponse(BaseModel):
    """节点响应"""
    id: str
    theater_id: str
    node_type: str
    position_x: float = 0
    position_y: float = 0
    width: Optional[float] = None
    height: Optional[float] = None
    z_index: int = 0
    data: Dict[str, Any] = Field(default_factory=dict)
    created_by_agent_id: Optional[str] = None
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class TheaterEdgeCreate(BaseModel):
    """创建/保存画布边"""
    id: Optional[str] = None
    source_node_id: str
    target_node_id: str
    source_handle: Optional[str] = None
    target_handle: Optional[str] = None
    edge_type: str = "custom"
    animated: bool = True
    style: Dict[str, Any] = Field(default_factory=dict)


class TheaterEdgeResponse(BaseModel):
    """边响应"""
    id: str
    theater_id: str
    source_node_id: str
    target_node_id: str
    source_handle: Optional[str] = None
    target_handle: Optional[str] = None
    edge_type: str = "custom"
    animated: bool = True
    style: Dict[str, Any] = Field(default_factory=dict)
    created_at: Any

    model_config = ConfigDict(from_attributes=True)


class TheaterCreate(BaseModel):
    """创建剧场"""
    title: str = Field(default="未命名剧场", max_length=200)
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    status: Literal["draft", "published", "archived"] = "draft"
    canvas_viewport: Dict[str, Any] = Field(default_factory=dict)
    settings: Dict[str, Any] = Field(default_factory=dict)


class TheaterUpdate(BaseModel):
    """更新剧场（所有字段可选）"""
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    status: Optional[Literal["draft", "published", "archived"]] = None
    canvas_viewport: Optional[Dict[str, Any]] = None
    settings: Optional[Dict[str, Any]] = None


class TheaterResponse(BaseModel):
    """剧场响应"""
    id: str
    user_id: str
    title: str
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    status: str = "draft"
    canvas_viewport: Dict[str, Any] = Field(default_factory=dict)
    settings: Dict[str, Any] = Field(default_factory=dict)
    node_count: int = 0
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class TheaterDetailResponse(TheaterResponse):
    """剧场详情响应（含节点和边）"""
    nodes: List[TheaterNodeResponse] = Field(default_factory=list)
    edges: List[TheaterEdgeResponse] = Field(default_factory=list)


class TheaterListResponse(BaseModel):
    """剧场分页列表响应"""
    items: List[TheaterResponse]
    total: int
    page: int
    page_size: int


class TheaterSaveRequest(BaseModel):
    """画布保存请求（全量同步）"""
    nodes: List[TheaterNodeCreate] = Field(default_factory=list)
    edges: List[TheaterEdgeCreate] = Field(default_factory=list)
    canvas_viewport: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Admin Debug Session schemas (管理员调试会话 - 与用户会话隔离)
# ---------------------------------------------------------------------------
class AdminDebugSessionBase(BaseModel):
    title: str = "Debug Chat"
    agent_id: str


class AdminDebugSessionCreate(AdminDebugSessionBase):
    pass


class AdminDebugSessionResponse(AdminDebugSessionBase):
    id: str
    admin_id: str
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class AdminDebugMessageBase(BaseModel):
    role: str
    content: Any  # str 或 List[Dict] (多模态消息)


class AdminDebugMessageCreate(AdminDebugMessageBase):
    edit_last_image: bool = False


class AdminDebugMessageResponse(AdminDebugMessageBase):
    id: str
    session_id: str
    created_at: Any

    model_config = ConfigDict(from_attributes=True)

