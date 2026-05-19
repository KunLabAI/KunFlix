"""管理员邮件服务商配置路由。

挂载点：/api/admin/email-providers
权限：所有端点均需 require_admin

设计要点：
- api_key 写入即被 EncryptedString 透明加密；查询返回时仅给出末四位 mask
- is_default 全局唯一约束：写入新 default 时自动把其他 active provider 的 is_default 置 False
- 测试发送复用 dispatcher.send_raw（admin_test 模板），失败状态实时回写到 provider 行
- 模板 CRUD：仅支持按 code+locale 维度更新内容；新增模板由 seed 迁移负责
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_admin
from database import get_db
from models import Admin, EmailProvider, EmailTemplate
from schemas import (
    EmailProviderCreate,
    EmailProviderResponse,
    EmailProviderTestSendRequest,
    EmailProviderUpdate,
    EmailTemplateResponse,
    EmailTemplateUpdate,
)
from services import audit
from services.email_providers.base import (
    EmailProviderError,
    EmailProviderNotConfigured,
)
from services.email_providers.dispatcher import send_email
from services.email_providers.templates import render_template

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/admin/email-providers",
    tags=["admin-email-providers"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _mask_key(key: Optional[str]) -> str:
    """返回末四位 + 前缀 ***；空值返回空串。"""
    return f"***{key[-4:]}" if key and len(key) >= 4 else ("***" if key else "")


def _to_response(p: EmailProvider) -> EmailProviderResponse:
    return EmailProviderResponse(
        id=p.id,
        name=p.name,
        provider_type=p.provider_type,
        from_email=p.from_email,
        from_name=p.from_name,
        reply_to=p.reply_to,
        is_active=bool(p.is_active),
        is_default=bool(p.is_default),
        config_json=p.config_json or {},
        api_key=p.api_key or "",
        api_key_masked=_mask_key(p.api_key),
        last_success_at=p.last_success_at,
        last_error_at=p.last_error_at,
        last_error_message=p.last_error_message,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


async def _ensure_unique_default(db: AsyncSession, target_id: str) -> None:
    """把除 target_id 外所有记录的 is_default 置 False，确保全局唯一。"""
    await db.execute(
        update(EmailProvider)
        .where(EmailProvider.id != target_id)
        .values(is_default=False)
    )


async def _get_or_404(db: AsyncSession, provider_id: str) -> EmailProvider:
    p = await db.scalar(select(EmailProvider).where(EmailProvider.id == provider_id))
    p or (_ for _ in ()).throw(
        HTTPException(status_code=404, detail="Email provider not found")
    )
    return p


# ---------------------------------------------------------------------------
# Provider CRUD
# ---------------------------------------------------------------------------
@router.get("", response_model=List[EmailProviderResponse])
async def list_providers(
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> List[EmailProviderResponse]:
    rows = (await db.scalars(select(EmailProvider).order_by(EmailProvider.created_at))).all()
    return [_to_response(r) for r in rows]


@router.post("", response_model=EmailProviderResponse, status_code=status.HTTP_201_CREATED)
async def create_provider(
    body: EmailProviderCreate,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> EmailProviderResponse:
    # 名称冲突直接 409
    dup = await db.scalar(select(EmailProvider).where(EmailProvider.name == body.name))
    dup and (_ for _ in ()).throw(
        HTTPException(status_code=409, detail="Provider name already exists")
    )

    provider = EmailProvider(
        name=body.name,
        provider_type=body.provider_type,
        api_key=body.api_key,
        from_email=body.from_email,
        from_name=body.from_name,
        reply_to=body.reply_to,
        is_active=body.is_active,
        is_default=body.is_default,
        config_json=body.config_json or {},
    )
    db.add(provider)
    await db.flush()
    body.is_default and await _ensure_unique_default(db, provider.id)
    await db.commit()
    await db.refresh(provider)

    audit.record(
        action="admin.email_provider_create",
        actor=current_admin,
        resource_type="email_provider",
        resource_id=provider.id,
        detail={"name": provider.name, "type": provider.provider_type},
        request=request,
    )
    return _to_response(provider)


@router.get("/{provider_id}", response_model=EmailProviderResponse)
async def get_provider(
    provider_id: str,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> EmailProviderResponse:
    return _to_response(await _get_or_404(db, provider_id))


@router.patch("/{provider_id}", response_model=EmailProviderResponse)
async def update_provider(
    provider_id: str,
    body: EmailProviderUpdate,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> EmailProviderResponse:
    provider = await _get_or_404(db, provider_id)
    patch = body.model_dump(exclude_none=True)
    not patch and (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="No valid fields provided")
    )

    # 名称变更需检查唯一性
    new_name = patch.get("name")
    if new_name and new_name != provider.name:
        dup = await db.scalar(
            select(EmailProvider)
            .where(EmailProvider.name == new_name)
            .where(EmailProvider.id != provider_id)
        )
        dup and (_ for _ in ()).throw(
            HTTPException(status_code=409, detail="Provider name already exists")
        )

    for field, val in patch.items():
        setattr(provider, field, val)

    patch.get("is_default") is True and await _ensure_unique_default(db, provider_id)
    await db.commit()
    await db.refresh(provider)

    audit.record(
        action="admin.email_provider_update",
        actor=current_admin,
        resource_type="email_provider",
        resource_id=provider_id,
        detail={"fields": list(patch.keys())},
        request=request,
    )
    return _to_response(provider)


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_provider(
    provider_id: str,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    provider = await _get_or_404(db, provider_id)
    await db.delete(provider)
    await db.commit()

    audit.record(
        action="admin.email_provider_delete",
        actor=current_admin,
        resource_type="email_provider",
        resource_id=provider_id,
        request=request,
    )
    return None


@router.post("/{provider_id}/set-default", response_model=EmailProviderResponse)
async def set_default(
    provider_id: str,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> EmailProviderResponse:
    """显式设置某个 provider 为默认；其他记录自动取消 default。"""
    provider = await _get_or_404(db, provider_id)
    provider.is_default = True
    provider.is_active = True
    await db.flush()
    await _ensure_unique_default(db, provider_id)
    await db.commit()
    await db.refresh(provider)

    audit.record(
        action="admin.email_provider_set_default",
        actor=current_admin,
        resource_type="email_provider",
        resource_id=provider_id,
        request=request,
    )
    return _to_response(provider)


@router.post("/{provider_id}/test-send")
async def test_send(
    provider_id: str,
    body: EmailProviderTestSendRequest,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """通过指定 provider 发送测试邮件（admin_test 模板）。

    实现策略：临时把目标 provider 置为 default + active 不可行（会污染状态），
    改为「直接构造 sender」执行。失败时同步落到 last_error_at/_message。
    """
    provider = await _get_or_404(db, provider_id)
    provider.api_key or (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="Provider missing api_key")
    )

    locale = body.locale or "zh-CN"
    rendered = await render_template(
        db,
        code="admin_test",
        locale=locale,
        variables={
            "sent_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "admin_email": getattr(current_admin, "email", ""),
        },
    )

    # 直接复用 dispatcher 的 _BUILDERS，不污染默认 provider
    from services.email_providers.dispatcher import _BUILDERS  # noqa: WPS437

    builder = _BUILDERS.get(provider.provider_type)
    builder or (_ for _ in ()).throw(
        HTTPException(
            status_code=400,
            detail=f"Unsupported provider_type: {provider.provider_type}",
        )
    )
    sender = builder(provider.api_key)

    try:
        result = await sender.send(
            to=body.to,
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
        await db.commit()
        raise HTTPException(status_code=502, detail=f"Send failed: {exc}") from exc

    provider.last_success_at = datetime.now(timezone.utc)
    provider.last_error_message = None
    await db.commit()

    audit.record(
        action="admin.email_provider_test_send",
        actor=current_admin,
        resource_type="email_provider",
        resource_id=provider_id,
        detail={"to": body.to, "message_id": result.message_id},
        request=request,
    )
    return {
        "ok": True,
        "provider": result.provider,
        "message_id": result.message_id,
    }


# ---------------------------------------------------------------------------
# Email Templates (跨 provider 共用)
# ---------------------------------------------------------------------------
templates_router = APIRouter(
    prefix="/api/admin/email-templates",
    tags=["admin-email-templates"],
)


@templates_router.get("", response_model=List[EmailTemplateResponse])
async def list_templates(
    code: Optional[str] = None,
    locale: Optional[str] = None,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> List[EmailTemplateResponse]:
    stmt = select(EmailTemplate).order_by(EmailTemplate.code, EmailTemplate.locale)
    stmt = stmt.where(EmailTemplate.code == code) if code else stmt
    stmt = stmt.where(EmailTemplate.locale == locale) if locale else stmt
    rows = (await db.scalars(stmt)).all()
    return [EmailTemplateResponse.model_validate(r) for r in rows]


@templates_router.get("/{template_id}", response_model=EmailTemplateResponse)
async def get_template(
    template_id: str,
    _admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> EmailTemplateResponse:
    row = await db.scalar(select(EmailTemplate).where(EmailTemplate.id == template_id))
    row or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Template not found"))
    return EmailTemplateResponse.model_validate(row)


@templates_router.patch("/{template_id}", response_model=EmailTemplateResponse)
async def update_template(
    template_id: str,
    body: EmailTemplateUpdate,
    request: Request,
    current_admin: Admin = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> EmailTemplateResponse:
    row = await db.scalar(select(EmailTemplate).where(EmailTemplate.id == template_id))
    row or (_ for _ in ()).throw(HTTPException(status_code=404, detail="Template not found"))

    patch = body.model_dump(exclude_none=True)
    not patch and (_ for _ in ()).throw(
        HTTPException(status_code=400, detail="No valid fields provided")
    )
    for field, val in patch.items():
        setattr(row, field, val)
    await db.commit()
    await db.refresh(row)

    audit.record(
        action="admin.email_template_update",
        actor=current_admin,
        resource_type="email_template",
        resource_id=template_id,
        detail={"fields": list(patch.keys())},
        request=request,
    )
    return EmailTemplateResponse.model_validate(row)


__all__ = ["router", "templates_router"]
