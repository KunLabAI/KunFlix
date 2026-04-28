"""
阿里云 DashScope 百炼 HappyHorse 视频生成适配器

支持模型:
  - happyhorse-1.0-t2v         (文生视频)
  - happyhorse-1.0-i2v         (图生视频, 首帧)
  - happyhorse-1.0-r2v         (参考生视频, 多图)
  - happyhorse-1.0-video-edit  (视频编辑)

REST 端点:
  提交: POST {base}/api/v1/services/aigc/video-generation/video-synthesis
  轮询: GET  {base}/api/v1/tasks/{task_id}
  上传策略: GET {base}/api/v1/uploads?action=getPolicy&model={model}

HappyHorse 要求媒体必须为公网 HTTP(S) URL 或 oss:// URL；本地文件需通过 DashScope
文件上传策略先上传到 OSS 后再引用。
"""
from __future__ import annotations

import base64
import logging
import mimetypes
import os
import re
import uuid
from pathlib import Path
from typing import ClassVar, Dict, List, Optional

import httpx

from .base import VideoProviderAdapter, VideoContext, VideoResult

logger = logging.getLogger(__name__)

_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com"

# 本地 /api/media/ 前缀对应的物理根目录 (与 services.media_utils.MEDIA_DIR 保持一致)
_MEDIA_DIR = Path(__file__).resolve().parents[2] / "media"


