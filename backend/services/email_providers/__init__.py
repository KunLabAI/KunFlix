"""Email provider 抽象与表驱动分发。

模块组织：
- base.py        — EmailSender Protocol 与 SendResult / EmailProviderError
- resend.py      — Resend HTTP API 实现（httpx 直连，无 SDK 依赖）
- templates.py   — (code, locale) → 模板加载，缺失自动回退英文 → 内置兜底
- dispatcher.py  — 依据 EmailProvider 表选择 active+default 供应商进行发送
"""
from services.email_providers.base import (  # noqa: F401
    EmailSender,
    SendResult,
    EmailProviderError,
    EmailProviderNotConfigured,
)
from services.email_providers.dispatcher import (  # noqa: F401
    send_email,
    get_default_provider,
)
from services.email_providers.templates import render_template  # noqa: F401
