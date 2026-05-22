from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator, model_validator
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
    # 邮件验证一次性凭证（来自 /api/auth/email-code/verify, purpose=register）
    # 服务端依据 settings.EMAIL_VERIFICATION_REQUIRED 决定是否强校验，缺省宽松。
    verify_token: Optional[str] = None


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
    # 存储空间
    storage_used_bytes: int = 0
    storage_quota_bytes: int = 2147483648

    @field_validator("storage_used_bytes", "storage_quota_bytes", mode="before")
    @classmethod
    def _coerce_storage(cls, v: Any, info: Any) -> int:
        defaults = {"storage_used_bytes": 0, "storage_quota_bytes": 2147483648}
        return v if v is not None else defaults.get(info.field_name, 0)
    # 订阅信息
    subscription_plan_id: Optional[str] = None
    subscription_plan_name: Optional[str] = None       # join 自 subscription_plans.name，供前端展示
    subscription_tier_type: Optional[str] = None       # 'free_tier' | 'paid'，前端标签着色依据
    subscription_status: str = "inactive"
    subscription_start_at: Optional[Any] = None
    subscription_end_at: Optional[Any] = None
    # 登录追踪
    register_ip: Optional[str] = None
    last_login_ip: Optional[str] = None
    last_login_at: Optional[Any] = None
    # 设备信息
    last_device_type: Optional[str] = None
    last_os: Optional[str] = None
    last_browser: Optional[str] = None
    # 用户偏好
    preferred_theme: str = "system"
    preferred_language: str = "zh-CN"
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class UserPreferencesUpdate(BaseModel):
    preferred_theme: Optional[str] = None
    preferred_language: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class AccessTokenResponse(BaseModel):
    access_token: str
    # 一次性轮换模式下同步回传新的 refresh_token；未轮换的接口可省略
    refresh_token: Optional[str] = None
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
    model_metadata: Dict[str, Dict[str, str]] = Field(default_factory=dict)  # Per-model metadata (type & display_name)


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
    model_metadata: Optional[Dict[str, Dict[str, str]]] = None


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
# xAI 图像生成配置 schemas
# ---------------------------------------------------------------------------
class XAIImageConfig(BaseModel):
    """xAI 图像生成参数配置"""
    aspect_ratio: Optional[Literal[
        "1:1", "16:9", "9:16", "4:3", "3:4",
        "3:2", "2:3", "2:1", "1:2",
        "19.5:9", "9:19.5", "20:9", "9:20", "auto"
    ]] = None
    resolution: Optional[Literal["1k", "2k"]] = None
    n: Optional[int] = Field(None, ge=1, le=10)
    response_format: Optional[Literal["url", "b64_json"]] = None


class XAIImageGenConfig(BaseModel):
    """xAI 图像生成 Agent 级配置"""
    image_generation_enabled: bool = False
    image_config: Optional[XAIImageConfig] = None


# ---------------------------------------------------------------------------
# Unified Image Config schemas (provider-agnostic)
# ---------------------------------------------------------------------------
class UnifiedImageConfig(BaseModel):
    """统一图像生成参数（供应商无关）"""
    aspect_ratio: Optional[str] = None  # "1:1","16:9","9:16","4:3","3:4","3:2","2:3" 等
    quality: Optional[Literal["standard", "hd", "ultra"]] = None
    batch_count: Optional[int] = Field(None, ge=1, le=10)
    output_format: Optional[Literal["png", "jpeg", "webp"]] = None


