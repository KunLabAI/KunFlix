"""add_email_providers_and_templates

Revision ID: e7a8b9c0d1f2
Revises: c9d0e1f2a3b4
Create Date: 2026-05-19 10:00:00.000000

新增邮件服务商与邮件模板表，并 seed 4 类模板（zh-CN/en-US 共 8 条）。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "e7a8b9c0d1f2"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Seed 模板：4 个 code × 2 个 locale = 8 条
# 占位变量遵循 Python str.format 风格：{code}, {nickname}, {expires_minutes}
# ---------------------------------------------------------------------------
_SEED_TEMPLATES = [
    {
        "code": "register_verify", "locale": "zh-CN",
        "name": "注册验证码",
        "subject": "【KunFlix】注册验证码 {code}",
        "html_body": (
            "<div style=\"font-family:Arial,Helvetica,sans-serif;line-height:1.6\">"
            "<h2 style=\"color:#111\">欢迎加入 KunFlix</h2>"
            "<p>您正在注册 KunFlix 账户，验证码为：</p>"
            "<p style=\"font-size:28px;font-weight:700;letter-spacing:6px;color:#111\">{code}</p>"
            "<p>验证码 {expires_minutes} 分钟内有效，请勿向他人泄露。</p>"
            "</div>"
        ),
        "text_body": "您的 KunFlix 注册验证码为 {code}，{expires_minutes} 分钟内有效。",
    },
    {
        "code": "register_verify", "locale": "en-US",
        "name": "Register verification",
        "subject": "[KunFlix] Your verification code {code}",
        "html_body": (
            "<div style=\"font-family:Arial,Helvetica,sans-serif;line-height:1.6\">"
            "<h2>Welcome to KunFlix</h2>"
            "<p>Your verification code is:</p>"
            "<p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">{code}</p>"
            "<p>This code expires in {expires_minutes} minutes. Do not share it with anyone.</p>"
            "</div>"
        ),
        "text_body": "Your KunFlix verification code is {code}, valid for {expires_minutes} minutes.",
    },
    {
        "code": "change_password", "locale": "zh-CN",
        "name": "修改密码验证码",
        "subject": "【KunFlix】修改密码验证码 {code}",
        "html_body": (
            "<div style=\"font-family:Arial,Helvetica,sans-serif;line-height:1.6\">"
            "<h2 style=\"color:#111\">修改密码</h2>"
            "<p>您正在修改 KunFlix 账户密码，验证码为：</p>"
            "<p style=\"font-size:28px;font-weight:700;letter-spacing:6px;color:#111\">{code}</p>"
            "<p>验证码 {expires_minutes} 分钟内有效；如非本人操作请忽略本邮件。</p>"
            "</div>"
        ),
        "text_body": "您的 KunFlix 修改密码验证码为 {code}，{expires_minutes} 分钟内有效。",
    },
    {
        "code": "change_password", "locale": "en-US",
        "name": "Change password verification",
        "subject": "[KunFlix] Change password code {code}",
        "html_body": (
            "<div style=\"font-family:Arial,Helvetica,sans-serif;line-height:1.6\">"
            "<h2>Change password</h2>"
            "<p>Your verification code is:</p>"
            "<p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">{code}</p>"
            "<p>This code expires in {expires_minutes} minutes. Ignore this email if it was not you.</p>"
            "</div>"
        ),
        "text_body": "Your KunFlix change-password code is {code}, valid for {expires_minutes} minutes.",
    },
    {
        "code": "reset_password", "locale": "zh-CN",
        "name": "重置密码验证码",
        "subject": "【KunFlix】重置密码验证码 {code}",
        "html_body": (
            "<div style=\"font-family:Arial,Helvetica,sans-serif;line-height:1.6\">"
            "<h2 style=\"color:#111\">重置密码</h2>"
            "<p>您正在重置 KunFlix 账户密码，验证码为：</p>"
            "<p style=\"font-size:28px;font-weight:700;letter-spacing:6px;color:#111\">{code}</p>"
            "<p>验证码 {expires_minutes} 分钟内有效；如非本人操作请尽快修改密码。</p>"
            "</div>"
        ),
        "text_body": "您的 KunFlix 重置密码验证码为 {code}，{expires_minutes} 分钟内有效。",
    },
    {
        "code": "reset_password", "locale": "en-US",
        "name": "Reset password verification",
        "subject": "[KunFlix] Reset password code {code}",
        "html_body": (
            "<div style=\"font-family:Arial,Helvetica,sans-serif;line-height:1.6\">"
            "<h2>Reset password</h2>"
            "<p>Your verification code is:</p>"
            "<p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">{code}</p>"
            "<p>This code expires in {expires_minutes} minutes.</p>"
            "</div>"
        ),
        "text_body": "Your KunFlix reset-password code is {code}, valid for {expires_minutes} minutes.",
    },
    {
        "code": "admin_test", "locale": "zh-CN",
        "name": "管理员测试邮件",
        "subject": "【KunFlix】邮件服务测试",
        "html_body": (
            "<div style=\"font-family:Arial,Helvetica,sans-serif;line-height:1.6\">"
            "<h2>邮件服务测试成功</h2>"
            "<p>这是一封来自 KunFlix 后台管理系统的测试邮件，用于验证邮件服务商配置可达。</p>"
            "<p>发送时间：{sent_at}</p>"
            "</div>"
        ),
        "text_body": "邮件服务测试成功，发送时间：{sent_at}",
    },
    {
        "code": "admin_test", "locale": "en-US",
        "name": "Admin test mail",
        "subject": "[KunFlix] Email service test",
        "html_body": (
            "<div style=\"font-family:Arial,Helvetica,sans-serif;line-height:1.6\">"
            "<h2>Email service test succeeded</h2>"
            "<p>This is a test email from KunFlix admin to verify the email provider configuration.</p>"
            "<p>Sent at: {sent_at}</p>"
            "</div>"
        ),
        "text_body": "Email service test succeeded. Sent at: {sent_at}",
    },
]


def upgrade() -> None:
    op.create_table(
        "email_providers",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("provider_type", sa.String(length=50), nullable=False),
        sa.Column("api_key", sa.String(), nullable=True),  # EncryptedString → underlying String
        sa.Column("from_email", sa.String(length=255), nullable=True),
        sa.Column("from_name", sa.String(length=100), nullable=True),
        sa.Column("reply_to", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.text("true")),
        sa.Column("is_default", sa.Boolean(), nullable=True, server_default=sa.text("false")),
        sa.Column("config_json", sa.JSON(), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    with op.batch_alter_table("email_providers", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_email_providers_id"), ["id"], unique=False)
        batch_op.create_index(batch_op.f("ix_email_providers_name"), ["name"], unique=True)
        batch_op.create_index(batch_op.f("ix_email_providers_provider_type"), ["provider_type"], unique=False)

    op.create_table(
        "email_templates",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("locale", sa.String(length=10), nullable=False, server_default="zh-CN"),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("html_body", sa.Text(), nullable=False),
        sa.Column("text_body", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    with op.batch_alter_table("email_templates", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_email_templates_id"), ["id"], unique=False)
        batch_op.create_index(batch_op.f("ix_email_templates_code"), ["code"], unique=False)
        batch_op.create_index("ix_email_templates_code_locale", ["code", "locale"], unique=True)

    # Seed 模板
    conn = op.get_bind()
    now = datetime.now(timezone.utc)
    for tpl in _SEED_TEMPLATES:
        conn.execute(
            sa.text(
                "INSERT INTO email_templates (id, code, locale, name, subject, html_body, text_body, is_active, created_at) "
                "VALUES (:id, :code, :locale, :name, :subject, :html_body, :text_body, :is_active, :created_at)"
            ),
            {
                "id": str(uuid.uuid4()),
                "code": tpl["code"],
                "locale": tpl["locale"],
                "name": tpl["name"],
                "subject": tpl["subject"],
                "html_body": tpl["html_body"],
                "text_body": tpl["text_body"],
                "is_active": True,
                "created_at": now,
            },
        )


def downgrade() -> None:
    with op.batch_alter_table("email_templates", schema=None) as batch_op:
        batch_op.drop_index("ix_email_templates_code_locale")
        batch_op.drop_index(batch_op.f("ix_email_templates_code"))
        batch_op.drop_index(batch_op.f("ix_email_templates_id"))
    op.drop_table("email_templates")

    with op.batch_alter_table("email_providers", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_email_providers_provider_type"))
        batch_op.drop_index(batch_op.f("ix_email_providers_name"))
        batch_op.drop_index(batch_op.f("ix_email_providers_id"))
    op.drop_table("email_providers")
