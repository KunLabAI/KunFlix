"""S3 / MinIO / R2 / OSS object storage backend.

基于 aioboto3 的异步对象存储后端。提供与 LocalStorageBackend 相同的接口契约：
- save_bytes / save_from_url 上传后返回**对外可访问 URL**
  - 若 settings.STORAGE_S3_PUBLIC_BASE_URL 非空：返回 `{public_base}/{key}`
  - 否则：返回有时效的 GET 预签名 URL
- delete 通过 key（即对象在 bucket 内的相对路径）删除
- get_local_path 永远返回 None（远端后端无本地路径）

设计要点：
- 所有客户端调用通过 `_session().client("s3", ...)` 上下文管理器获取
- 不抛出底层 botocore 异常，统一 logger.warning + raise 上抛
- key 生成沿用 media_utils 风格：`{user_id}/{file_type}/{filename}` 或平铺 `{filename}`
- 预签名 GET URL 默认有效期 settings.STORAGE_PRESIGN_EXPIRES（默认 3600s）
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)


def _build_key(user_id: Optional[str], file_type: str, filename: str) -> str:
    """生成 bucket 内对象 key（与 media_utils 路径策略对齐）。"""
    builders = {
        True: lambda: f"{user_id}/{file_type}/{filename}",
        False: lambda: filename,
    }
    return builders[bool(user_id)]()


class S3StorageBackend:
    """基于 aioboto3 的 S3 兼容对象存储后端。

    支持 AWS S3 / MinIO / Cloudflare R2 / 阿里 OSS（兼容模式）等任何 S3 兼容服务。
    通过 settings.STORAGE_S3_ENDPOINT / USE_PATH_STYLE 切换 endpoint 与寻址风格。
    """

    def __init__(self) -> None:
        self._bucket = settings.STORAGE_S3_BUCKET
        self._region = settings.STORAGE_S3_REGION
        self._endpoint = settings.STORAGE_S3_ENDPOINT or None
        self._access_key = settings.STORAGE_S3_ACCESS_KEY
        self._secret_key = settings.STORAGE_S3_SECRET_KEY
        self._public_base = (settings.STORAGE_S3_PUBLIC_BASE_URL or "").rstrip("/")
        self._use_path_style = bool(settings.STORAGE_S3_USE_PATH_STYLE)
        self._presign_expires = int(settings.STORAGE_PRESIGN_EXPIRES or 3600)

        self._bucket or (_ for _ in ()).throw(
            ValueError("STORAGE_S3_BUCKET is required when STORAGE_BACKEND=s3")
        )
        self._session = self._build_session()
        self._client_config = self._build_client_config()

    # ------------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------------
    def _build_session(self):
        import aioboto3
        return aioboto3.Session(
            aws_access_key_id=self._access_key or None,
            aws_secret_access_key=self._secret_key or None,
            region_name=self._region or None,
        )

    def _build_client_config(self):
        from botocore.config import Config
        # MinIO/R2 必须使用 path-style；AWS S3 推荐 virtual-hosted style
        addressing = {"True": "path", "False": "virtual"}
        return Config(
            signature_version="s3v4",
            s3={"addressing_style": addressing[str(self._use_path_style)]},
            retries={"max_attempts": 3, "mode": "standard"},
        )

    def _client(self):
        """返回 aioboto3 S3 client async ctx manager。"""
        return self._session.client(
            "s3",
            endpoint_url=self._endpoint,
            config=self._client_config,
        )

    def _public_url(self, key: str) -> Optional[str]:
        """若配置了 PUBLIC_BASE_URL，则返回直链 URL。"""
        public_url_map = {
            True: lambda: f"{self._public_base}/{key}",
            False: lambda: None,
        }
        return public_url_map[bool(self._public_base)]()

    async def _presign_get(self, key: str) -> str:
        async with self._client() as s3:
            return await s3.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=self._presign_expires,
            )

    async def _resolve_url(self, key: str) -> str:
        """统一解析对外 URL：优先 PUBLIC_BASE，否则预签名 GET。"""
        return self._public_url(key) or await self._presign_get(key)

    # ------------------------------------------------------------------
    # StorageBackend protocol
    # ------------------------------------------------------------------
    async def save_bytes(
        self,
        data: bytes,
        *,
        user_id: Optional[str],
        file_type: str,
        filename: str,
    ) -> str:
        key = _build_key(user_id, file_type, filename)
        content_type = _guess_content_type(filename)
        async with self._client() as s3:
            await s3.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
        logger.info("S3Storage saved: s3://%s/%s (%d bytes)", self._bucket, key, len(data))
        return await self._resolve_url(key)

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
        try:
            async with self._client() as s3:
                await s3.delete_object(Bucket=self._bucket, Key=key)
            logger.info("S3Storage deleted: s3://%s/%s", self._bucket, key)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("S3Storage delete failed: s3://%s/%s: %s", self._bucket, key, exc)
            return False

    def get_local_path(self, filename: str) -> Optional[Path]:
        """远端对象存储无本地路径。"""
        return None

    # ------------------------------------------------------------------
    # Extension: presigned upload (POST policy)
    # ------------------------------------------------------------------
    async def presign_upload(
        self,
        *,
        user_id: Optional[str],
        file_type: str,
        filename: str,
        content_type: Optional[str] = None,
        max_size: int = 100 * 1024 * 1024,
        expires_in: Optional[int] = None,
    ) -> dict:
        """生成 S3 POST policy 用于客户端直传，绕过后端中转。

        Returns:
            {
                "url": "<endpoint or virtual host>",
                "fields": { ... 表单字段 ... },
                "key": "<对象 key>",
                "public_url": "<上传后访问 URL，可能为 None 表示需要后续预签名>"
            }
        """
        key = _build_key(user_id, file_type, filename)
        content_type = content_type or _guess_content_type(filename)
        ttl = expires_in or self._presign_expires
        conditions = [
            {"bucket": self._bucket},
            {"key": key},
            ["content-length-range", 1, max_size],
            {"Content-Type": content_type},
        ]
        async with self._client() as s3:
            policy = await s3.generate_presigned_post(
                Bucket=self._bucket,
                Key=key,
                Fields={"Content-Type": content_type},
                Conditions=conditions,
                ExpiresIn=ttl,
            )
        return {
            "url": policy["url"],
            "fields": policy["fields"],
            "key": key,
            "public_url": self._public_url(key),
            "expires_in": ttl,
        }

    # ------------------------------------------------------------------
    # Standard presigned PUT / GET (协议标准接口，业务侧首选)
    # ------------------------------------------------------------------
    async def presigned_put_url(
        self,
        *,
        user_id: Optional[str],
        file_type: str,
        filename: str,
        content_type: Optional[str] = None,
        expires_in: Optional[int] = None,
    ) -> Optional[dict]:
        """生成 PUT 预签名 URL。客户端直接 HTTP PUT 上传，较 POST policy 更简单。"""
        key = _build_key(user_id, file_type, filename)
        content_type = content_type or _guess_content_type(filename)
        ttl = expires_in or self._presign_expires
        async with self._client() as s3:
            url = await s3.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": self._bucket,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=ttl,
            )
        return {
            "url": url,
            "headers": {"Content-Type": content_type},
            "key": key,
            "public_url": self._public_url(key),
            "expires_in": ttl,
        }

    async def presigned_get_url(
        self,
        *,
        user_id: Optional[str],
        file_type: str,
        filename: str,
        expires_in: Optional[int] = None,
    ) -> Optional[str]:
        """生成 GET 预签名 URL（有效期 = expires_in or 默认）。"""
        key = _build_key(user_id, file_type, filename)
        ttl = expires_in or self._presign_expires
        async with self._client() as s3:
            return await s3.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=ttl,
            )


# 扩展名 -> Content-Type 映射（避免 if 链）
_EXT_CONTENT_TYPE = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "mov": "video/quicktime",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "ogg": "audio/ogg",
}


def _guess_content_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _EXT_CONTENT_TYPE.get(ext, "application/octet-stream")