class UnifiedImageGenConfig(BaseModel):
    """统一图像生成 Agent 级配置"""
    image_generation_enabled: bool = False
    image_provider_id: Optional[str] = None   # 图像生成供应商 ID（跨 Provider 支持）
    image_model: Optional[str] = None          # 图像生成模型名
    image_config: Optional[UnifiedImageConfig] = None


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
    context_window: int = Field(default=4096, ge=4096, le=1048576)
    system_prompt: str
    tools: List[str] = Field(default_factory=list)
    thinking_mode: bool = False
    # Credit pricing 已迁移至 ModelPricing 表（按 provider_id+model 维度）
    # Leader configuration
    is_leader: bool = False
    coordination_modes: List[str] = Field(default_factory=list)  # ["pipeline", "plan", "discussion"]
    member_agent_ids: List[str] = Field(default_factory=list)
    max_subtasks: int = Field(default=10, ge=1, le=20)
    enable_auto_review: bool = True
    # Gemini 3.1 配置
    gemini_config: Optional[GeminiConfig] = None
    # xAI 图像生成配置
    xai_image_config: Optional[XAIImageGenConfig] = None
    # 统一图像生成配置（供应商无关）
    image_config: Optional[UnifiedImageGenConfig] = None
    # 视频生成配置（供应商无关）
    video_config: Optional[dict] = None
    # 上下文压缩配置
    compaction_config: Optional[dict] = None
    # 对话标题自动生成配置
    title_gen_config: Optional[dict] = None
    # 可控制的画布节点类型
    target_node_types: List[str] = Field(default_factory=list)
    # 工具调用轮次限制
    max_tool_rounds: int = Field(default=100, ge=10, le=200)

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
    context_window: Optional[int] = Field(None, ge=4096, le=1048576)
    system_prompt: Optional[str] = None
    tools: Optional[List[str]] = None
    thinking_mode: Optional[bool] = None
    # Credit pricing 已迁移至 ModelPricing 表（按 provider_id+model 维度）
    # Leader configuration
    is_leader: Optional[bool] = None
    coordination_modes: Optional[List[str]] = None
    member_agent_ids: Optional[List[str]] = None
    max_subtasks: Optional[int] = Field(None, ge=1, le=20)
    enable_auto_review: Optional[bool] = None
    # Gemini 3.1 配置
    gemini_config: Optional[GeminiConfig] = None
    # xAI 图像生成配置
    xai_image_config: Optional[XAIImageGenConfig] = None
    # 统一图像生成配置（供应商无关）
    image_config: Optional[UnifiedImageGenConfig] = None
    # 视频生成配置（供应商无关）
    video_config: Optional[dict] = None
    # 上下文压缩配置
    compaction_config: Optional[dict] = None
    # 对话标题自动生成配置
    title_gen_config: Optional[dict] = None
    # 可控制的画布节点类型
    target_node_types: Optional[List[str]] = None
    # 工具调用轮次限制
    max_tool_rounds: Optional[int] = Field(default=None, ge=10, le=200)

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

    @field_validator('gemini_config', 'xai_image_config', 'image_config', mode='before')
    @classmethod
    def none_to_provider_config(cls, v):
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


class ChatSessionUpdate(BaseModel):
    agent_id: Optional[str] = None
    title: Optional[str] = None


class ChatSessionResponse(ChatSessionBase):
    id: str
    # agent_id 在数据库为 nullable（ondelete="SET NULL"）：
    # 当关联 Agent 被删除后，旧会话的 agent_id 会被置为 NULL，
    # 响应侧必须允许 None，否则触发 ResponseValidationError → 500。
    agent_id: Optional[str] = None
    user_id: Optional[str] = None
    theater_id: Optional[str] = None
    total_tokens_used: int = 0  # 累计 token 使用量
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class ChatMessageBase(BaseModel):
    role: str
    content: Any  # str 或 List[Dict] (多模态消息: [{type: "text", text: "..."}, {type: "image_url", ...}])


class ChatMessageCreate(ChatMessageBase):
    edit_last_image: bool = False
    theater_id: Optional[str] = None  # 画布上下文，用于启用画布工具
    target_node_id: Optional[str] = None  # 指定更新的画布节点 ID（编辑模式）
    edit_image_url: Optional[str] = None  # 来自画布节点的图片 URL（编辑模式）


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
    idempotency_key: Optional[str] = None
    created_at: Any

    model_config = ConfigDict(from_attributes=True)


