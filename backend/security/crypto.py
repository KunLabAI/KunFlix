"""Symmetric encryption helpers for sensitive fields (e.g. provider API keys).

设计原则：
- 基于 cryptography.fernet，AES-128-CBC + HMAC-SHA256，自带时间戳与版本控制；
- **非破坏性**：`ENCRYPTION_KEY` 未配置时降级为明文透传，保证现有数据零迁移即可运行；
- 通过前缀 `ENC::v1::` 识别密文，避免与历史明文冲突；
- 读写均通过统一 `encrypt_field` / `decrypt_field`，避免散落在调用方的 if 分支。
"""
from __future__ import annotations

import base64
import logging
from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from config import settings

logger = logging.getLogger(__name__)

_CIPHER_PREFIX = "ENC::v1::"


@lru_cache(maxsize=1)
def _get_cipher() -> Optional[Fernet]:
    """根据 settings.ENCRYPTION_KEY 构造 Fernet 实例；未配置返回 None。

    支持：
    - 原始 Fernet key（44 字节 urlsafe base64）
    - 任意长度密钥 → 取 SHA256 首 32 字节再 urlsafe base64 编码兜底
    """
    raw = (settings.ENCRYPTION_KEY or "").strip()
    decoders = {
        True: lambda: _coerce_key(raw),
        False: lambda: None,
    }
    key = decoders[bool(raw)]()
    builders = {
        True: lambda k: Fernet(k),
        False: lambda _k: None,
    }
    return builders[key is not None](key)


def _coerce_key(raw: str) -> bytes:
    """把任意字符串归一化为合法 Fernet key。"""
    try:
        candidate = raw.encode("utf-8")
        Fernet(candidate)  # 校验合法性
        return candidate
    except Exception:
        import hashlib
        digest = hashlib.sha256(raw.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest)


def is_encrypted(value: Optional[str]) -> bool:
    return bool(value) and value.startswith(_CIPHER_PREFIX)


def encrypt_field(plaintext: Optional[str]) -> Optional[str]:
    """加密字符串；无密钥或空值时原样返回（降级明文）。"""
    cipher = _get_cipher()
    guards = {
        True: lambda: plaintext,  # 无密钥或空值 → 透传
        False: lambda: _CIPHER_PREFIX + cipher.encrypt(plaintext.encode("utf-8")).decode("ascii"),
    }
    skip = cipher is None or not plaintext or is_encrypted(plaintext)
    return guards[skip]()


def decrypt_field(value: Optional[str]) -> Optional[str]:
    """解密字段；非密文或无密钥时原样返回。解密失败记录日志后透传原值。"""
    not_cipher = not is_encrypted(value)
    cipher = _get_cipher()
    guards = {
        True: lambda: value,  # 非密文
        False: lambda: _safe_decrypt(cipher, value),
    }
    return guards[not_cipher or cipher is None]()


def _safe_decrypt(cipher: Fernet, value: str) -> str:
    token = value[len(_CIPHER_PREFIX):].encode("ascii")
    try:
        return cipher.decrypt(token).decode("utf-8")
    except InvalidToken:
        logger.warning("decrypt_field: invalid token, returning raw value")
        return value


__all__ = ["encrypt_field", "decrypt_field", "is_encrypted"]
