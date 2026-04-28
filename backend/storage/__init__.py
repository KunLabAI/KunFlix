"""Storage backend registry & factory.

通过配置项 `STORAGE_BACKEND` 切换实现。当前仅内置 `local`，`s3` 以占位形式
保留，抛出 NotImplementedError 引导后续接入。
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Callable

from config import settings

from .base import StorageBackend
from .local import LocalStorageBackend


def _build_local() -> StorageBackend:
    base = Path(settings.STORAGE_LOCAL_BASE_DIR) if settings.STORAGE_LOCAL_BASE_DIR else None
    return LocalStorageBackend(base_dir=base)


def _build_s3() -> StorageBackend:
    raise NotImplementedError(
        "S3 storage backend not implemented yet. "
        "请在此注册具体实现（boto3/aioboto3）并从 settings 读取 bucket/region/credentials。"
    )


_BACKEND_REGISTRY: dict[str, Callable[[], StorageBackend]] = {
    "local": _build_local,
    "s3": _build_s3,
}


@lru_cache(maxsize=1)
def get_storage_backend() -> StorageBackend:
    """根据 settings.STORAGE_BACKEND 构造全局单例后端实例。"""
    builder = _BACKEND_REGISTRY.get(settings.STORAGE_BACKEND, _build_local)
    return builder()


__all__ = ["StorageBackend", "LocalStorageBackend", "get_storage_backend"]