class CreditAdjustRequest(BaseModel):
    amount: float
    description: str = ""


class CreditRefundRequest(BaseModel):
    amount: float
    transaction_id: Optional[str] = None  # 关联的原始交易ID
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
    tier_type: Literal["free_tier", "paid"] = "paid"
    price_usd: float = Field(..., ge=0)  # 0 表示 Free 套餐
    credits: float = Field(..., gt=0)
    billing_period: Literal["monthly", "yearly", "lifetime"] = "monthly"
    features: List[str] = Field(default_factory=list)
    is_active: bool = True
    sort_order: int = 0
    storage_quota_bytes: int = 2147483648  # 默认 2GB

    @model_validator(mode="after")
    def _enforce_tier_price_consistency(self) -> "SubscriptionPlanBase":
        # free_tier 必须 price_usd=0；paid 必须 price_usd>0
        # 避免“注册套餐”被设置为付费或反之的语义冲突
        if self.tier_type == "free_tier" and self.price_usd != 0:
            raise ValueError("free_tier plan must have price_usd == 0")
        if self.tier_type == "paid" and self.price_usd <= 0:
            raise ValueError("paid plan must have price_usd > 0")
        return self


class SubscriptionPlanCreate(SubscriptionPlanBase):
    pass


class SubscriptionPlanUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    tier_type: Optional[Literal["free_tier", "paid"]] = None
    price_usd: Optional[float] = Field(None, ge=0)  # 0 表示 Free 套餐
    credits: Optional[float] = Field(None, gt=0)
    billing_period: Optional[Literal["monthly", "yearly", "lifetime"]] = None
    features: Optional[List[str]] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    storage_quota_bytes: Optional[int] = None


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
    template_type: str = Field(..., min_length=1, max_length=12)
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
    template_type: Optional[str] = Field(None, min_length=1, max_length=12)
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
    video_mode: Literal["text_to_video", "image_to_video", "edit", "reference_images", "video_extension"] = "text_to_video"
    prompt: str = Field(..., min_length=1, max_length=2000)
    image_url: Optional[str] = None  # 首帧图片 (image_to_video/edit)
    last_frame_image: Optional[str] = None  # 尾帧图片 (MiniMax-Hailuo-02 / Seedance 2.0 支持)
    reference_images: Optional[List[dict]] = None  # 参考图片列表 (Grok/Gemini Veo 3.1/Seedance 2.0)
    extension_video_url: Optional[str] = None  # 视频扩展源视频 URL (向后兼容)
    reference_videos: Optional[List[dict]] = None  # 参考视频列表 (Seedance 2.0, 最多 3 个)
    reference_audios: Optional[List[dict]] = None  # 参考音频列表 (Seedance 2.0, 最多 3 个)
    return_last_frame: bool = False  # 返回视频尾帧图像 (Seedance 2.0)
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
    # 仅在本次扣费不足、余额被兜底扣到 0 时为 true（不持久化）
    billing_underpaid: bool = False
    # 本次扣费后用户最新余额（不持久化，用于前端即时同步）
    remaining_credits: Optional[float] = None

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


# ---------------------------------------------------------------------------
# Asset Management schemas (资源管理)
# ---------------------------------------------------------------------------
class AssetResponse(BaseModel):
    """单个资源响应"""
    id: str
    user_id: str
    filename: str
    original_name: Optional[str] = None
    file_type: Optional[str] = None
    mime_type: Optional[str] = None
    size: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    url: str = ""  # 由路由层填充: /api/media/{filename}
    metadata_json: Optional[Dict[str, Any]] = None
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class AssetListResponse(BaseModel):
    """资源分页列表响应"""
    items: List[AssetResponse]
    total: int
    page: int
    page_size: int


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


# ---------------------------------------------------------------------------
# Tool Config schemas (工具级别配置)
# ---------------------------------------------------------------------------
class ToolConfigBase(BaseModel):
    """工具配置基类"""
    tool_name: str = Field(..., max_length=100)
    config: Dict[str, Any] = Field(default_factory=dict)
    is_enabled: bool = True


