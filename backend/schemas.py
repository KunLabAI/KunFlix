from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator
from typing import Optional, Dict, Any, List, Literal
from datetime import datetime


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
    current_chapter: int = 1
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


class GeminiConfig(BaseModel):
    """Gemini 3.1 配置 (thinking_level, media_resolution, image_config)"""
    thinking_level: Optional[Literal["high", "medium", "low", "minimal"]] = None
    media_resolution: Optional[Literal["ultra_high", "high", "medium", "low"]] = None
    image_generation_enabled: bool = False  # 图片生成开关
    image_config: Optional[GeminiImageConfig] = None
    google_search_enabled: bool = False  # Google 搜索开关


# ---------------------------------------------------------------------------
# Agent schemas
# ---------------------------------------------------------------------------
class AgentBase(BaseModel):
    name: str = Field(..., max_length=50)
    description: str = Field(..., max_length=500)
    provider_id: str
    model: str
    temperature: float = Field(default=0.7, ge=0.0, le=1.0)
    context_window: int = Field(default=4096, ge=4096, le=262144)
    system_prompt: str
    tools: List[str] = Field(default_factory=list)
    thinking_mode: bool = False
    input_credit_per_1m: float = Field(default=0.0, ge=0.0)
    output_credit_per_1m: float = Field(default=0.0, ge=0.0)
    image_output_credit_per_1m: float = Field(default=0.0, ge=0.0)
    search_credit_per_query: float = Field(default=0.0, ge=0.0)
    # Leader configuration
    is_leader: bool = False
    coordination_modes: List[str] = Field(default_factory=list)  # ["pipeline", "plan", "discussion"]
    member_agent_ids: List[str] = Field(default_factory=list)
    max_subtasks: int = Field(default=10, ge=1, le=20)
    enable_auto_review: bool = True
    # Gemini 3.1 配置
    gemini_config: Optional[GeminiConfig] = None


class AgentCreate(AgentBase):
    pass


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = Field(None, max_length=500)
    provider_id: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = Field(None, ge=0.0, le=1.0)
    context_window: Optional[int] = Field(None, ge=4096, le=262144)
    system_prompt: Optional[str] = None
    tools: Optional[List[str]] = None
    thinking_mode: Optional[bool] = None
    input_credit_per_1m: Optional[float] = Field(None, ge=0.0)
    output_credit_per_1m: Optional[float] = Field(None, ge=0.0)
    image_output_credit_per_1m: Optional[float] = Field(None, ge=0.0)
    search_credit_per_query: Optional[float] = Field(None, ge=0.0)
    # Leader configuration
    is_leader: Optional[bool] = None
    coordination_modes: Optional[List[str]] = None
    member_agent_ids: Optional[List[str]] = None
    max_subtasks: Optional[int] = Field(None, ge=1, le=20)
    enable_auto_review: Optional[bool] = None
    # Gemini 3.1 配置
    gemini_config: Optional[GeminiConfig] = None


class AgentResponse(AgentBase):
    id: str
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)

    @field_validator('coordination_modes', 'member_agent_ids', 'tools', mode='before')
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


class ChatSessionCreate(ChatSessionBase):
    pass


class ChatSessionResponse(ChatSessionBase):
    id: str
    user_id: Optional[str] = None
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)


class ChatMessageBase(BaseModel):
    role: str
    content: Any  # str 或 List[Dict] (多模态消息: [{type: "text", text: "..."}, {type: "image_url", ...}])


class ChatMessageCreate(ChatMessageBase):
    edit_last_image: bool = False


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
