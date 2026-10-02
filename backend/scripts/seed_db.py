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
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from config import settings
from models import LLMProvider, Admin, PromptTemplate, SubscriptionPlan, EmailTemplate
import bcrypt
# from passlib.context import CryptContext

# pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# seed 专用引擎：与 database.py 的全局 engine 隔离。_stamp_head 里的 alembic
# env.py 会 dispose 并关闭全局 engine 的事件循环，若 seed 复用全局 engine，
# 后续 commit/关连接会撞上 "Event loop is closed"。
_seed_engine = create_async_engine(settings.DATABASE_URL)
AsyncSessionLocal = async_sessionmaker(_seed_engine, expire_on_commit=False)

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

def run_migrations():
    """确保 schema 就绪：空库走 create_all + alembic stamp head 快通道。

    整条 alembic 迁移链是面向 SQLite 手写的（PRAGMA / sqlite_master /
    UUID 转换时序），在 PostgreSQL 上从零重放会因外键类型不匹配失败；
    与 startup._try_fast_bootstrap 相同的策略：直建终态 schema 后
    stamp head，增量迁移仍交由后续 alembic upgrade 处理。
    """
    import asyncio

    from sqlalchemy import inspect
    from sqlalchemy.ext.asyncio import create_async_engine

    from database import Base

    print("Ensuring database schema...")

    async def _bootstrap() -> bool:
        bootstrap_engine = create_async_engine(settings.DATABASE_URL)
        async with bootstrap_engine.begin() as conn:
            tables = await conn.run_sync(lambda sc: inspect(sc).get_table_names())
            is_fresh = "users" not in tables
            is_fresh and await conn.run_sync(Base.metadata.create_all)
        await bootstrap_engine.dispose()
        return is_fresh

    # stamp 必须在 asyncio.run 之外：alembic env.py 内部会再起 asyncio.run，
    # 在运行中的循环里嵌套调用会报 RuntimeError
    is_fresh = asyncio.run(_bootstrap())
    is_fresh and _stamp_head()
    print("Database migrations completed.")


def _stamp_head():
    """create_all 建库后把 alembic 版本标记到 head，避免重放历史迁移。"""
    from alembic import command
    from alembic.config import Config

    alembic_ini_path = os.path.join(_BACKEND_DIR, "alembic.ini")
    command.stamp(Config(alembic_ini_path), "head")