class ToolConfigCreate(ToolConfigBase):
    """创建工具配置"""
    pass


class ToolConfigUpdate(BaseModel):
    """更新工具配置"""
    config: Optional[Dict[str, Any]] = None
    is_enabled: Optional[bool] = None


class ToolConfigResponse(ToolConfigBase):
    """工具配置响应"""
    id: str
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Virtual Human Preset schemas (虚拟人像预制)
# ---------------------------------------------------------------------------
class VirtualHumanPresetCreate(BaseModel):
    """创建虚拟人像"""
    asset_id: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=100)
    gender: str = Field(..., pattern=r"^(male|female)$")
    style: str = Field(..., min_length=1, max_length=50)
    preview_url: str = Field(..., min_length=1, max_length=2000)
    description: str = Field(default="", max_length=500)
    is_active: bool = True
    sort_order: int = 0


class VirtualHumanPresetUpdate(BaseModel):
    """更新虚拟人像"""
    asset_id: Optional[str] = Field(None, min_length=1, max_length=100)
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    gender: Optional[str] = Field(None, pattern=r"^(male|female)$")
    style: Optional[str] = Field(None, min_length=1, max_length=50)
    preview_url: Optional[str] = Field(None, min_length=1, max_length=2000)
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class VirtualHumanPresetResponse(BaseModel):
    """虚拟人像响应"""
    id: str
    asset_id: str
    name: str
    gender: str
    style: str
    preview_url: str
    description: str = ""
    is_active: bool = True
    sort_order: int = 0
    asset_uri: str = ""
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator("asset_uri", mode="before")
    @classmethod
    def _compute_asset_uri(cls, v: Any, info: Any) -> str:
        return v or ""


# ---------------------------------------------------------------------------
# Music Task (音乐生成任务)
# ---------------------------------------------------------------------------
class MusicTaskResponse(BaseModel):
    """音乐生成任务响应"""
    id: str
    status: str
    prompt: str
    lyrics: Optional[str] = None
    model: str
    output_format: str = "mp3"
    audio_url: Optional[str] = None
    credit_cost: float = 0.0
    error_message: Optional[str] = None
    provider_id: Optional[str] = None
    user_id: str
    input_image_count: int = 0
    created_at: Any
    completed_at: Optional[Any] = None
    # 仅在本次扣费不足、余额被兜底扣到 0 时为 true（不持久化）
    billing_underpaid: bool = False
    # 用户最新余额（不持久化，用于前端即时同步）
    remaining_credits: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Image Generation (同步 REST 接口)
# ---------------------------------------------------------------------------
class ImageGenParams(BaseModel):
    """图像生成参数（供应商无关）"""
    aspect_ratio: Optional[str] = None           # 1:1 / 16:9 / 9:16 / 4:3 / 3:4 等
    quality: Optional[Literal["standard", "hd", "ultra"]] = None
    batch_count: int = Field(default=1, ge=1, le=4)
    output_format: Optional[Literal["png", "jpeg", "webp"]] = None
    # P2 新增（OpenAI gpt-image-* 专用端点）：
    output_compression: Optional[int] = Field(default=None, ge=0, le=100)   # webp/jpeg 压缩率
    background: Optional[Literal["transparent", "opaque", "auto"]] = None    # 透明层
    moderation: Optional[Literal["low", "auto"]] = None                       # 内容安全等级


class ImageReference(BaseModel):
    """图像生成的参考图结构"""
    url: str


class ImageGenerateRequest(BaseModel):
    """同步图像生成请求"""
    provider_id: str
    model: str
    prompt: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = None
    config: Optional[ImageGenParams] = None
    mode: Literal["text_to_image", "edit", "reference_images"] = "text_to_image"
    reference_images: Optional[List[ImageReference]] = None
    # P2 新增：edit 模式可选蒙版（PNG，透明区 = 被编辑区域）
    mask_url: Optional[str] = None


