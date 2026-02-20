from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from database import get_db
from models import Agent, LLMProvider
from schemas import AgentCreate, AgentUpdate, AgentResponse

router = APIRouter(
    prefix="/api/agents",
    tags=["agents"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", response_model=AgentResponse)
async def create_agent(agent: AgentCreate, db: AsyncSession = Depends(get_db)):
    # 1. Check if name exists
    existing_agent = await db.execute(select(Agent).filter(Agent.name == agent.name))
    if existing_agent.scalars().first():
        raise HTTPException(status_code=400, detail="Agent name already exists")

    # 2. Validate Provider and Model
    provider_result = await db.execute(select(LLMProvider).filter(LLMProvider.id == agent.provider_id))
    provider = provider_result.scalars().first()
    if not provider:
        raise HTTPException(status_code=400, detail="Provider not found")
    
    # 3. Check if model is in provider's model list
    # Models can be stored as JSON list or string
    provider_models = []
    if provider.models:
        if isinstance(provider.models, list):
            provider_models = provider.models
        elif isinstance(provider.models, str):
            import json
            try:
                provider_models = json.loads(provider.models)
            except:
                provider_models = [provider.models]
    
    if agent.model not in provider_models:
        # Relaxed check: if model is not in list but provider is generic, maybe allow?
        # But requirement says "must select from provider's models".
        # Let's assume the frontend sends a valid model from the list.
        # But for safety, we should check if possible.
        # If the list is empty, maybe we skip check?
        if provider_models:
             if agent.model not in provider_models:
                 raise HTTPException(status_code=400, detail=f"Model {agent.model} not available for this provider")

    new_agent = Agent(**agent.model_dump())
    db.add(new_agent)
    await db.commit()
    await db.refresh(new_agent)
    return new_agent

@router.get("/", response_model=List[AgentResponse])
async def list_agents(
    skip: int = 0, 
    limit: int = 20, 
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    query = select(Agent).order_by(Agent.created_at.desc())
    
    if search:
        query = query.filter(Agent.name.ilike(f"%{search}%"))
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).filter(Agent.id == agent_id))
    agent = result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent

@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: int, agent_update: AgentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).filter(Agent.id == agent_id))
    agent = result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    update_data = agent_update.model_dump(exclude_unset=True)
    
    # Validation if updating name
    if "name" in update_data and update_data["name"] != agent.name:
        existing = await db.execute(select(Agent).filter(Agent.name == update_data["name"]))
        if existing.scalars().first():
            raise HTTPException(status_code=400, detail="Agent name already exists")
            
    # Validation if updating provider/model
    if "provider_id" in update_data or "model" in update_data:
        pid = update_data.get("provider_id", agent.provider_id)
        mod = update_data.get("model", agent.model)
        
        provider_result = await db.execute(select(LLMProvider).filter(LLMProvider.id == pid))
        provider = provider_result.scalars().first()
        if not provider:
            raise HTTPException(status_code=400, detail="Provider not found")
            
        # Check model availability logic similar to create
        provider_models = []
        if provider.models:
            if isinstance(provider.models, list):
                provider_models = provider.models
            elif isinstance(provider.models, str):
                import json
                try:
                    provider_models = json.loads(provider.models)
                except:
                    provider_models = [provider.models]
        
        if provider_models and mod not in provider_models:
             raise HTTPException(status_code=400, detail=f"Model {mod} not available for this provider")

    for key, value in update_data.items():
        setattr(agent, key, value)
    
    await db.commit()
    await db.refresh(agent)
    return agent

@router.delete("/{agent_id}")
async def delete_agent(agent_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).filter(Agent.id == agent_id))
    agent = result.scalars().first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Log deletion (In a real app, this might go to a dedicated audit log table)
    print(f"AUDIT: Agent {agent.name} (ID: {agent.id}) deleted.")
    
    await db.delete(agent)
    await db.commit()
    return {"message": "Agent deleted successfully"}
