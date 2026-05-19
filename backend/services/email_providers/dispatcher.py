"""表驱动的邮件分发器：依据 EmailProvider 表选择 active && is_default 的供应商。

调用方仅需 `await send_email(session, to, code, locale, variables)`，
缺失供应商抛 EmailProviderNotConfigured；上游失败抛 EmailProviderError。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Callable, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import EmailProvider
from services.email_providers.base import (
    EmailProviderError,
    EmailProviderNotConfigured,
    EmailSender,
    SendResult,
)
from services.email_providers.resend import ResendEmailSender
from services.email_providers.templates import render_template

logger = logging.getLogger(__name__)


# 表驱动：provider_type → factory(api_key) → EmailSender
_BUILDERS: dict[str, Callable[[str], EmailSender]] = {
    "resend": lambda key: ResendEmailSender(api_key=key),
}


async def get_default_provider(session: AsyncSession) -> Optional[EmailProvider]:
    """读取 active && is_default 的供应商；无 default 时回退第一条 active 记录。"""
    row = await session.scalar(
        select(EmailProvider)
        .where(EmailProvider.is_active.is_(True))
        .where(EmailProvider.is_default.is_(True))
    )
    row = row or await session.scalar(
        select(EmailProvider).where(EmailProvider.is_active.is_(True))
    )
    return row


def _build_sender(provider: EmailProvider) -> EmailSender:
    builder = _BUILDERS.get(provider.provider_type)
    builder or (_ for _ in ()).throw(
        EmailProviderError(f"Unsupported provider_type: {provider.provider_type}")
    )
    provider.api_key or (_ for _ in ()).throw(
        EmailProviderError(f"Provider {provider.name} missing api_key")
    )
    return builder(provider.api_key)


async def send_email(
    session: AsyncSession,
    *,
    to: str,
    code: str,
    locale: str = "zh-CN",
    variables: Optional[dict] = None,
) -> SendResult:
    """通过当前默认供应商发送预定义模板邮件。"""
    provider = await get_default_provider(session)
    provider or (_ for _ in ()).throw(
        EmailProviderNotConfigured("No active email provider configured")
    )

    rendered = await render_template(session, code=code, locale=locale, variables=variables)
    sender = _build_sender(provider)

    try:
        result = await sender.send(
            to=to,
            subject=rendered.subject,
            html=rendered.html,
            text=rendered.text,
            from_email=provider.from_email,
            from_name=provider.from_name,
            reply_to=provider.reply_to,
        )
    except EmailProviderError as exc:
        provider.last_error_at = datetime.now(timezone.utc)
        provider.last_error_message = str(exc)[:1000]
        await session.commit()
        raise

    provider.last_success_at = datetime.now(timezone.utc)
    provider.last_error_message = None
    await session.commit()
    logger.info(
        "Email sent provider=%s template=%s to=%s message_id=%s",
        provider.name, code, to, result.message_id,
    )
    return result


async def send_raw(
    session: AsyncSession,
    *,
    to: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
) -> SendResult:
    """绕过模板直接发送（管理员测试场景）。"""
    provider = await get_default_provider(session)
    provider or (_ for _ in ()).throw(
        EmailProviderNotConfigured("No active email provider configured")
    )
    sender = _build_sender(provider)
    try:
        result = await sender.send(
            to=to,
            subject=subject,
            html=html,
            text=text,
            from_email=provider.from_email,
            from_name=provider.from_name,
            reply_to=provider.reply_to,
        )
    except EmailProviderError as exc:
        provider.last_error_at = datetime.now(timezone.utc)
        provider.last_error_message = str(exc)[:1000]
        await session.commit()
        raise

    provider.last_success_at = datetime.now(timezone.utc)
    provider.last_error_message = None
    await session.commit()
    return result


__all__ = ["send_email", "send_raw", "get_default_provider"]