class ImageGenerateResponse(BaseModel):
    """同步图像生成响应（一次请求可返回多张图）"""
    images: List[str]                 # 本地 /api/media/... URL 列表
    prompt: str
    model: str
    provider_id: str
    provider_name: Optional[str] = None
    credit_cost: float = 0.0
    created_at: Any
    # 仅在本次扣费不足、余额被兜底扣到 0 时为 true（不持久化）
    billing_underpaid: bool = False
    # 本次扣费后用户最新余额（不持久化，用于前端即时同步）
    remaining_credits: Optional[float] = None


# ---------------------------------------------------------------------------
# Music Generation (异步任务接口)
# ---------------------------------------------------------------------------
class MusicStructured(BaseModel):
    """Lyria 结构化音乐字段（全部可选，空值忽略）。"""
    genre: Optional[str] = None                    # 流派/风格，Pop / Rock / Jazz ...
    instruments: Optional[List[str]] = None        # 乐器列表，piano / drums / guitar ...
    bpm: Optional[int] = Field(default=None, ge=40, le=240)
    key_scale: Optional[str] = None                # C Major / D Minor ...
    mood: Optional[str] = None                     # 情绪描述
    language: Optional[str] = None                 # 歌词语言
    vocals: Optional[bool] = None                  # 否包含人声
    lyrics: Optional[str] = None                   # [Verse]/[Chorus]/[Bridge] 结构化歌词
    timeline: Optional[str] = None                 # [0:00-0:10] 时间轴结构


class MusicReference(BaseModel):
    """音乐生成的多模态参考图像。"""
    url: str
    mime_type: Optional[str] = "image/jpeg"


class MusicGenerateRequest(BaseModel):
    """同步提交的音乐生成请求（返回 task_id，异步处理）。"""
    provider_id: Optional[str] = None              # 为空时自动选择默认 gemini 供应商
    model: str = Field(default="lyria-3-clip-preview")
    prompt: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = None
    node_id: Optional[str] = None                  # 画布节点 id（用于实时推送匹配）
    output_format: Literal["mp3", "wav"] = "mp3"
    negative_prompt: Optional[str] = None
    structured: Optional[MusicStructured] = None
    reference_images: Optional[List[MusicReference]] = None


class MusicGenerateResponse(BaseModel):
    """提交音乐任务的响应。"""
    task_id: str
    status: str
    session_id: Optional[str] = None
    node_id: Optional[str] = None
    model: str
    provider_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Email verification & password reset schemas
# ---------------------------------------------------------------------------
EmailVerifyPurpose = Literal["register", "change_password", "reset_password"]


class EmailCodeSendRequest(BaseModel):
    """发送邮件验证码请求。"""
    email: EmailStr
    purpose: EmailVerifyPurpose


class EmailCodeSendResponse(BaseModel):
    """发送邮件验证码响应。"""
    sent: bool = True
    expires_in: int  # 验证码有效期（秒）
    cooldown: int    # 下次可重发冷却（秒）


class EmailCodeVerifyRequest(BaseModel):
    """验证邮件验证码请求。"""
    email: EmailStr
    purpose: EmailVerifyPurpose
    code: str = Field(..., min_length=4, max_length=8)


class EmailCodeVerifyResponse(BaseModel):
    """验证成功后返回一次性 pass token。"""
    ok: bool
    token: Optional[str] = None
    expires_in: Optional[int] = None
    reason: Optional[str] = None  # mismatch | expired | exhausted


class PasswordChangeRequest(BaseModel):
    """已登录用户修改密码（需要 verify_token, purpose=change_password）。"""
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)
    verify_token: str = Field(..., min_length=8)


class PasswordResetRequest(BaseModel):
    """忘密场景重置密码（匿名，需 verify_token, purpose=reset_password）。"""
    email: EmailStr
    new_password: str = Field(..., min_length=6)
    verify_token: str = Field(..., min_length=8)


