"""Resend 邮件服务实现 — 直接调用 https://api.resend.com/emails REST。

- 不引入 resend SDK，避免新增 Python 依赖
- 失败统一抛 EmailProviderError，上层兜底
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from services.email_providers.base import (
    EmailProviderError,
    EmailSender,
    SendResult,
)

logger = logging.getLogger(__name__)

_API_URL = "https://api.resend.com/emails"
_TIMEOUT = httpx.Timeout(20.0, connect=5.0)


def _format_from(email: str, name: Optional[str]) -> str:
    """Resend 接受 `Name <email>` 或裸邮箱两种格式。"""
    return f"{name} <{email}>" if (name and email) else email


class ResendEmailSender(EmailSender):
    """Resend HTTP 实现。"""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def send(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        text: Optional[str] = None,
        from_email: Optional[str] = None,
        from_name: Optional[str] = None,
        reply_to: Optional[str] = None,
        extra: Optional[dict[str, Any]] = None,
    ) -> SendResult:
        from_email or (_ for _ in ()).throw(
            EmailProviderError("Resend `from_email` is required")
        )

        payload: dict[str, Any] = {
            "from": _format_from(from_email, from_name),
            "to": [to],
            "subject": subject,
            "html": html,
        }
        text and payload.update({"text": text})
        reply_to and payload.update({"reply_to": reply_to})
        extra and payload.update(extra)

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                resp = await client.post(_API_URL, json=payload, headers=headers)
        except httpx.HTTPError as exc:
            logger.warning("Resend network error: %s", exc)
            raise EmailProviderError(f"Resend network error: {exc}") from exc

        if resp.status_code >= 400:
            text_body = resp.text[:500]
            logger.warning("Resend non-2xx status=%s body=%s", resp.status_code, text_body)
            raise EmailProviderError(f"Resend HTTP {resp.status_code}: {text_body}")

        data = resp.json() if resp.content else {}
        return SendResult(provider="resend", message_id=data.get("id"), raw=data)


__all__ = ["ResendEmailSender"]
