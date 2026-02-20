from pydantic import BaseModel, HttpUrl, ConfigDict, Field
from typing import Optional, Dict, Any, List

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

class LLMProviderResponse(LLMProviderBase):
    id: int
    created_at: Any
    updated_at: Any

    model_config = ConfigDict(from_attributes=True)

class TestConnectionRequest(BaseModel):
    provider_type: str
    api_key: str
    base_url: Optional[str] = None
    model: str
    config_json: Optional[Dict[str, Any]] = {}

class AgentBase(BaseModel):
    name: str = Field(..., max_length=50)
    description: str = Field(..., max_length=500)
    provider_id: int
    model: str
    temperature: float = Field(default=0.7, ge=0.0, le=1.0)
    context_window: int = Field(default=4096, ge=4096, le=256000)
    system_prompt: str
    tools: List[str] = Field(default_factory=list)
    thinking_mode: bool = False

class AgentCreate(AgentBase):
    pass

class AgentUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = Field(None, max_length=500)
    provider_id: Optional[int] = None
    model: Optional[str] = None
    temperature: Optional[float] = Field(None, ge=0.0, le=1.0)
    context_window: Optional[int] = Field(None, ge=4096, le=256000)
    system_prompt: Optional[str] = None
    tools: Optional[List[str]] = None
    thinking_mode: Optional[bool] = None

class AgentResponse(AgentBase):
    id: int
    created_at: Any
    updated_at: Optional[Any] = None

    model_config = ConfigDict(from_attributes=True)

class ChatSessionBase(BaseModel):
    title: str = "New Chat"
    agent_id: int

class ChatSessionCreate(ChatSessionBase):
    pass

class ChatSessionResponse(ChatSessionBase):
    id: int
    created_at: Any
    updated_at: Optional[Any] = None
    
    model_config = ConfigDict(from_attributes=True)

class ChatMessageBase(BaseModel):
    role: str
    content: str

class ChatMessageCreate(ChatMessageBase):
    pass

class ChatMessageResponse(ChatMessageBase):
    id: int
    session_id: int
    created_at: Any
    
    model_config = ConfigDict(from_attributes=True)
