import asyncio
import os
import sys
import json

# Add local deps to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "deps")))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import AsyncSessionLocal
from models import LLMProvider, Admin, User, PromptTemplate
from config import settings
import bcrypt
# from passlib.context import CryptContext

# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

def run_migrations():
    """执行 Alembic 数据库迁移，创建所有表"""
    from alembic.config import Config
    from alembic import command
    
    print("Running database migrations...")
    
    # 获取 alembic.ini 的路径
    alembic_ini_path = os.path.join(os.path.dirname(__file__), "alembic.ini")
    
    # 创建 Alembic 配置
    alembic_cfg = Config(alembic_ini_path)
    
    # 执行迁移到最新版本
    command.upgrade(alembic_cfg, "head")
    
    print("Database migrations completed.")

# 默认供应商配置（不包含 API Key，需在部署后配置）
DEFAULT_PROVIDERS = [
    {
        "name": "Gemini",
        "provider_type": "gemini",
        "models": ["gemini-3.1-pro-preview", "gemini-3.1-flash-lite-preview", "gemini-3.1-flash-image-preview", "veo-3.1-lite-generate-preview", "lyria-3-clip-preview", "lyria-3-pro-preview"],
        "tags": ["llm", "image", "video", "audio"],
    },
    {
        "name": "MiniMax",
        "provider_type": "minimax",
        "models": ["MiniMax-M2.5", "MiniMax-M2.7"],
        "tags": ["llm", "video"],
    },
    {
        "name": "Grok",
        "provider_type": "xai",
        "models": ["grok-4-1-fast-non-reasoning", "grok-4-1-fast-reasoning", "grok-imagine-image-pro", "grok-imagine-image", "grok-imagine-video"],
        "tags": ["llm", "image"],
    },
    {
        "name": "火山方舟",
        "provider_type": "ark",
        "models": ["doubao-seed-2-0-pro-260215", "doubao-seedance-2-0-260128", "doubao-seedance-2-0-fast-260128", "doubao-seed-2-0-lite-260215"],
        "tags": ["llm", "video"],
    },
    {
        "name": "DeepSeek",
        "provider_type": "deepseek",
        "models": ["deepseek-chat", "deepseek-reasoner"],
        "tags": ["llm"],
    },
]

def load_prompt_templates():
    """从 JSON 文件加载提示词模板"""
    json_path = os.path.join(os.path.dirname(__file__), "prompt_templates.json")
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Warning: {json_path} not found, skipping prompt templates seeding.")
        return []
    except json.JSONDecodeError as e:
        print(f"Warning: Failed to parse {json_path}: {e}")
        return []

async def seed():
    print("Seeding database...")
    async with AsyncSessionLocal() as session:
        # 1. Seed LLM Providers
        for provider_config in DEFAULT_PROVIDERS:
            result = await session.execute(select(LLMProvider).filter_by(name=provider_config["name"]))
            provider = result.scalars().first()
            if not provider:
                print(f"Creating provider: {provider_config['name']}...")
                provider = LLMProvider(
                    name=provider_config["name"],
                    provider_type=provider_config["provider_type"],
                    api_key="",  # API Key 需在部署后配置
                    models=provider_config["models"],
                    tags=provider_config.get("tags", []),
                    is_active=True,
                    is_default=False
                )
                session.add(provider)
            else:
                print(f"Provider {provider_config['name']} already exists.")

        # 2. Seed Admin
        result = await session.execute(select(Admin).filter_by(email="admin@example.com"))
        admin = result.scalars().first()
        if not admin:
            print("Creating default admin...")
            admin = Admin(
                email="admin@example.com",
                nickname="SuperAdmin",
                password_hash=hash_password("admin123"),
                permission_level="super_admin"
            )
            session.add(admin)
        else:
            print("Admin already exists.")

        # 3. Seed Prompt Templates
        prompt_templates = load_prompt_templates()
        for template_config in prompt_templates:
            result = await session.execute(select(PromptTemplate).filter_by(name=template_config["name"]))
            template = result.scalars().first()
            if not template:
                print(f"Creating prompt template: {template_config['name']}...")
                template = PromptTemplate(
                    name=template_config["name"],
                    description=template_config.get("description"),
                    template_type=template_config["template_type"],
                    agent_type=template_config.get("agent_type", "text"),
                    system_prompt_template=template_config["system_prompt_template"],
                    user_prompt_template=template_config.get("user_prompt_template"),
                    output_schema=template_config.get("output_schema", {}),
                    variables_schema=template_config.get("variables_schema", []),
                    is_active=template_config.get("is_active", True),
                    is_default=template_config.get("is_default", False),
                )
                session.add(template)
            else:
                print(f"Prompt template {template_config['name']} already exists.")

        await session.commit()
    print("Seeding completed.")

if __name__ == "__main__":
    try:
        # 先执行数据库迁移（创建表）
        run_migrations()
        # 再执行数据初始化
        asyncio.run(seed())
    except Exception as e:
        print(f"Seeding failed: {e}")
