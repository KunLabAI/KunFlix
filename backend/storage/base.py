"""Storage backend protocol.

定义对象存储后端的统一异步接口，便于未来在 LocalStorageBackend 与
S3StorageBackend（或其他对象存储）之间平滑切换。

设计要点：
- 返回 URL（或可被 /api/media/{filename} 消费的相对路径），不暴露物理路径；
- get_local_path 仅在本地后端有意义，远端后端可返回 None；
- 不强制具体 key 生成策略，交由调用方/后端自行处理。
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional, Protocol, runtime_checkable


@runtime_checkable
class StorageBackend(Protocol):
    """对象存储后端协议。所有方法均为异步。"""

    async def save_bytes(
        self,
        data: bytes,
        *,
        user_id: Optional[str],
        file_type: str,
        filename: str,
    ) -> str:
        """保存字节流，返回对外可访问的 URL 或 /api/media/{filename} 形式的路径。"""
        ...

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
        """从远端 URL 下载并保存，返回对外可访问的 URL 或 /api/media/{filename}。"""
        ...

    async def delete(self, key: str) -> bool:
        """按 key 删除对象，成功返回 True，不存在返回 False。"""
        ...

    def get_local_path(self, filename: str) -> Optional[Path]:
        """本地后端返回磁盘路径；远端后端返回 None。供静态文件服务使用。"""
        ...

    async def presigned_put_url(
        self,
        *,
        user_id: Optional[str],
        file_type: str,
        filename: str,
        content_type: Optional[str] = None,
        expires_in: Optional[int] = None,
    ) -> Optional[dict]:
        """生成客户端直传的 PUT 预签名 URL。

        返回值形如 {"url": str, "headers": dict, "key": str, "public_url": str|None,
        "expires_in": int}；不支持预签名的后端（如 Local）返回 None。调用方根据 None 值
        回落到其他上传路径。
        """
        ...

    async def presigned_get_url(
        self,
        *,
        user_id: Optional[str],
        file_type: str,
        filename: str,
        expires_in: Optional[int] = None,
    ) -> Optional[str]:
        """生成 GET 预签名 URL。不支持预签名的后端返回 None。"""
        ...
