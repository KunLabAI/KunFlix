import asyncio
import os
import sys
import json

# 脚本已迁移至 backend/scripts/ 子目录。需将 backend 根目录加入 sys.path，
# 使得 database/models/config 等顶层模块可被导入。
_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
sys.path.insert(0, _BACKEND_DIR)
# Add local deps to path
sys.path.append(os.path.abspath(os.path.join(_BACKEND_DIR, "deps")))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import AsyncSessionLocal
from models import LLMProvider, Admin, PromptTemplate, SubscriptionPlan, EmailTemplate
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
    
    # 获取 alembic.ini 的路径（位于 backend 根目录）
    alembic_ini_path = os.path.join(_BACKEND_DIR, "alembic.ini")
    
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
    {
        "name": "Kimi",
        "provider_type": "kimi",
        "models": ["kimi-k3", "kimi-k2.7-code", "kimi-k2.7-code-highspeed", "kimi-k2.6"],
        "tags": ["llm"],
    },
    {
        # Ollama 本地部署：api_key 留空；models 留空交由后台「同步本地模型」按钮拉取
        # base_url 默认 localhost，若部署在 Docker 中需手动改为 http://host.docker.internal:11434
        "name": "Ollama",
        "provider_type": "ollama",
        "models": [],
        "tags": ["llm", "local"],
        "base_url": "http://localhost:11434",
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


# 邮件模板种子数据：4 个 code × 2 个 locale = 8 条
_SEED_EMAIL_TEMPLATES = [
    {
        "code": "register_verify", "locale": "zh-CN",
        "name": "注册验证码",
        "subject": "【KunFlix】注册验证码 {code}",
        "html_body": (
            '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">'
            '<h2 style="color:#111">欢迎加入 KunFlix</h2>'
            '<p>您正在注册 KunFlix 账户，验证码为：</p>'
            '<p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#111">{code}</p>'
            '<p>验证码 {expires_minutes} 分钟内有效，请勿向他人泄露。</p>'
            '</div>'
        ),
        "text_body": "您的 KunFlix 注册验证码为 {code}，{expires_minutes} 分钟内有效。",
    },
    {
        "code": "register_verify", "locale": "en-US",
        "name": "Register verification",
        "subject": "[KunFlix] Your verification code {code}",
        "html_body": (
            '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">'
            '<h2>Welcome to KunFlix</h2>'
            '<p>Your verification code is:</p>'
            '<p style="font-size:28px;font-weight:700;letter-spacing:6px">{code}</p>'
            '<p>This code expires in {expires_minutes} minutes. Do not share it with anyone.</p>'
            '</div>'
        ),
        "text_body": "Your KunFlix verification code is {code}, valid for {expires_minutes} minutes.",
    },
    {
        "code": "change_password", "locale": "zh-CN",
        "name": "修改密码验证码",
        "subject": "【KunFlix】修改密码验证码 {code}",
        "html_body": (
            '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">'
            '<h2 style="color:#111">修改密码</h2>'
            '<p>您正在修改 KunFlix 账户密码，验证码为：</p>'
            '<p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#111">{code}</p>'
            '<p>验证码 {expires_minutes} 分钟内有效；如非本人操作请忽略本邮件。</p>'
            '</div>'
        ),
        "text_body": "您的 KunFlix 修改密码验证码为 {code}，{expires_minutes} 分钟内有效。",
    },
    {
        "code": "change_password", "locale": "en-US",
        "name": "Change password verification",
        "subject": "[KunFlix] Change password code {code}",
        "html_body": (
            '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">'
            '<h2>Change password</h2>'
            '<p>Your verification code is:</p>'
            '<p style="font-size:28px;font-weight:700;letter-spacing:6px">{code}</p>'
            '<p>This code expires in {expires_minutes} minutes. Ignore this email if it was not you.</p>'
            '</div>'
        ),
        "text_body": "Your KunFlix change-password code is {code}, valid for {expires_minutes} minutes.",
    },
    {
        "code": "reset_password", "locale": "zh-CN",
        "name": "重置密码验证码",
        "subject": "【KunFlix】重置密码验证码 {code}",
        "html_body": (
            '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">'
            '<h2 style="color:#111">重置密码</h2>'
            '<p>您正在重置 KunFlix 账户密码，验证码为：</p>'
            '<p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#111">{code}</p>'
            '<p>验证码 {expires_minutes} 分钟内有效；如非本人操作请尽快修改密码。</p>'
            '</div>'
        ),
        "text_body": "您的 KunFlix 重置密码验证码为 {code}，{expires_minutes} 分钟内有效。",
    },
    {
        "code": "reset_password", "locale": "en-US",
        "name": "Reset password verification",
        "subject": "[KunFlix] Reset password code {code}",
        "html_body": (
            '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">'
            '<h2>Reset password</h2>'
            '<p>Your verification code is:</p>'
            '<p style="font-size:28px;font-weight:700;letter-spacing:6px">{code}</p>'
            '<p>This code expires in {expires_minutes} minutes.</p>'
            '</div>'
        ),
        "text_body": "Your KunFlix reset-password code is {code}, valid for {expires_minutes} minutes.",
    },
    {
        "code": "admin_test", "locale": "zh-CN",
        "name": "管理员测试邮件",
        "subject": "【KunFlix】邮件服务测试",
        "html_body": (
            '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">'
            '<h2>邮件服务测试成功</h2>'
            '<p>这是一封来自 KunFlix 后台管理系统的测试邮件，用于验证邮件服务商配置可达。</p>'
            '<p>发送时间：{sent_at}</p>'
            '</div>'
        ),
        "text_body": "邮件服务测试成功，发送时间：{sent_at}",
    },
    {
        "code": "admin_test", "locale": "en-US",
        "name": "Admin test mail",
        "subject": "[KunFlix] Email service test",
        "html_body": (
            '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6">'
            '<h2>Email service test succeeded</h2>'
            '<p>This is a test email from KunFlix admin to verify the email provider configuration.</p>'
            '<p>Sent at: {sent_at}</p>'
            '</div>'
        ),
        "text_body": "Email service test succeeded. Sent at: {sent_at}",
    },
]

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
                    base_url=provider_config.get("base_url"),  # 本地供应商（如 Ollama）预填默认地址
                    models=provider_config["models"],
                    tags=provider_config.get("tags", []),
                    is_active=True,
                    is_default=False
                )
                session.add(provider)
            else:
                print(f"Provider {provider_config['name']} already exists.")

        # 2. Seed Admin——支持通过环境变量自定义（init-local.ps1 / docker exec 场景）
        admin_email = os.environ.get("KUNFLIX_INIT_EMAIL", "admin@example.com")
        admin_password = os.environ.get("KUNFLIX_INIT_PASSWORD", "Admin@12345")
        result = await session.execute(select(Admin).filter_by(email=admin_email))
        admin = result.scalars().first()
        if not admin:
            print(f"Creating default admin ({admin_email})...")
            admin = Admin(
                email=admin_email,
                nickname="Admin",
                password_hash=hash_password(admin_password),
                is_active=True,
                permission_level="super_admin"
            )
            session.add(admin)
        else:
            print(f"Admin {admin_email} already exists.")

        # 3. Seed Free Tier Subscription Plan
        #    注册时 routers/auth.py 会按 is_active=True 且 price_usd=0 按 sort_order 匹配首个免费套餐
        #    幂等：已存在同名套餐则跳过，不触发更新
        result = await session.execute(select(SubscriptionPlan).filter_by(name="Free"))
        free_plan = result.scalars().first()
        if not free_plan:
            print("Creating default Free tier subscription plan...")
            session.add(SubscriptionPlan(
                name="Free",
                description="免费基础套餐，适用于个人试用与轻量创作",
                tier_type="free_tier",  # 注册时 auth.py 按 tier_type='free_tier' 匹配
                price_usd=0,
                credits=100,
                billing_period="monthly",
                storage_quota_bytes=2147483648,  # 2GB
                features=["基础功能", "每月赠送 100 积分", "2GB 存储空间"],
                is_active=True,
                sort_order=0,  # 置顶，确保注册时优先匹配
            ))
        else:
            print("Free tier plan already exists.")

        # 4. Seed Prompt Templates
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

        # 5. Seed Email Templates——4 类模板 × 2 个 locale = 8 条
        for tpl in _SEED_EMAIL_TEMPLATES:
            result = await session.execute(
                select(EmailTemplate).filter_by(code=tpl["code"], locale=tpl["locale"])
            )
            existing = result.scalars().first()
            if not existing:
                print(f"Creating email template: {tpl['name']} ({tpl['locale']})...")
                session.add(EmailTemplate(
                    code=tpl["code"],
                    locale=tpl["locale"],
                    name=tpl["name"],
                    subject=tpl["subject"],
                    html_body=tpl["html_body"],
                    text_body=tpl["text_body"],
                    is_active=True,
                ))
            else:
                print(f"Email template {tpl['name']} ({tpl['locale']}) already exists.")

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
