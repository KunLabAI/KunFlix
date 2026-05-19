"""邮件模板加载与渲染。

加载顺序：
1) DB 中按 (code, locale) 匹配；
2) 失败回退英文 (code, en-US)；
3) 仍失败时使用内置 dict 兜底，保证「未配置任何模板」也能发出邮件。

变量替换走 Python str.format，未提供变量时保留 `{var}` 占位（防止 KeyError）。
"""
from __future__ import annotations

import logging
import string
from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import EmailTemplate

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 内置兜底模板：DB 中无任何记录时仍保证可用
# ---------------------------------------------------------------------------
_FALLBACK: dict[str, dict[str, str]] = {
    "register_verify": {
        "subject": "[KunFlix] Your verification code {code}",
        "html": (
            "<p>Your KunFlix verification code is "
            "<strong>{code}</strong>. It expires in {expires_minutes} minutes.</p>"
        ),
        "text": "Your KunFlix verification code is {code}, valid for {expires_minutes} minutes.",
    },
    "change_password": {
        "subject": "[KunFlix] Change password code {code}",
        "html": (
            "<p>Your KunFlix change-password code is "
            "<strong>{code}</strong>. It expires in {expires_minutes} minutes.</p>"
        ),
        "text": "Your KunFlix change-password code is {code}, valid for {expires_minutes} minutes.",
    },
    "reset_password": {
        "subject": "[KunFlix] Reset password code {code}",
        "html": (
            "<p>Your KunFlix reset-password code is "
            "<strong>{code}</strong>. It expires in {expires_minutes} minutes.</p>"
        ),
        "text": "Your KunFlix reset-password code is {code}, valid for {expires_minutes} minutes.",
    },
    "admin_test": {
        "subject": "[KunFlix] Email service test",
        "html": "<p>This is a test email from KunFlix admin. Sent at {sent_at}.</p>",
        "text": "Email service test. Sent at {sent_at}.",
    },
}


@dataclass
class RenderedTemplate:
    subject: str
    html: str
    text: Optional[str] = None


class _SafeFormatter(string.Formatter):
    """缺失变量时保留 `{key}` 占位，避免抛 KeyError。"""

    def get_value(self, key, args, kwargs):
        try:
            return super().get_value(key, args, kwargs)
        except (KeyError, IndexError):
            return "{" + str(key) + "}"


_FORMATTER = _SafeFormatter()


def _safe_format(tmpl: str, variables: dict[str, Any]) -> str:
    return _FORMATTER.format(tmpl, **variables)


async def _load_from_db(
    session: AsyncSession, code: str, locale: str
) -> Optional[EmailTemplate]:
    return await session.scalar(
        select(EmailTemplate)
        .where(EmailTemplate.code == code)
        .where(EmailTemplate.locale == locale)
        .where(EmailTemplate.is_active.is_(True))
    )


async def render_template(
    session: AsyncSession,
    *,
    code: str,
    locale: str = "zh-CN",
    variables: Optional[dict[str, Any]] = None,
) -> RenderedTemplate:
    """按 (code, locale) 加载模板并 format 变量。"""
    vars_: dict[str, Any] = dict(variables or {})

    # 加载顺序：locale → en-US → 内置兜底
    row = await _load_from_db(session, code, locale)
    row = row or (await _load_from_db(session, code, "en-US") if locale != "en-US" else None)

    if row:
        return RenderedTemplate(
            subject=_safe_format(row.subject, vars_),
            html=_safe_format(row.html_body, vars_),
            text=_safe_format(row.text_body, vars_) if row.text_body else None,
        )

    fb = _FALLBACK.get(code)
    fb or (_ for _ in ()).throw(KeyError(f"Unknown email template code: {code}"))
    return RenderedTemplate(
        subject=_safe_format(fb["subject"], vars_),
        html=_safe_format(fb["html"], vars_),
        text=_safe_format(fb["text"], vars_),
    )


__all__ = ["RenderedTemplate", "render_template"]
