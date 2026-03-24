"""
提示词模板管理 API
用于管理剧场创建等场景的 AI 生成提示词模板
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import logging

from database import get_db
from models import PromptTemplate, Agent
from schemas import (
    PromptTemplateCreate,
    PromptTemplateUpdate,
    PromptTemplateResponse,
    AIGenerateRequest,
    AIGenerateResponse,
)
from auth import require_admin, get_current_active_user_or_admin
from services.llm_stream import stream_completion, StreamResult

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/prompt-templates",
    tags=["prompt-templates"],
    responses={404: {"description": "Not found"}},
)


@router.post("", response_model=PromptTemplateResponse)
async def create_template(
    template: PromptTemplateCreate,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """创建新的提示词模板"""
    # 检查名称是否已存在
    existing = await db.execute(select(PromptTemplate).filter(PromptTemplate.name == template.name))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Template name already exists")
    
    # 如果设置为默认，取消其他同类型模板的默认状态
    if template.is_default:
        result = await db.execute(
            select(PromptTemplate).filter(
                PromptTemplate.template_type == template.template_type
            )
        )
        for t in result.scalars().all():
            t.is_default = False
    
    new_template = PromptTemplate(**template.model_dump())
    db.add(new_template)
    await db.commit()
    await db.refresh(new_template)
    return new_template


@router.get("", response_model=List[PromptTemplateResponse])
async def list_templates(
    template_type: Optional[str] = None,
    agent_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    skip: int = 0,
    limit: int = 50,
    _current=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取提示词模板列表"""
    query = select(PromptTemplate).order_by(PromptTemplate.created_at.desc())
    
    if template_type:
        query = query.filter(PromptTemplate.template_type == template_type)
    if agent_type:
        query = query.filter(PromptTemplate.agent_type == agent_type)
    if is_active is not None:
        query = query.filter(PromptTemplate.is_active == is_active)
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{template_id}", response_model=PromptTemplateResponse)
async def get_template(
    template_id: str,
    _current=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取单个提示词模板详情"""
    template = await db.get(PromptTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.put("/{template_id}", response_model=PromptTemplateResponse)
async def update_template(
    template_id: str,
    template_update: PromptTemplateUpdate,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """更新提示词模板"""
    template = await db.get(PromptTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # 检查名称冲突
    if template_update.name and template_update.name != template.name:
        existing = await db.execute(
            select(PromptTemplate).filter(PromptTemplate.name == template_update.name)
        )
        if existing.scalars().first():
            raise HTTPException(status_code=400, detail="Template name already exists")
    
    # 如果设置为默认，取消其他同类型模板的默认状态
    if template_update.is_default:
        template_type = template_update.template_type or template.template_type
        result = await db.execute(
            select(PromptTemplate).filter(
                PromptTemplate.template_type == template_type,
                PromptTemplate.id != template_id
            )
        )
        for t in result.scalars().all():
            t.is_default = False
    
    # 更新字段
    update_data = template_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)
    
    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """删除提示词模板"""
    template = await db.get(PromptTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    await db.delete(template)
    await db.commit()
    return {"message": "Template deleted successfully"}


@router.post("/{template_id}/generate", response_model=AIGenerateResponse)
async def generate_with_template(
    template_id: str,
    request: AIGenerateRequest,
    _current=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    使用提示词模板进行 AI 生成
    
    流程：
    1. 获取模板
    2. 渲染提示词（替换变量）
    3. 选择合适的智能体
    4. 调用 LLM 生成内容
    5. 解析并返回结果
    """
    from jinja2 import Template as JinjaTemplate
    import json
    
    # 1. 获取模板
    template = await db.get(PromptTemplate, template_id)
    if not template or not template.is_active:
        raise HTTPException(status_code=404, detail="Template not found or inactive")
    
    # 2. 确定使用的智能体
    agent_id = request.agent_id or template.default_agent_id
    if not agent_id:
        # 查找默认智能体（根据 agent_type 匹配）
        agent_query = select(Agent).filter(
            Agent.agent_type == template.agent_type,
            Agent.is_active == True  # 假设有 is_active 字段
        ).order_by(Agent.created_at.desc())
        agent_result = await db.execute(agent_query)
        agent = agent_result.scalars().first()
        if not agent:
            raise HTTPException(
                status_code=400,
                detail=f"No suitable agent found for type: {template.agent_type}"
            )
    else:
        agent = await db.get(Agent, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
    
    # 3. 获取供应商配置
    from models import LLMProvider
    provider = await db.get(LLMProvider, agent.provider_id)
    if not provider or not provider.is_active:
        raise HTTPException(status_code=400, detail="Agent provider is not available")
    
    # 4. 渲染提示词
    try:
        system_prompt = JinjaTemplate(template.system_prompt_template).render(**request.variables)
        user_prompt = None
        if template.user_prompt_template:
            user_prompt = JinjaTemplate(template.user_prompt_template).render(**request.variables)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Template rendering error: {str(e)}")
    
    # 5. 构建消息列表
    messages = [{"role": "system", "content": system_prompt}]
    if user_prompt:
        messages.append({"role": "user", "content": user_prompt})
    else:
        messages.append({"role": "user", "content": "请根据以上要求生成内容，确保输出有效的 JSON 格式。"})
    
    # 6. 调用 LLM
    final_result = StreamResult()
    full_response = ""
    
    try:
        async for chunk, stream_result in stream_completion(
            provider_type=provider.provider_type,
            api_key=provider.api_key,
            base_url=provider.base_url,
            model=agent.model,
            messages=messages,
            temperature=agent.temperature,
            context_window=agent.context_window,
            thinking_mode=agent.thinking_mode,
            gemini_config=agent.gemini_config,
        ):
            full_response += chunk
            final_result = stream_result
    except Exception as e:
        logger.error(f"LLM generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")
    
    # 7. 解析 JSON 响应
    try:
        # 尝试提取 JSON 部分（处理可能的 markdown 代码块）
        json_str = full_response
        if "```json" in full_response:
            json_str = full_response.split("```json")[1].split("```")[0].strip()
        elif "```" in full_response:
            json_str = full_response.split("```")[1].split("```")[0].strip()
        
        data = json.loads(json_str)
    except Exception as e:
        logger.error(f"Failed to parse JSON response: {full_response}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse AI response as JSON: {str(e)}"
        )
    
    # 8. 计算费用（复用现有计费逻辑）
    from services.billing import calculate_credit_cost
    credit_cost, _ = calculate_credit_cost(final_result, agent)
    
    return AIGenerateResponse(
        success=True,
        data=data,
        tokens_used={
            "input": final_result.input_tokens,
            "output": final_result.output_tokens,
        },
        credit_cost=credit_cost,
    )


@router.get("/types/list")
async def get_template_types(
    _current=Depends(get_current_active_user_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取所有模板类型列表（用于筛选）"""
    result = await db.execute(
        select(PromptTemplate.template_type)
        .distinct()
        .order_by(PromptTemplate.template_type)
    )
    types = result.scalars().all()
    return [{"value": t, "label": _get_template_type_label(t)} for t in types if t]


def _get_template_type_label(template_type: str) -> str:
    """获取模板类型的中文标签"""
    labels = {
        "story_basic": "故事基础设定",
        "character": "角色设定",
        "scene": "场景描述",
        "storyboard": "分镜脚本",
        "custom": "自定义",
    }
    return labels.get(template_type, template_type)