# ---------------------------------------------------------------------------
# Email Provider (admin) schemas
# ---------------------------------------------------------------------------
class EmailProviderBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    provider_type: Literal["resend"] = "resend"  # 预留后续扩展 smtp/sendgrid
    from_email: Optional[EmailStr] = None
    from_name: Optional[str] = Field(None, max_length=100)
    reply_to: Optional[EmailStr] = None
    is_active: bool = True
    is_default: bool = False
    config_json: Dict[str, Any] = Field(default_factory=dict)


class EmailProviderCreate(EmailProviderBase):
    api_key: str = Field(..., min_length=1)


class EmailProviderUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    api_key: Optional[str] = None
    from_email: Optional[EmailStr] = None
    from_name: Optional[str] = Field(None, max_length=100)
    reply_to: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    config_json: Optional[Dict[str, Any]] = None


class EmailProviderResponse(EmailProviderBase):
    id: str
    api_key: str = ""                   # 与 LLMProviderResponse 一致：返回明文，便于编辑回填
    api_key_masked: str = ""            # 末四位 + ***，仅用于列表展示
    last_success_at: Optional[Any] = None
    last_error_at: Optional[Any] = None
    last_error_message: Optional[str] = None
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class EmailProviderTestSendRequest(BaseModel):
    """管理员发送测试邮件（使用 admin_test 模板）。"""
    to: EmailStr
    locale: Optional[str] = "zh-CN"


class EmailTemplateBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    locale: str = Field("zh-CN", min_length=2, max_length=10)
    name: str = Field(..., min_length=1, max_length=100)
    subject: str = Field(..., min_length=1, max_length=255)
    html_body: str = Field(..., min_length=1)
    text_body: Optional[str] = None
    is_active: bool = True


class EmailTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    subject: Optional[str] = Field(None, min_length=1, max_length=255)
    html_body: Optional[str] = None
    text_body: Optional[str] = None
    is_active: Optional[bool] = None


class EmailTemplateResponse(EmailTemplateBase):
    id: str
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Model Pricing schemas (积分卖价按 provider_id+model 唯一)
# ---------------------------------------------------------------------------
class ModelPricingDimensions(BaseModel):
    """全维度积分费率；key 与 billing.py 中的维度名一致。"""
    input: float = Field(default=0.0, ge=0.0)
    text_output: float = Field(default=0.0, ge=0.0)
    image_output: float = Field(default=0.0, ge=0.0)
    search: float = Field(default=0.0, ge=0.0)
    image_generation: float = Field(default=0.0, ge=0.0)
    video_input_image: float = Field(default=0.0, ge=0.0)
    video_input_second: float = Field(default=0.0, ge=0.0)
    video_output_480p: float = Field(default=0.0, ge=0.0)
    video_output_720p: float = Field(default=0.0, ge=0.0)
    audio_generation: float = Field(default=0.0, ge=0.0)


class ModelPricingCreate(BaseModel):
    provider_id: str
    model: str = Field(..., max_length=200)
    dimensions: ModelPricingDimensions = Field(default_factory=ModelPricingDimensions)
    is_active: bool = True
    notes: Optional[str] = None


class ModelPricingUpdate(BaseModel):
    dimensions: Optional[ModelPricingDimensions] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class ModelPricingResponse(BaseModel):
    id: str
    provider_id: str
    model: str
    dimensions: Dict[str, float] = Field(default_factory=dict)
    is_active: bool = True
    notes: Optional[str] = None
    # 联表透出供 UI 利润对比
    provider_name: Optional[str] = None
    api_costs: Dict[str, float] = Field(default_factory=dict)
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class ModelPricingBulkApply(BaseModel):
    """按倍率一键应用：该供应商下所有 model 用 api_costs * markup_multiplier 写入 dimensions。"""
    provider_id: str
    markup_multiplier: float = Field(..., gt=0.0)
    only_models: Optional[List[str]] = None  # 可选限定某些模型

