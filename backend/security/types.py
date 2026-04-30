"""SQLAlchemy column types for transparent field encryption.

EncryptedString:
- 写入：encrypt_field 包装为 `ENC::v1::<token>` 后入库
- 读取：decrypt_field 自动识别前缀；明文存量原样返回（向后兼容）
- ENCRYPTION_KEY 未配置时全程透传，无 schema 变更
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.types import String, TypeDecorator

from security.crypto import decrypt_field, encrypt_field


class EncryptedString(TypeDecorator):
    """对底层 String 列进行透明 Fernet 加密。"""

    impl = String
    cache_ok = True

    def __init__(self, length: int | None = None, *args, **kwargs):
        # 加密后长度增加（base64 + 前缀），默认 length=None 让 DB 用 TEXT
        super().__init__(length, *args, **kwargs)

    def process_bind_param(self, value: Any, dialect):  # noqa: ARG002
        return encrypt_field(value) if isinstance(value, str) else value

    def process_result_value(self, value: Any, dialect):  # noqa: ARG002
        return decrypt_field(value) if isinstance(value, str) else value


__all__ = ["EncryptedString"]
