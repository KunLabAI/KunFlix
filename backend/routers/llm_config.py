from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from database import get_db
from models import LLMProvider, User
from schemas import LLMProviderCreate, LLMProviderUpdate, LLMProviderResponse, TestConnectionRequest
from auth import require_admin
from agents import narrative_engine
import agentscope
from agentscope.message import Msg
import asyncio

router = APIRouter(
    prefix="/api/admin/llm-providers",
    tags=["admin"],
    responses={404: {"description": "Not found"}},
)

@router.post("/test-connection")
async def test_connection(request: TestConnectionRequest, _admin: User = Depends(require_admin)):
    try:
        # Initialize agentscope (logging etc)
        agentscope.init()
        
        provider_type = request.provider_type.lower()
        model_instance = None
        
        # Parse config_json
        extra_config = request.config_json or {}
        
        if provider_type in ["openai", "azure"]:
            from agentscope.model import OpenAIChatModel
            client_kwargs = {}
            if request.base_url:
                client_kwargs["base_url"] = request.base_url
            
            model_instance = OpenAIChatModel(
                model_name=request.model,
                api_key=request.api_key,
                client_type=provider_type, # "openai" or "azure"
                client_kwargs=client_kwargs,
                generate_kwargs=extra_config
            )
            
        elif provider_type == "dashscope":
            from agentscope.model import DashScopeChatModel
            model_instance = DashScopeChatModel(
                model_name=request.model,
                api_key=request.api_key,
                generate_kwargs=extra_config
            )
            
        elif provider_type == "anthropic":
            from agentscope.model import AnthropicChatModel
            client_kwargs = {}
            if request.base_url:
                client_kwargs["base_url"] = request.base_url
            
            model_instance = AnthropicChatModel(
                model_name=request.model,
                api_key=request.api_key,
                client_kwargs=client_kwargs,
                generate_kwargs=extra_config
            )
            
        elif provider_type == "gemini":
            from agentscope.model import GeminiChatModel
            model_instance = GeminiChatModel(
                model_name=request.model,
                api_key=request.api_key,
                generate_kwargs=extra_config
            )
        
        else:
             # Default fallback to OpenAI compatible
             from agentscope.model import OpenAIChatModel
             client_kwargs = {}
             if request.base_url:
                 client_kwargs["base_url"] = request.base_url
             
             model_instance = OpenAIChatModel(
                model_name=request.model,
                api_key=request.api_key,
                client_kwargs=client_kwargs,
                generate_kwargs=extra_config
            )

        # Create a simple agent
        # Use the DialogAgent we fixed earlier
        from agents import DialogAgent as MyDialogAgent
        
        agent = MyDialogAgent(name="Tester", sys_prompt="You are a connection tester.", model=model_instance)
        
        # Send a simple message
        msg = Msg(name="User", content="Hello", role="user")
        # AgentBase.__call__ is async in newer agentscope versions
        response = agent(msg)
        if asyncio.iscoroutine(response):
            response = await response
        
        # Ensure content is string and safe for JSON serialization
        response_content = str(response.content) if response.content is not None else ""
        
        return {"success": True, "message": "Connection successful", "response": response_content}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Server Error: {str(e)}"}

@router.post("/", response_model=LLMProviderResponse)
async def create_llm_provider(
    provider: LLMProviderCreate,
    _admin: User = Depends(require_admin),
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
        
    return new_provider

@router.get("/", response_model=List[LLMProviderResponse])
async def read_llm_providers(
    skip: int = 0, 
    limit: int = 100,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(LLMProvider).offset(skip).limit(limit))
    return result.scalars().all()

@router.get("/{provider_id}", response_model=LLMProviderResponse)
async def read_llm_provider(
    provider_id: str,
    _admin: User = Depends(require_admin),
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
    _admin: User = Depends(require_admin),
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
        
    return provider

@router.delete("/{provider_id}")
async def delete_llm_provider(
    provider_id: str,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(LLMProvider).filter(LLMProvider.id == provider_id))
    provider = result.scalars().first()
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
        
    await db.delete(provider)
    await db.commit()
    return {"ok": True}
