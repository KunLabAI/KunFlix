from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
import httpx

from database import get_db
from models import LLMProvider, Admin
from schemas import LLMProviderCreate, LLMProviderUpdate, LLMProviderResponse, TestConnectionRequest
from auth import require_admin
from agents import narrative_engine
from cache.pubsub import invalidate as publish_invalidate
from services import audit
import agentscope
from agentscope.message import Msg
from agentscope.model import (
    OpenAIChatModel, DashScopeChatModel, AnthropicChatModel,
    GeminiChatModel, OllamaChatModel,
)
import asyncio

router = APIRouter(
    prefix="/api/admin/llm-providers",
    tags=["admin"],
    responses={404: {"description": "Not found"}},
)

# Default base URLs for specific providers
_DEFAULT_BASE_URLS = {
    "deepseek": "https://api.deepseek.com",
    "minimax": "https://api.minimax.io/anthropic",
    "xai": "https://api.x.ai/v1",
    "ark": "https://ark.cn-beijing.volces.com/api/v3",
    "doubao": "https://ark.cn-beijing.volces.com/api/v3",
}

# Azure uses "azure" client type, all others use "openai"
_CLIENT_TYPE_MAP = {"azure": "azure"}

# 视频模型关键词 → 跳过聊天测试，使用 API key 验证
_VIDEO_MODEL_PATTERNS = ("video", "imagine-video", "seedance")


def _build_client_kwargs(base_url: str | None, provider_type: str) -> dict:
    """Build client_kwargs with provider-specific base_url fallback."""
    kwargs = {}
    if base_url:
        kwargs["base_url"] = base_url
    kwargs.setdefault("base_url", _DEFAULT_BASE_URLS.get(provider_type))
    return kwargs


def _create_test_model(provider_type: str, model: str, api_key: str,
                       base_url: str | None, extra_config: dict):
    """Create model instance for connection testing via factory dispatch."""
    client_kwargs = _build_client_kwargs(base_url, provider_type)

    # Anthropic-compatible factory (shared by anthropic & minimax)
    def _anthropic():
        return AnthropicChatModel(
            model_name=model, api_key=api_key,
            client_kwargs=client_kwargs, generate_kwargs=extra_config,
        )

    # Provider-specific factories
    factories = {
        "dashscope": lambda: DashScopeChatModel(
            model_name=model, api_key=api_key, generate_kwargs=extra_config,
        ),
        "gemini": lambda: GeminiChatModel(
            model_name=model, api_key=api_key, generate_kwargs=extra_config,
        ),
        "ollama": lambda: OllamaChatModel(
            model_name=model, host=base_url,
        ),
        "anthropic": _anthropic,
        "minimax": _anthropic,
    }

    factory = factories.get(provider_type)
    # Found a specific factory -> use it; otherwise default to OpenAI-compatible
    return factory() if factory else OpenAIChatModel(
        model_name=model, api_key=api_key,
        client_type=_CLIENT_TYPE_MAP.get(provider_type, "openai"),
        client_kwargs=client_kwargs, generate_kwargs=extra_config,
    )


async def _test_video_model_connection(api_key: str, base_url: str | None, provider_type: str) -> dict:
    """视频模型连接测试 — 使用 /v1/models 端点验证 API key"""
    url = (base_url or _DEFAULT_BASE_URLS.get(provider_type, "https://api.x.ai/v1")).rstrip("/") + "/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
    return {"success": True, "message": "视频模型 API Key 验证成功", "response": "Video model connection OK"}


def _is_video_model(model_name: str) -> bool:
    """检测是否为视频模型（基于关键词匹配）"""
    model_lower = model_name.lower()
    return any(p in model_lower for p in _VIDEO_MODEL_PATTERNS)


