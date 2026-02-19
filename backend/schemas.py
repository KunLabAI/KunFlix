from pydantic import BaseModel, HttpUrl, ConfigDict, Field
from typing import Optional, Dict, Any, List

class LLMProviderBase(BaseModel):
    name: str
    provider_type: str
    api_key: str
    base_url: Optional[str] = None
    models: List[str] = Field(default_factory=list)
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
