from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List
import httpx

from database import get_db
from models import LLMProvider, Admin, Agent
from schemas import LLMProviderCreate, LLMProviderUpdate, LLMProviderResponse, TestConnectionRequest, OllamaModelsRequest
from auth import require_admin
from agents import narrative_engine, create_chat_model
from cache.pubsub import invalidate as publish_invalidate
from services import audit
from agentscope.message import UserMsg

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
    "openrouter": "https://openrouter.ai/api/v1",
}

# 视频模型关键词 → 跳过聊天测试，使用 API key 验证
_VIDEO_MODEL_PATTERNS = ("video", "imagine-video", "seedance")


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

        provider_type = request.provider_type.lower()

        model_instance = create_chat_model(
            provider_type=provider_type,
            api_key=request.api_key,
            model_name=request.model,
            base_url=request.base_url,
        )

        from agents import DialogAgent as MyDialogAgent
        agent = MyDialogAgent(name="Tester", sys_prompt="You are a connection tester.", model=model_instance)

        msg = UserMsg(name="User", content="Hello")
        response = await agent.reply(msg)

        # 2.0 Msg.content 是 list[ContentBlock]；优先使用 helper 提取文本
        getter = getattr(response, "get_text_content", None)
        response_content = (getter() or "") if callable(getter) else str(getattr(response, "content", "") or "")
        return {"success": True, "message": "Connection successful", "response": response_content}

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"Server Error: {str(e)}"}


@router.post("/ollama-models")
async def list_ollama_models(
    req: OllamaModelsRequest,
    _admin: Admin = Depends(require_admin),
):
    """同步 Ollama 本地已拉取的模型列表（调用 Ollama /api/tags）。

    返回 {success, models, message?}，前端可直接填回表单 models 字段。
    """
    base = (req.base_url or "http://localhost:11434").rstrip("/")
    url = f"{base}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        data = resp.json()
        models = [m.get("name") for m in (data.get("models") or []) if m.get("name")]
        return {"success": True, "models": models}
    except httpx.HTTPError as e:
        return {"success": False, "models": [], "message": f"连接 Ollama 失败: {e}"}
    except Exception as e:
        return {"success": False, "models": [], "message": f"Server Error: {e}"}

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

    # 拒绝删除：仍有智能体依赖该供应商（避免静默丢失 LLM 路由信息）
    agent_ref = await db.execute(
        select(func.count(Agent.id)).where(Agent.provider_id == provider_id)
    )
    agent_count = int(agent_ref.scalar() or 0)
    if agent_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"该供应商仍被 {agent_count} 个智能体使用，请先删除或修改关联智能体",
        )

    snapshot = {"name": provider.name, "provider_type": provider.provider_type, "models": provider.models}

    # FK 层自动 SET NULL：agents.provider_id / video_tasks.provider_id /
    # music_tasks.provider_id（上面预检已拦截 agent 引用场景）
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
