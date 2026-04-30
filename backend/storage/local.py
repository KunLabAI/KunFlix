"""Local filesystem storage backend.

封装 services/media_utils.py 中的本地路径逻辑，为未来切换至 S3/OSS 等远端
对象存储提供统一接口。当前 media_utils.py 的现有调用方**不做改动**，仅通过
`get_storage_backend()` 供新业务渐进接入。
"""
from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Optional

import httpx

from services.media_utils import (
    MEDIA_DIR,
    build_media_storage_path,
    resolve_media_filepath,
)

logger = logging.getLogger(__name__)


class LocalStorageBackend:
    """基于本地文件系统的 StorageBackend 实现。

    - key 采用 media_utils 的相对路径格式：`{user_id}/{file_type}/{filename}`
      或平铺 `{filename}`（无 user_id 时）
    - 返回对外 URL 统一为 `/api/media/{filename}`，由 routers/media.py 解析
    """

    def __init__(self, base_dir: Optional[Path] = None) -> None:
        self._base_dir = Path(base_dir) if base_dir else MEDIA_DIR
        self._base_dir.mkdir(parents=True, exist_ok=True)

    async def save_bytes(
        self,
        data: bytes,
        *,
        user_id: Optional[str],
        file_type: str,
        filename: str,
    ) -> str:
        filepath, _rel = build_media_storage_path(user_id, file_type, filename)
        await asyncio.to_thread(filepath.write_bytes, data)
        logger.info("LocalStorage saved: %s (%d bytes)", filename, len(data))
        return f"/api/media/{filename}"

    async def save_from_url(
        self,
        src_url: str,
        *,
        user_id: Optional[str],
        file_type: str,
        filename: str,
        headers: Optional[dict] = None,
        timeout: int = 120,
    ) -> str:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(src_url, headers=headers)
            resp.raise_for_status()
            data = resp.content
        return await self.save_bytes(
            data, user_id=user_id, file_type=file_type, filename=filename
        )

    async def delete(self, key: str) -> bool:
        target = self._base_dir / key
        exists = await asyncio.to_thread(target.is_file)
        deleters = {True: lambda: (target.unlink(missing_ok=True), True)[1],
                    False: lambda: False}
        return await asyncio.to_thread(deleters[exists])

    def get_local_path(self, filename: str) -> Optional[Path]:
        """沿用 media_utils.resolve_media_filepath 的两级查找策略。"""
        return resolve_media_filepath(filename)

    async def presigned_put_url(
        self,
        *,
        user_id: Optional[str],
        file_type: str,
        filename: str,
        content_type: Optional[str] = None,
        expires_in: Optional[int] = None,
    ) -> Optional[dict]:
        """本地后端不支持预签名：返回 None 让调用方回落。"""
        return None

    async def presigned_get_url(
        self,
        *,
        user_id: Optional[str],
        file_type: str,
        filename: str,
        expires_in: Optional[int] = None,
    ) -> Optional[str]:
        """本地后端直接用 /api/media/ 作为访问地址，无须预签名。"""
        return None