class DashScopeVideoAdapter(VideoProviderAdapter):
    """DashScope 百炼 HappyHorse 视频适配器"""

    SUPPORTED_MODELS: ClassVar[List[str]] = [
        "happyhorse-1.0-t2v",
        "happyhorse-1.0-i2v",
        "happyhorse-1.0-r2v",
        "happyhorse-1.0-video-edit",
    ]

    STATUS_MAP: ClassVar[Dict[str, str]] = {
        "PENDING": "pending",
        "RUNNING": "processing",
        "SUCCEEDED": "completed",
        "FAILED": "failed",
        "CANCELED": "failed",
        "UNKNOWN": "failed",
    }

    # 分辨率映射: 内部 quality -> DashScope resolution
    RESOLUTION_MAP: ClassVar[Dict[str, str]] = {
        "480p": "720P",  # DashScope 不支持 480p, 降级到 720P
        "720p": "720P",
        "1080p": "1080P",
    }

    # 支持的宽高比 (t2v / r2v)
    _SUPPORTED_RATIOS: ClassVar[set] = {"16:9", "9:16", "1:1", "4:3", "3:4"}

    # 模型能力桶 (避免运行时 if 判断, 集合查找)
    _T2V_MODELS: ClassVar[set] = {"happyhorse-1.0-t2v"}
    _I2V_MODELS: ClassVar[set] = {"happyhorse-1.0-i2v"}
    _R2V_MODELS: ClassVar[set] = {"happyhorse-1.0-r2v"}
    _EDIT_MODELS: ClassVar[set] = {"happyhorse-1.0-video-edit"}

    # ---------------------------------------------------------------------
    # 提交
    # ---------------------------------------------------------------------
    async def submit(self, ctx: VideoContext) -> VideoResult:
        """提交 HappyHorse 视频生成任务"""
        base_url = self._resolve_base_url(ctx.base_url)

        # 按模型构造请求 body (含媒体 URL 规范化)
        try:
            payload = await self._build_payload(ctx, base_url)
        except Exception as exc:
            logger.error(f"DashScope build payload failed: {exc}", exc_info=True)
            return VideoResult(status="failed", error=f"构造请求失败: {exc}")

        return await self._call_submit(ctx, base_url, payload)

    def _resolve_base_url(self, base_url: Optional[str]) -> str:
        """解析 endpoint; 允许 LLMProvider.base_url 覆盖"""
        cleaned = (base_url or "").rstrip("/")
        return cleaned or _DEFAULT_BASE_URL

    async def _build_payload(self, ctx: VideoContext, base_url: str) -> dict:
        """根据模型类型构造请求 payload"""
        model = ctx.model
        media: List[dict] = []

        # I2V: 首帧图片 (必填)
        (model in self._I2V_MODELS and ctx.image_url) and media.append({
            "type": "first_frame",
            "url": await self._ensure_public_url(ctx.api_key, ctx.image_url, model, base_url),
        })
        (model in self._I2V_MODELS and not ctx.image_url) and (_ for _ in ()).throw(
            ValueError(f"模型 {model} 需要提供首帧图片 (image_url)")
        )

        # R2V: 多张参考图 (1~9 张)
        if model in self._R2V_MODELS:
            refs = [r.get("url") for r in (ctx.reference_images or []) if r and r.get("url")]
            refs or (_ for _ in ()).throw(ValueError(f"模型 {model} 至少需要 1 张参考图"))
            for url in refs[:9]:
                media.append({
                    "type": "reference_image",
                    "url": await self._ensure_public_url(ctx.api_key, url, model, base_url),
                })

        # Video-Edit: 源视频 (必填) + 参考图 (0~5 张)
        if model in self._EDIT_MODELS:
            src = ctx.extension_video_url
            src or (_ for _ in ()).throw(ValueError(f"模型 {model} 需要提供待编辑视频 (extension_video_url)"))
            media.append({
                "type": "video",
                "url": await self._ensure_public_url(ctx.api_key, src, model, base_url),
            })
            refs = [r.get("url") for r in (ctx.reference_images or []) if r and r.get("url")]
            for url in refs[:5]:
                media.append({
                    "type": "reference_image",
                    "url": await self._ensure_public_url(ctx.api_key, url, model, base_url),
                })

        # 组装 input
        input_body: dict = {"prompt": ctx.prompt or ""}
        media and input_body.update({"media": media})

        # 组装 parameters
        parameters = self._build_parameters(ctx)

        payload = {
            "model": model,
            "input": input_body,
            "parameters": parameters,
        }
        return payload

    def _build_parameters(self, ctx: VideoContext) -> dict:
        """构造 parameters 字段"""
        params: dict = {}

        # 分辨率 (所有模型通用)
        resolution = self.RESOLUTION_MAP.get((ctx.quality or "").lower(), "1080P")
        params["resolution"] = resolution

        # 时长约束: HappyHorse 支持 3~15 秒整数; video-edit 由输入视频决定, 但 API 不使用此参数
        duration = int(ctx.duration or 5)
        duration = max(3, min(15, duration))
        (ctx.model not in self._EDIT_MODELS) and params.update({"duration": duration})

        # 宽高比: 仅 t2v / r2v 支持 (i2v 跟随首帧, video-edit 跟随源视频)
        supports_ratio = ctx.model in self._T2V_MODELS or ctx.model in self._R2V_MODELS
        ratio = ctx.aspect_ratio if ctx.aspect_ratio in self._SUPPORTED_RATIOS else "16:9"
        supports_ratio and params.update({"ratio": ratio})

        # seed (可选)
        (ctx.seed is not None) and params.update({"seed": int(ctx.seed)})

        # video-edit 专有: audio_setting (默认 auto, 不显式传)
        # watermark 默认 True, 当前不暴露给用户, 不主动传

        return params

    async def _call_submit(self, ctx: VideoContext, base_url: str, payload: dict) -> VideoResult:
        """POST 创建任务"""
        url = f"{base_url}/api/v1/services/aigc/video-generation/video-synthesis"
        headers = {
            "Authorization": f"Bearer {ctx.api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable",
        }

        log_payload = {
            "model": payload.get("model"),
            "prompt_len": len(payload.get("input", {}).get("prompt", "")),
            "media_count": len(payload.get("input", {}).get("media", []) or []),
            "parameters": payload.get("parameters"),
        }
        logger.info(f"DashScope video submit — mode={ctx.video_mode}, {log_payload}")

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(url, headers=headers, json=payload)

            if resp.status_code >= 400:
                err = self._extract_error(resp)
                logger.error(f"DashScope submit error {resp.status_code}: {err}")
                return VideoResult(status="failed", error=err)

            data = resp.json()
            output = data.get("output", {}) or {}
            task_id = output.get("task_id", "")
            raw_status = output.get("task_status", "PENDING")
            mapped = self._map_status(raw_status)

            task_id or logger.error(f"DashScope submit missing task_id: {data}")
            logger.info(f"DashScope video submit OK — task_id={task_id}, status={raw_status}")

            return VideoResult(
                task_id=task_id,
                status=mapped if task_id else "failed",
                error="" if task_id else "未返回 task_id",
            )

        except Exception as e:
            logger.error(f"DashScope submit failed: {e}", exc_info=True)
            return VideoResult(status="failed", error=str(e))

    # ---------------------------------------------------------------------
    # 轮询
    # ---------------------------------------------------------------------
    async def poll(self, task_id: str) -> VideoResult:
        """占位 — 统一通过 poll_with_key 调用"""
        return VideoResult(task_id=task_id, status="pending")

    async def poll_with_key(
        self,
        api_key: str,
        task_id: str,
        base_url: Optional[str] = None,
    ) -> VideoResult:
        """GET /api/v1/tasks/{task_id} 查询任务状态"""
        base = self._resolve_base_url(base_url)
        url = f"{base}/api/v1/tasks/{task_id}"
        headers = {"Authorization": f"Bearer {api_key}"}

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url, headers=headers)

            if resp.status_code >= 400:
                err = self._extract_error(resp)
                logger.error(f"DashScope poll error {resp.status_code} for {task_id}: {err}")
                return VideoResult(task_id=task_id, status="pending", error=err)

            data = resp.json()
            output = data.get("output", {}) or {}
            usage = data.get("usage", {}) or {}

            raw_status = output.get("task_status", "PENDING")
            mapped = self._map_status(raw_status)

            result = VideoResult(task_id=task_id, status=mapped)

            # 完成: 填充视频 URL 和时长
            (mapped == "completed") and (
                setattr(result, "video_url", output.get("video_url", "")),
                setattr(result, "duration_seconds", float(usage.get("output_video_duration", 0) or 0)),
                setattr(result, "video_width", int(usage.get("SR", 0) or 0)),
            )

            # 失败: 携带错误信息
            if mapped == "failed":
                code = output.get("code", "")
                msg = output.get("message", "") or raw_status
                result.error = f"{code}: {msg}" if code else msg

            logger.info(f"DashScope video poll — task_id={task_id}, status={raw_status} -> {mapped}")
            return result

        except Exception as e:
            logger.error(f"DashScope poll failed for {task_id}: {e}", exc_info=True)
            return VideoResult(task_id=task_id, status="pending", error=str(e))

    # ---------------------------------------------------------------------
    # 媒体 URL 规范化 (本地/data → oss://)
    # ---------------------------------------------------------------------
    async def _ensure_public_url(
        self,
        api_key: str,
        url: str,
        model: str,
        base_url: str,
    ) -> str:
        """确保媒体 URL 是 DashScope 可访问的公网/OSS URL"""
        if not url:
            return url

        # 已是 http(s) 或 oss 协议 → 直接返回
        if url.startswith("http://") or url.startswith("https://") or url.startswith("oss://"):
            return url

        # data URL → 解码为二进制上传
        if url.startswith("data:"):
            filename, content = self._decode_data_url(url)
            return await self._upload_binary(api_key, base_url, model, filename, content)

        # 本地 /api/media/xxx 或 相对路径 → 读盘上传
        local_path = self._resolve_local_path(url)
        local_path or (_ for _ in ()).throw(ValueError(f"无法解析本地媒体路径: {url}"))
        filename = local_path.name
        content = local_path.read_bytes()
        return await self._upload_binary(api_key, base_url, model, filename, content)

    def _resolve_local_path(self, url: str) -> Optional[Path]:
        """把 /api/media/xxx 或 相对路径解析为磁盘 Path"""
        rel = url.replace("/api/media/", "", 1) if url.startswith("/api/media/") else url
        candidate = _MEDIA_DIR / rel
        return candidate if candidate.is_file() else None

    def _decode_data_url(self, data_url: str) -> tuple[str, bytes]:
        """解析 data:<mime>;base64,<body>, 返回 (filename, bytes)"""
        match = re.match(r"^data:([^;]+);base64,(.+)$", data_url, re.DOTALL)
        match or (_ for _ in ()).throw(ValueError("非法的 data URL"))
        mime_type = match.group(1)
        body = match.group(2)
        ext = mimetypes.guess_extension(mime_type) or ".bin"
        filename = f"{uuid.uuid4().hex}{ext}"
        return filename, base64.b64decode(body)

    async def _upload_binary(
        self,
        api_key: str,
        base_url: str,
        model: str,
        filename: str,
        content: bytes,
    ) -> str:
        """
        通过 DashScope 上传策略把二进制上传到 OSS, 返回 oss:// URL

        Flow:
          1. GET /api/v1/uploads?action=getPolicy&model={model}
          2. POST {upload_host} multipart form (OSS 直传)
          3. 拼接 oss://{bucket}/{upload_dir}/{filename}
        """
        policy_url = f"{base_url}/api/v1/uploads"
        async with httpx.AsyncClient(timeout=60) as client:
            # Step 1: 获取上传策略
            policy_resp = await client.get(
                policy_url,
                params={"action": "getPolicy", "model": model},
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if policy_resp.status_code >= 400:
                raise RuntimeError(f"获取上传策略失败 {policy_resp.status_code}: {policy_resp.text[:200]}")

            policy_data = (policy_resp.json().get("data") or {})
            policy = policy_data.get("policy")
            signature = policy_data.get("signature")
            upload_dir = policy_data.get("upload_dir")
            upload_host = policy_data.get("upload_host")
            oss_access_key_id = policy_data.get("oss_access_key_id")
            x_oss_object_acl = policy_data.get("x_oss_object_acl", "public-read")
            x_oss_forbid_overwrite = policy_data.get("x_oss_forbid_overwrite", "false")

            # 必要字段校验
            missing = [
                k for k, v in [
                    ("policy", policy), ("signature", signature),
                    ("upload_dir", upload_dir), ("upload_host", upload_host),
                    ("oss_access_key_id", oss_access_key_id),
                ] if not v
            ]
            missing and (_ for _ in ()).throw(RuntimeError(f"上传策略缺失字段: {missing}"))

            # 生成 OSS key
            key_name = f"{uuid.uuid4().hex}{os.path.splitext(filename)[1] or '.bin'}"
            oss_key = f"{upload_dir}/{key_name}"

            # Step 2: 直传 OSS
            mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
            form = {
                "OSSAccessKeyId": oss_access_key_id,
                "Signature": signature,
                "policy": policy,
                "key": oss_key,
                "x-oss-object-acl": x_oss_object_acl,
                "x-oss-forbid-overwrite": x_oss_forbid_overwrite,
                "success_action_status": "200",
            }
            files = {"file": (filename, content, mime_type)}

            upload_resp = await client.post(upload_host, data=form, files=files)
            if upload_resp.status_code not in (200, 204):
                raise RuntimeError(
                    f"OSS 上传失败 {upload_resp.status_code}: {upload_resp.text[:200]}"
                )

        # Step 3: 从 upload_host 推断 bucket, 组装 oss:// URL
        bucket = self._extract_bucket(upload_host)
        oss_url = f"oss://{bucket}/{oss_key}" if bucket else f"oss://{oss_key}"
        logger.info(f"DashScope uploaded local file to {oss_url}")
        return oss_url

    def _extract_bucket(self, upload_host: str) -> str:
        """从 https://{bucket}.oss-cn-xxx.aliyuncs.com 提取 bucket"""
        match = re.match(r"^https?://([^.]+)\.", upload_host or "")
        return match.group(1) if match else ""

    # ---------------------------------------------------------------------
    # 错误解析
    # ---------------------------------------------------------------------
    def _extract_error(self, resp: httpx.Response) -> str:
        """从 httpx.Response 提取 DashScope 错误信息"""
        try:
            data = resp.json()
            code = data.get("code", "")
            msg = data.get("message", "")
            return f"{code}: {msg}" if code else (msg or resp.text[:200])
        except Exception:
            return resp.text[:200]