@router.post("/test-connection")
async def test_connection(request: TestConnectionRequest, _admin: Admin = Depends(require_admin)):
    try:
        # 视频模型使用专用测试方式
        is_video = _is_video_model(request.model)
        if is_video:
            return await _test_video_model_connection(
                request.api_key, request.base_url, request.provider_type.lower()
            )

        agentscope.init()

        provider_type = request.provider_type.lower()
        extra_config = request.config_json or {}

        model_instance = _create_test_model(
            provider_type, request.model, request.api_key,
            request.base_url, extra_config,
        )

        from agents import DialogAgent as MyDialogAgent
        agent = MyDialogAgent(name="Tester", sys_prompt="You are a connection tester.", model=model_instance)

        msg = Msg(name="User", content="Hello", role="user")
        response = agent(msg)
        if asyncio.iscoroutine(response):
            response = await response

        response_content = str(response.content) if response.content is not None else ""
        return {"success": True, "message": "Connection successful", "response": response_content}

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Server Error: {str(e)}"}

@router.post("", response_model=LLMProviderResponse)
async def create_llm_provider(
    provider: LLMProviderCreate,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    # Check if name exists
    result = await db.execute(select(LLMProvider).filter(LLMProvider.name == provider.name))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Provider name already exists")
    
    # If this is set as default, unset others
    if provider.is_default:
        await db.execute(
            LLMProvider.__table__.update().values(is_default=False)
        )
    
    new_provider = LLMProvider(**provider.model_dump())
    db.add(new_provider)
    await db.commit()
    await db.refresh(new_provider)
    
    # Reload engine configuration if this is the default or active provider
    # For simplicity, we can just trigger a reload check
    if new_provider.is_active:
        await narrative_engine.reload_config(db)
    await publish_invalidate("provider", new_provider.id)
    audit.record(
        action="llm_provider.create", actor=current_admin,
        resource_type="llm_provider", resource_id=new_provider.id,
        detail=provider.model_dump(),
        request=request,
    )
    return new_provider

@router.get("", response_model=List[LLMProviderResponse])
async def read_llm_providers(
    skip: int = 0, 
    limit: int = 100,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(LLMProvider).offset(skip).limit(limit))
    return result.scalars().all()

@router.get("/{provider_id}", response_model=LLMProviderResponse)
async def read_llm_provider(
    provider_id: str,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(LLMProvider).filter(LLMProvider.id == provider_id))
    provider = result.scalars().first()
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider

@router.put("/{provider_id}", response_model=LLMProviderResponse)
async def update_llm_provider(
    provider_id: str, 
    provider_update: LLMProviderUpdate,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(LLMProvider).filter(LLMProvider.id == provider_id))
    provider = result.scalars().first()
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    update_data = provider_update.model_dump(exclude_unset=True)
    
    # If setting as default, unset others
    if update_data.get("is_default"):
        await db.execute(
            LLMProvider.__table__.update().values(is_default=False)
        )
        
    for key, value in update_data.items():
        setattr(provider, key, value)
        
    await db.commit()
    await db.refresh(provider)
    
    if provider.is_active:
        await narrative_engine.reload_config(db)
    await publish_invalidate("provider", provider.id)
    audit.record(
        action="llm_provider.update", actor=current_admin,
        resource_type="llm_provider", resource_id=provider.id,
        detail={"changed_fields": sorted(update_data.keys()), "values": update_data},
        request=request,
    )
    return provider

@router.delete("/{provider_id}")
async def delete_llm_provider(
    provider_id: str,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(LLMProvider).filter(LLMProvider.id == provider_id))
    provider = result.scalars().first()
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
        
    snapshot = {"name": provider.name, "provider_type": provider.provider_type, "model": provider.model}
    await db.delete(provider)
    await db.commit()
    await publish_invalidate("provider", provider_id)
    audit.record(
        action="llm_provider.delete", actor=current_admin,
        resource_type="llm_provider", resource_id=provider_id,
        detail=snapshot,
        request=request,
    )
    return {"ok": True}
