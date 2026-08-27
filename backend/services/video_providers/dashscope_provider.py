"""
阿里云 DashScope 百炼视频生成适配器 (HappyHorse / Wan3.0)

支持模型:
  - happyhorse-1.0-t2v         (文生视频)
  - happyhorse-1.0-i2v         (图生视频, 首帧)
  - happyhorse-1.0-r2v         (参考生视频, 多图)
  - happyhorse-1.0-video-edit  (视频编辑)
  - wan3.0-video-prime         (全能参考模型高速版)
  - wan3.0-video               (全能参考模型标准版)

REST 端点 (异步: 创建任务 -> 轮询获取):
  提交: POST {base}/api/v1/services/aigc/video-generation/video-synthesis
  轮询: GET  {base}/api/v1/tasks/{task_id}
  上传策略: GET {base}/api/v1/uploads?action=getPolicy&model={model}

媒体要求公网 HTTP(S) URL 或 oss:// URL；本地文件需通过 DashScope
文件上传策略先上传到 OSS 后再引用。

Wan3.0 地域限制: 模型、Endpoint URL 和 API Key 必须属于同一地域,
供应商 base_url 需配置为 https://{WorkspaceId}.{region}.maas.aliyuncs.com
(如北京: https://llm-xxxx.cn-beijing.maas.aliyuncs.com)，跨地域调用会失败。
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
    """DashScope 百炼视频适配器 (HappyHorse / Wan3.0)"""

    SUPPORTED_MODELS: ClassVar[List[str]] = [
        "happyhorse-1.0-t2v",
        "happyhorse-1.0-i2v",
        "happyhorse-1.0-r2v",
        "happyhorse-1.0-video-edit",
        "wan3.0-video-prime",
        "wan3.0-video",
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

    # -------------------------------------------------------------------------
    # Wan3.0 全能参考模型 (All-in-One): T2V / I2V首尾帧 / 多模态参考 / 编辑 / 延长
    # -------------------------------------------------------------------------
    _WAN3_MODELS: ClassVar[frozenset] = frozenset({"wan3.0-video-prime", "wan3.0-video"})

    # Wan3.0 分辨率映射 (原生支持 480P)
    _WAN3_RESOLUTION_MAP: ClassVar[Dict[str, str]] = {
        "480p": "480P",
        "720p": "720P",
        "1080p": "1080P",
    }

    # Wan3.0 支持的宽高比 (adaptive: 根据输入媒体比例自适应)
    _WAN3_RATIOS: ClassVar[frozenset] = frozenset({"adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"})

    # Wan3.0 地域 Endpoint 主机后缀 — 模型/URL/API Key 必须同地域, 主机前缀为业务空间 ID。
    # 地域清单: 北京 / 新加坡 / 日本(东京) / 德国(法兰克福) / 美国(弗吉尼亚)
    _WAN3_REGION_HOSTS: ClassVar[tuple] = (
        ".cn-beijing.maas.aliyuncs.com",
        ".ap-southeast-1.maas.aliyuncs.com",
        ".ap-northeast-1.maas.aliyuncs.com",
        ".eu-central-1.maas.aliyuncs.com",
        ".us-east-1.maas.aliyuncs.com",
    )

    # ---------------------------------------------------------------------
    # 提交
    # ---------------------------------------------------------------------
    async def submit(self, ctx: VideoContext) -> VideoResult:
        """提交百炼视频生成任务 (HappyHorse / Wan3.0)"""
        base_url = self._resolve_base_url(ctx.base_url)

        # 按模型构造请求 body (含媒体 URL 规范化 + Wan3.0 地域校验)
        try:
            (ctx.model in self._WAN3_MODELS) and self._assert_wan3_region(base_url)
            payload = await self._build_payload(ctx, base_url)
        except Exception as exc:
            logger.error(f"DashScope build payload failed: {exc}", exc_info=True)
            return VideoResult(status="failed", error=f"构造请求失败: {exc}")

        return await self._call_submit(ctx, base_url, payload)

    def _resolve_base_url(self, base_url: Optional[str]) -> str:
        """解析 endpoint; 允许 LLMProvider.base_url 覆盖"""
        cleaned = (base_url or "").rstrip("/")
        return cleaned or _DEFAULT_BASE_URL

    def _assert_wan3_region(self, base_url: str) -> None:
        """Wan3.0 地域校验: Endpoint 必须为 https://{WorkspaceId}.{region}.maas.aliyuncs.com

        模型、Endpoint URL 和 API Key 必须属于同一地域, 跨地域调用会失败。
        """
        from urllib.parse import urlparse
        host = urlparse(base_url).hostname or ""
        matched = [suffix for suffix in self._WAN3_REGION_HOSTS if host.endswith(suffix)]
        # 主机需含 {WorkspaceId} 前缀 + 地域后缀 (排除裸域名/其他地域/默认 dashscope 地址)
        valid = matched and host.rsplit(matched[0], 1)[0].strip() != ""
        valid or (_ for _ in ()).throw(ValueError(
            "Wan3.0 需同地域 Endpoint (模型/URL/API Key 必须同地域), 请在供应商配置中把 base_url 设为 "
            "https://{业务空间ID}.{地域}.maas.aliyuncs.com, 如 https://llm-xxxx.cn-beijing.maas.aliyuncs.com "
            f"(当前值: {base_url})"
        ))

    async def _build_payload(self, ctx: VideoContext, base_url: str) -> dict:
        """构造请求 payload — 按模型系列分派"""
        return (
            await self._build_wan3_payload(ctx, base_url)
            if ctx.model in self._WAN3_MODELS
            else await self._build_happyhorse_payload(ctx, base_url)
        )

    # ---------------------------------------------------------------------
    # Wan3.0 payload (All-in-One: prompt + media 数组)
    # ---------------------------------------------------------------------
    async def _build_wan3_payload(self, ctx: VideoContext, base_url: str) -> dict:
        """构造 Wan3.0 请求 payload

        media 类型约束 (上游 API 强制校验):
          - first_frame/last_frame 与 reference_xx/file/link 互斥, 由 video_mode 区分;
          - 参考图 ≤ 10 张, 参考视频 ≤ 5 段(总时长 ≤15秒), 参考音频 ≤ 5 段(总时长 ≤15秒);
          - file / link 各最多 1 个且互斥。
        """
        model = ctx.model
        mode = ctx.video_mode
        media: List[dict] = []
        norm = lambda u: self._ensure_public_url(ctx.api_key, u, model, base_url)

        # I2V 首尾帧模式: first_frame + last_frame (严格作为视频首帧/尾帧)
        (mode == "image_to_video" and ctx.image_url) and media.append(
            {"type": "first_frame", "url": await norm(ctx.image_url)}
        )
        (mode == "image_to_video" and ctx.last_frame_image) and media.append(
            {"type": "last_frame", "url": await norm(ctx.last_frame_image)}
        )

        # 编辑 / 视频延长: 源视频以 reference_video 传入 (延长需 prompt 含延长意图关键词)
        source_video = ctx.extension_video_url or ""
        (not source_video and mode in ("edit", "video_extension") and ctx.reference_videos) and (
            source_video := (ctx.reference_videos[0] or {}).get("url", "")
        )
        (mode in ("edit", "video_extension") and source_video) and media.append(
            {"type": "reference_video", "url": await norm(source_video)}
        )

        # 多模态参考模式: 图/视频/音频/文件/网页链接 (prompt 中用"图1""视频1"等指代)
        is_ref = mode == "reference_images"
        is_ref and media.extend([
            {"type": "reference_image", "url": await norm(img.get("url", ""))}
            for img in (ctx.reference_images or [])[:10] if img and img.get("url")
        ])
        is_ref and media.extend([
            {"type": "reference_video", "url": await norm(v.get("url", ""))}
            for v in (ctx.reference_videos or [])[:5] if v and v.get("url")
        ])
        is_ref and media.extend([
            {"type": "reference_audio", "url": await norm(a.get("url", ""))}
            for a in (ctx.reference_audios or [])[:5] if a and a.get("url")
        ])
        # file: 文件参考 (≤ 100MB, ≤ 50 页); link: 公开网页链接 (不可与 file 同时传)
        (is_ref and ctx.reference_files) and media.append(
            {"type": "file", "url": await norm((ctx.reference_files[0] or {}).get("url", ""))}
        )
        (is_ref and ctx.reference_links) and media.append(
            {"type": "link", "url": (ctx.reference_links[0] or {}).get("url", "")}
        )

        # 组装 input: prompt 与 media 必填其一
        input_body: dict = {"prompt": ctx.prompt or ""}
        media and input_body.update({"media": media})

        return {
            "model": model,
            "input": input_body,
            "parameters": self._build_wan3_parameters(ctx),
        }

    def _build_wan3_parameters(self, ctx: VideoContext) -> dict:
        """构造 Wan3.0 parameters (resolution / ratio / duration / prompt_extend / seed)"""
        duration = int(ctx.duration or 5)
        # 时长: -1 智能时长模式; 否则钳制到 2-30 秒 (有视频输入时输入+输出 ≤30秒由上游强制)
        # 宽高比: 视频延长必须 adaptive; 非法值回退 adaptive (默认值)
        ratio = ctx.aspect_ratio if ctx.aspect_ratio in self._WAN3_RATIOS else "adaptive"
        params: dict = {
            "resolution": self._WAN3_RESOLUTION_MAP.get((ctx.quality or "").lower(), "1080P"),
            "ratio": "adaptive" if ctx.video_mode == "video_extension" else ratio,
            "duration": -1 if duration == -1 else max(2, min(30, duration)),
            # prompt_extend: prompt 智能改写 (映射前端 promptOptimizer 开关)
            "prompt_extend": bool(ctx.prompt_optimizer),
        }
        # audio 默认 true (有声), 不主动下发; watermark 默认 false, 不暴露给用户
        (ctx.seed is not None) and params.update({"seed": int(ctx.seed)})
        return params

    # ---------------------------------------------------------------------
    # HappyHorse payload
    # ---------------------------------------------------------------------
    async def _build_happyhorse_payload(self, ctx: VideoContext, base_url: str) -> dict:
        """根据模型类型构造 HappyHorse 请求 payload"""
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