# 默认供应商配置（不包含 API Key，需在部署后配置）
#
# 模型型号与分类严格对齐《各平台最新模型型号汇总-2026-10-02.md》：仅收录 2026 年在役
# （✅ 已核实 / 🟡 待核实）的公开 API 型号。已下线 / 已退役 / 无公开 API 的型号一律剔除：
#   OpenAI Sora 全系（2026-09-24 停服，无替代）、Google imagen-* 全系（2026-08-17 退役）、
#   MiniMax 音乐全系（2026-08-20 起对新用户关闭）、deepseek-v4-flash（旧 Flash 系列退役）、
#   grok-4.20-0309-* 日期快照与 grok-imagine-image-pro（非文档在列 ID）、MiniMax-M2.5（2025 型号）。
#
# model_metadata[model].model_type 取值须匹配后端分类字段定义（admin MODEL_TYPE_OPTIONS）：
#   language（语言）/ multimodal（多模态）/ image（图像）/ video（视频）/ audio（音乐）/ tts（语音）。
# 图像 / 视频 / 音乐 / TTS 路由严格按 model_type 过滤模型，故这些类型必须显式标注元数据；
# 且各生成管线仅支持特定 provider_type：图像=xai/gemini/ark/openrouter，视频=xai/minimax/gemini/ark/dashscope，
# 音乐与 TTS=仅 gemini。视频型号还需存在于 services/video_providers/model_capabilities.py 才有完整能力配置。
DEFAULT_PROVIDERS = [
    {
        "name": "OpenAI",
        "provider_type": "openai",
        # 仅对话 / 推理模型：OpenAI 图像（gpt-image-*）走独立 /v1/images 接口、未接入 KunFlix 图像管线；
        # 视频能力已全线停服（Sora 退役，无替代）；语音为 realtime/transcribe 端点，均不在此列出。
        "models": [
            "gpt-6.1-sol", "gpt-6-astra", "gpt-6-sol", "gpt-6-luna",
            "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna",
            "gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.3-codex",
        ],
        "tags": ["llm"],
        "model_metadata": {
            "gpt-6.1-sol":   {"model_type": "multimodal", "display_name": "GPT-6.1 Sol"},
            "gpt-6-astra":   {"model_type": "multimodal", "display_name": "GPT-6 Astra"},
            "gpt-6-sol":     {"model_type": "multimodal", "display_name": "GPT-6 Sol"},
            "gpt-6-luna":    {"model_type": "multimodal", "display_name": "GPT-6 Luna"},
            "gpt-5.6-sol":   {"model_type": "language",   "display_name": "GPT-5.6 Sol"},
            "gpt-5.6-terra": {"model_type": "language",   "display_name": "GPT-5.6 Terra"},
            "gpt-5.6-luna":  {"model_type": "language",   "display_name": "GPT-5.6 Luna"},
            "gpt-5.5":       {"model_type": "language",   "display_name": "GPT-5.5"},
            "gpt-5.4":       {"model_type": "language",   "display_name": "GPT-5.4"},
            "gpt-5.4-mini":  {"model_type": "language",   "display_name": "GPT-5.4 Mini"},
            "gpt-5.4-nano":  {"model_type": "language",   "display_name": "GPT-5.4 Nano"},
            "gpt-5.3-codex": {"model_type": "language",   "display_name": "GPT-5.3 Codex"},
        },
    },
    {
        "name": "Gemini",
        "provider_type": "gemini",
        "models": [
            # 对话 / 多模态（文本 + 图像 + 视频 + 音频 → 文本）
            "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash",
            "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite",
            "gemini-3.1-pro-preview",
            # 图像（Nano Banana 系列）
            "gemini-3.1-flash-image", "gemini-3-pro-image", "gemini-3.1-flash-lite-image",
            # 视频（Veo 3.1）
            "veo-3.1-generate-preview", "veo-3.1-fast-generate-preview", "veo-3.1-lite-generate-preview",
            # 音乐（Lyria 3）
            "lyria-3-pro-preview", "lyria-3-clip-preview",
            # 语音合成（TTS）
            "gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts",
        ],
        "tags": ["llm", "image", "video", "audio", "tts"],
        "model_metadata": {
            "gemini-3.8-flash":       {"model_type": "multimodal", "display_name": "Gemini 3.8 Flash"},
            "gemini-3.7-flash":       {"model_type": "multimodal", "display_name": "Gemini 3.7 Flash"},
            "gemini-3.6-flash":       {"model_type": "multimodal", "display_name": "Gemini 3.6 Flash"},
            "gemini-3.5-flash":       {"model_type": "multimodal", "display_name": "Gemini 3.5 Flash"},
            "gemini-3.5-flash-lite":  {"model_type": "multimodal", "display_name": "Gemini 3.5 Flash-Lite"},
            "gemini-3.1-flash-lite":  {"model_type": "multimodal", "display_name": "Gemini 3.1 Flash-Lite"},
            "gemini-3.1-pro-preview": {"model_type": "multimodal", "display_name": "Gemini 3.1 Pro Preview"},
            "gemini-3.1-flash-image":      {"model_type": "image", "display_name": "Nano Banana 2（3.1 Flash Image）"},
            "gemini-3-pro-image":          {"model_type": "image", "display_name": "Nano Banana Pro（3 Pro Image）"},
            "gemini-3.1-flash-lite-image": {"model_type": "image", "display_name": "Nano Banana 2 Lite"},
            "veo-3.1-generate-preview":      {"model_type": "video", "display_name": "Veo 3.1"},
            "veo-3.1-fast-generate-preview": {"model_type": "video", "display_name": "Veo 3.1 Fast"},
            "veo-3.1-lite-generate-preview": {"model_type": "video", "display_name": "Veo 3.1 Lite"},
            "lyria-3-pro-preview":  {"model_type": "audio", "display_name": "Lyria 3 Pro"},
            "lyria-3-clip-preview": {"model_type": "audio", "display_name": "Lyria 3 Clip"},
            "gemini-3.8-flash-tts":      {"model_type": "tts", "display_name": "Gemini 3.8 Flash TTS"},
            "gemini-3.8-flash-lite-tts": {"model_type": "tts", "display_name": "Gemini 3.8 Flash-Lite TTS"},
        },
    },
    {
        "name": "MiniMax",
        "provider_type": "minimax",
        "models": ["MiniMax-M3.1-Flash-Preview", "MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-H3"],
        "tags": ["llm", "video"],
        "model_metadata": {
            "MiniMax-M3.1-Flash-Preview": {"model_type": "multimodal", "display_name": "MiniMax M3.1 Flash（预览）"},
            "MiniMax-M3":                 {"model_type": "multimodal", "display_name": "MiniMax M3"},
            "MiniMax-M2.7":               {"model_type": "language",   "display_name": "MiniMax M2.7"},
            "MiniMax-M2.7-highspeed":     {"model_type": "language",   "display_name": "MiniMax M2.7 Highspeed"},
            "MiniMax-H3":                 {"model_type": "video",      "display_name": "MiniMax H3"},
        },
    },
    {
        "name": "Grok",
        "provider_type": "xai",
        "models": [
            # 对话 / 多模态（文本 + 图像，grok-4.3 起支持视频输入）
            "grok-4.7", "grok-4.6", "grok-4.5", "grok-4.3",
            "grok-4.20-reasoning", "grok-4.20-non-reasoning", "grok-4.20-multi-agent",
            "grok-build-0.1",
            # 图像（独立 API）
            "grok-imagine-image", "grok-imagine-image-quality",
            # 视频（独立 API，1.5 为当前最新代）
            "grok-imagine-video-1.5", "grok-imagine-video-1.5-lite",
        ],
        "tags": ["llm", "image", "video"],
        "model_metadata": {
            "grok-4.7": {"model_type": "multimodal", "display_name": "Grok 4.7"},
            "grok-4.6": {"model_type": "multimodal", "display_name": "Grok 4.6"},
            "grok-4.5": {"model_type": "multimodal", "display_name": "Grok 4.5"},
            "grok-4.3": {"model_type": "multimodal", "display_name": "Grok 4.3"},
            "grok-4.20-reasoning":     {"model_type": "multimodal", "display_name": "Grok 4.20 Reasoning"},
            "grok-4.20-non-reasoning": {"model_type": "multimodal", "display_name": "Grok 4.20 Non-Reasoning"},
            "grok-4.20-multi-agent":   {"model_type": "multimodal", "display_name": "Grok 4.20 Multi-Agent"},
            "grok-build-0.1":          {"model_type": "language",   "display_name": "Grok Build 0.1"},
            "grok-imagine-image":         {"model_type": "image", "display_name": "Grok Imagine Image"},
            "grok-imagine-image-quality": {"model_type": "image", "display_name": "Grok Imagine Image（高质量）"},
            "grok-imagine-video-1.5":      {"model_type": "video", "display_name": "Grok Imagine Video 1.5"},
            "grok-imagine-video-1.5-lite": {"model_type": "video", "display_name": "Grok Imagine Video 1.5 Lite"},
        },
    },
    {
        "name": "火山方舟",
        "provider_type": "ark",
        "models": [
            # 豆包语言 / 多模态（通用端点仅认带日期后缀完整 ID；doubao-seed-evolving 为唯一无版本号别名）
            "doubao-seed-2-1-pro-260628", "doubao-seed-2-1-turbo-260628", "doubao-seed-evolving",
            "doubao-seed-2-0-pro-260215", "doubao-seed-2-0-lite-260428", "doubao-seed-2-0-mini-260428",
            "doubao-seed-2-0-code-preview-260215",
            # 图像（Seedream 5.0）
            "doubao-seedream-5-0-pro-260628", "doubao-seedream-5-0-260128",
            # 视频（Seedance 2.0）
            "doubao-seedance-2-0-260128", "doubao-seedance-2-0-fast-260128",
        ],
        "tags": ["llm", "image", "video"],
        "model_metadata": {
            "doubao-seed-2-1-pro-260628":   {"model_type": "multimodal", "display_name": "豆包 Seed 2.1 Pro"},
            "doubao-seed-2-1-turbo-260628": {"model_type": "multimodal", "display_name": "豆包 Seed 2.1 Turbo"},
            "doubao-seed-evolving":         {"model_type": "multimodal", "display_name": "豆包 Seed Evolving"},
            "doubao-seed-2-0-pro-260215":   {"model_type": "multimodal", "display_name": "豆包 Seed 2.0 Pro"},
            "doubao-seed-2-0-lite-260428":  {"model_type": "multimodal", "display_name": "豆包 Seed 2.0 Lite（全模态）"},
            "doubao-seed-2-0-mini-260428":  {"model_type": "multimodal", "display_name": "豆包 Seed 2.0 Mini（全模态）"},
            "doubao-seed-2-0-code-preview-260215": {"model_type": "language", "display_name": "豆包 Seed 2.0 Code"},
            "doubao-seedream-5-0-pro-260628": {"model_type": "image", "display_name": "Seedream 5.0 Pro"},
            "doubao-seedream-5-0-260128":     {"model_type": "image", "display_name": "Seedream 5.0"},
            "doubao-seedance-2-0-260128":      {"model_type": "video", "display_name": "Seedance 2.0"},
            "doubao-seedance-2-0-fast-260128": {"model_type": "video", "display_name": "Seedance 2.0 Fast"},
        },
    },
    {
        # 阿里百炼：Wan3.0 全能参考视频模型 (All-in-One: 文生视频 / 图生视频 / 参考生视频 / 编辑 / 延长)
        # 地域限制：模型、Endpoint URL、API Key 必须同地域，部署后需将 base_url 配置为
        # https://{业务空间ID}.{地域}.maas.aliyuncs.com（如北京: https://llm-xxxx.cn-beijing.maas.aliyuncs.com）
        # 注：该平台不在《2026-10-02 型号汇总》文档覆盖范围内，维持既有 Wan3.0 集成不变。
        "name": "阿里百炼",
        "provider_type": "dashscope",
        "models": ["wan3.0-video-prime", "wan3.0-video"],
        "tags": ["video"],
        "model_metadata": {
            "wan3.0-video-prime": {"model_type": "video", "display_name": "万相3.0 高速版"},
            "wan3.0-video": {"model_type": "video", "display_name": "万相3.0 标准版"},
        },
    },
    {
        "name": "DeepSeek",
        "provider_type": "deepseek",
        # 官方当前仅两个在役型号：deepseek-flash（V4.1-Flash，原生视觉）、deepseek-v4-pro（纯文本旗舰）
        "models": ["deepseek-flash", "deepseek-v4-pro"],
        "tags": ["llm"],
        "model_metadata": {
            "deepseek-flash":  {"model_type": "multimodal", "display_name": "DeepSeek V4.1 Flash"},
            "deepseek-v4-pro": {"model_type": "language",   "display_name": "DeepSeek V4 Pro"},
        },
    },
    {
        "name": "Kimi",
        "provider_type": "kimi",
        # 官方当前仅 4 个在役型号（platform.kimi.com/docs/models）
        "models": ["kimi-k3", "kimi-k2.7-code", "kimi-k2.7-code-highspeed", "kimi-k2.6"],
        "tags": ["llm"],
        "model_metadata": {
            "kimi-k3":                  {"model_type": "multimodal", "display_name": "Kimi K3"},
            "kimi-k2.7-code":           {"model_type": "multimodal", "display_name": "Kimi K2.7 Code"},
            "kimi-k2.7-code-highspeed": {"model_type": "multimodal", "display_name": "Kimi K2.7 Code Highspeed"},
            "kimi-k2.6":                {"model_type": "multimodal", "display_name": "Kimi K2.6"},
        },
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
                    api_key="",  # API Key 需在部署后配置（地域必须与模型/Endpoint 一致）
                    base_url=provider_config.get("base_url"),  # 本地供应商（如 Ollama）预填默认地址；百炼需配置同地域 Endpoint
                    models=provider_config["models"],
                    tags=provider_config.get("tags", []),
                    # 模型元数据 (model_type: video 等 + display_name)，用户端供应商列表据此展示
                    model_metadata=provider_config.get("model_metadata", {}),
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
    await _seed_engine.dispose()
    print("Seeding completed.")

if __name__ == "__main__":
    try:
        # 先执行数据库迁移（创建表）
        run_migrations()
        # 再执行数据初始化
        asyncio.run(seed())
    except Exception as e:
        print(f"Seeding failed: {e}")
        sys.exit(1)
