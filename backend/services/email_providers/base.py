"""EmailSender 协议与异常类型。

设计要点：
- 所有供应商实现统一返回 SendResult；失败抛 EmailProviderError，不返回 False。
- 异常分级：未配置（503 暴露）/ 上游失败（502 暴露），便于路由层映射。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Protocol, runtime_checkable


class EmailProviderError(RuntimeError):
    """供应商调用失败（密钥错误、上游 5xx 等）。"""


class EmailProviderNotConfigured(RuntimeError):
    """系统中尚未配置任何 active 邮件服务商。"""


@dataclass
class SendResult:
    """统一的发送结果，便于上层落库 / 审计。"""

    provider: str
    message_id: Optional[str] = None
    raw: Optional[dict] = None


@runtime_checkable
class EmailSender(Protocol):
    """所有邮件供应商实现必须满足的最小接口。"""

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
        raise NotImplementedError


__all__ = [
    "EmailSender",
    "SendResult",
    "EmailProviderError",
    "EmailProviderNotConfigured",
]
