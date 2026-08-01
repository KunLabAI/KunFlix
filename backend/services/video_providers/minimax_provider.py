"""
MiniMax 视频生成适配器

同时支持两代 API：

v1 (Hailuo 系列)
  提交: POST /v1/video_generation
  轮询: GET  /v1/query/video_generation?task_id=xxx
  下载: GET  /v1/files/retrieve?file_id=xxx
  模型: MiniMax-Hailuo-2.3 / -Fast / MiniMax-Hailuo-02 /
        T2V-01-Director / T2V-01 / I2V-01-Director / I2V-01-live / I2V-01 / S2V-01

v2 (MiniMax-H3, 即 Hailuo-03) — 多模态 content[] 数组, 2K 输出
  提交:      POST   /v2/video_generation
  轮询:      GET    /v2/query/video_generation/{task_id}
  取消/删除: DELETE /v2/video_generation/{task_id}
  模型: MiniMax-H3

v2 三种场景互斥, 由 video_mode 与已绑定素材推导:
  - t2va 文生视频:   content[text]                                ratio 必填且不可为 adaptive
  - i2va 图生视频:   content[text + first_frame / last_frame]      ratio 恒为 adaptive
  - r2va 参考生视频: content[text + reference_image/video/audio]   ratio 可选, 默认 adaptive

说明:
  - v2 支持 callback_url 状态推送, 本项目统一走 arq 后台轮询 + 前端轮询, 故不下发回调地址。
  - v2 轮询直接返回 content.url, 无需再调 /v1/files/retrieve。
  - v2 的下载 URL 有时效, 上层在轮询到 completed 后立即落盘。
"""
from __future__ import annotations
from typing import Dict, List, ClassVar, Optional
import logging
import re

import httpx

from .base import VideoProviderAdapter, VideoContext, VideoResult

logger = logging.getLogger(__name__)

_MINIMAX_BASE_URL = "https://api.minimax.io"

# base_url 可能被配置成带 API 版本后缀的形式 (如 https://api.minimaxi.com/v1)，
# 拼接视频端点前需要剥离版本段。
_API_VERSION_SUFFIXES = ("/v1", "/v2")

# ---------------------------------------------------------------------------
# MiniMax-H3 (v2) 常量
# ---------------------------------------------------------------------------
_H3_MODELS = frozenset({"MiniMax-H3"})

_H3_TEXT_MAX = 7000                       # 单条 text 最大字符数
_H3_DURATION_RANGE = (4, 15)              # 时长闭区间 (秒)
_H3_RESOLUTION = "2K"                     # 目前仅支持 2K
_H3_RATIOS = frozenset({"adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"})
_H3_RATIOS_FIXED = _H3_RATIOS - {"adaptive"}

# 素材数量上限
_H3_MAX_REF_IMAGES = 9
_H3_MAX_REF_VIDEOS = 3
_H3_MAX_REF_AUDIOS = 3

# 单文件体积上限 (字节) 与整体请求体上限
_H3_MEDIA_MAX_BYTES: Dict[str, int] = {
    "image": 30 * 1024 * 1024,
    "video": 50 * 1024 * 1024,
    "audio": 15 * 1024 * 1024,
}
_H3_BODY_MAX_BYTES = 64 * 1024 * 1024

_H3_KIND_LABELS: Dict[str, str] = {"image": "图片", "video": "视频", "audio": "音频"}

# 媒体类型 -> content 项的 type 字段
_H3_CONTENT_TYPES: Dict[str, str] = {
    "image": "image_url",
    "video": "video_url",
    "audio": "audio_url",
}

# 场景 -> ratio 归一化规则
_H3_RATIO_RULES = {
    # 文生视频: ratio 必填且不能为 adaptive
    "t2va": lambda raw: raw if raw in _H3_RATIOS_FIXED else "16:9",
    # 图生视频: 宽高比由输入图决定, 恒为 adaptive
    "i2va": lambda raw: "adaptive",
    # 参考生视频: 可选, 默认 adaptive
    "r2va": lambda raw: raw if raw in _H3_RATIOS else "adaptive",
}

# 内部错误码 -> 用户可读提示 (message 尾部括号内为内部码, 如 "... (1026)")
_H3_ERROR_HINTS: Dict[str, str] = {
    "1000": "MiniMax 服务端异常，请稍后重试",
    "1002": "MiniMax 触发限流，请稍后重试",
    "1004": "MiniMax API Key 无效或未授权，请检查供应商配置",
    "1008": "MiniMax 账户余额不足，请前往 MiniMax 平台充值",
    "1026": "输入内容包含敏感信息，请修改提示词或参考素材后重试",
    "2013": "缺少文本提示词，请填写提示词后重试",
}


class MiniMaxVideoAdapter(VideoProviderAdapter):
    """MiniMax 视频生成适配器 (v1 Hailuo + v2 MiniMax-H3)"""

    SUPPORTED_MODELS: ClassVar[List[str]] = [
        "MiniMax-H3",
        "MiniMax-Hailuo-2.3",
        "MiniMax-Hailuo-2.3-Fast",
        "MiniMax-Hailuo-02",
        "T2V-01-Director",
        "T2V-01",
        "I2V-01-Director",
        "I2V-01-live",
        "I2V-01",
        "S2V-01",
    ]

    # v1 任务状态
    STATUS_MAP: ClassVar[Dict[str, str]] = {
        "Preparing": "pending",
        "Queueing": "pending",
        "Processing": "processing",
        "Success": "completed",
        "Fail": "failed",
    }

    # v2 任务状态 (cancelled / expired 归入 failed, 由 error 字段说明原因)
    V2_STATUS_MAP: ClassVar[Dict[str, str]] = {
        "queued": "pending",
        "running": "processing",
        "succeeded": "completed",
        "failed": "failed",
        "cancelled": "failed",
        "expired": "failed",
    }

    # v2 终态补充说明
    V2_STATUS_NOTES: ClassVar[Dict[str, str]] = {
        "cancelled": "任务已取消",
        "expired": "任务已过期，请重新生成",
    }

    # 分辨率映射: 内部 quality -> MiniMax resolution
    RESOLUTION_MAP: ClassVar[Dict[str, str]] = {
        "480p": "512P",
        "512p": "512P",
        "720p": "720P",
        "768p": "768P",
        "1080p": "1080P",
    }

    # v1 支持的时长 (根据模型和分辨率有所不同)
    SUPPORTED_DURATIONS = [6, 10]

    def __init__(self):
        # 模型能力分类 (v1)
        # T2V 模型 (纯文本生成视频)
        self._t2v_models = {
            "MiniMax-Hailuo-2.3",
            "MiniMax-Hailuo-02",
            "T2V-01-Director",
            "T2V-01",
        }
        # I2V 模型 (图片生成视频) - 需要 first_frame_image
        self._i2v_models = {
            "MiniMax-Hailuo-2.3-Fast",  # Fast 版本是 I2V 模型
            "I2V-01-Director",
            "I2V-01-live",
            "I2V-01",
        }
        # S2V 模型 (主题参考)
        self._s2v_models = {
            "S2V-01",
        }
        # 支持首尾帧的模型
        self._first_last_frame_models = {
            "MiniMax-Hailuo-02",
        }

    # =======================================================================
    # 通用
    # =======================================================================
    @staticmethod
    def is_v2_model(model: str) -> bool:
        """是否为 v2 (MiniMax-H3) 模型"""
        return model in _H3_MODELS

    @staticmethod
    def _resolve_base(base_url: Optional[str]) -> str:
        """归一化供应商 Endpoint (剥离 /v1 /v2 版本后缀)"""
        raw = (base_url or "").strip().rstrip("/") or _MINIMAX_BASE_URL
        trimmed = [raw[: -len(sfx)] for sfx in _API_VERSION_SUFFIXES if raw.endswith(sfx)]
        return (trimmed or [raw])[0]

    async def submit(self, ctx: VideoContext) -> VideoResult:
        """提交视频生成任务 (按模型代次路由)"""
        submitters = {True: self._submit_v2, False: self._submit_v1}
        return await submitters[self.is_v2_model(ctx.model)](ctx)

    async def poll(self, task_id: str) -> VideoResult:
        """轮询 — 需要通过 poll_with_key 传递 api_key"""
        pass

    async def poll_with_key(
        self,
        api_key: str,
        task_id: str,
        base_url: Optional[str] = None,
        model: str = "",
    ) -> VideoResult:
        """带 API key 的轮询 (按模型代次路由)"""
        pollers = {True: self._poll_v2, False: self._poll_v1}
        return await pollers[self.is_v2_model(model)](api_key, task_id, base_url)

    async def delete_task(
        self,
        api_key: str,
        task_id: str,
        model: str = "",
        base_url: Optional[str] = None,
    ) -> bool:
        """
        取消 (queued) 或删除 (终态) 上游任务 — DELETE /v2/video_generation/{task_id}

        仅 v2 (MiniMax-H3) 提供该端点；v1 Hailuo 系列无对应能力，直接返回 False。
        """
        self.is_v2_model(model) or logger.debug(
            f"MiniMax delete_task skipped — model={model} 不支持上游取消/删除"
        )
        if not self.is_v2_model(model):
            return False

        headers = {"Authorization": f"Bearer {api_key}"}
        url = f"{self._resolve_base(base_url)}/v2/video_generation/{task_id}"

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.delete(url, headers=headers)
                data = self._safe_json(resp)
                resp.status_code >= 400 and logger.warning(
                    f"MiniMax-H3 delete error {resp.status_code} for {task_id}: "
                    f"{self._extract_v2_error(data) or resp.text[:300]}"
                )
                ok = resp.status_code < 400
                ok and logger.info(
                    f"MiniMax-H3 task {task_id} {data.get('action', 'delete')} -> "
                    f"{data.get('status', '')}"
                )
                return ok
        except Exception as e:
            logger.warning(f"MiniMax-H3 delete_task failed for {task_id}: {e}")
            return False

    # =======================================================================
    # v1 (Hailuo 系列)
    # =======================================================================
    async def _submit_v1(self, ctx: VideoContext) -> VideoResult:
        """提交 v1 视频生成任务"""
        # 模型能力检查
        self._validate_model_capability(ctx)

        # I2V 模型必须有首帧图片，否则提前返回错误
        (ctx.model in self._i2v_models and not ctx.image_url) and logger.error(
            f"I2V model {ctx.model} requires image_url, returning error without API call"
        )

        payload = self._build_payload(ctx)

        # 检查 I2V 模型是否缺少必需的图片
        (ctx.model in self._i2v_models and "first_frame_image" not in payload) and (
            logger.error(f"Missing first_frame_image for I2V model {ctx.model}")
        )

        return await self._call_submit(ctx, payload)

    def _validate_model_capability(self, ctx: VideoContext) -> str:
        """检查模型是否支持当前模式，返回错误信息或空字符串"""
        model = ctx.model
        mode = ctx.video_mode

        # I2V 模型: 必须有首帧图片
        (model in self._i2v_models) and setattr(ctx, 'video_mode', 'image_to_video')
        (model in self._i2v_models and not ctx.image_url) and logger.warning(
            f"Model {model} is I2V-only, requires image_url"
        )

        # T2V 模型: 自动切换到 text_to_video
        (model in self._t2v_models and mode in ("image_to_video", "edit")) and (
            setattr(ctx, 'video_mode', 'text_to_video'),
            logger.warning(f"Model {model} is T2V-only, switched to text_to_video")
        )

        # S2V 模型检查
        (model in self._s2v_models and not ctx.subject_reference) and logger.warning(
            f"Model {model} requires subject_reference"
        )

        return ""

    def _build_payload(self, ctx: VideoContext) -> dict:
        """构建 v1 请求 payload"""
        payload = {
            "model": ctx.model,
            "prompt": ctx.prompt,
            "prompt_optimizer": ctx.prompt_optimizer,
        }

        # 分辨率映射
        resolution = self.RESOLUTION_MAP.get(ctx.quality.lower(), "768P")
        payload["resolution"] = resolution

        # 时长约束 (MiniMax 只支持 6 或 10)
        duration = 6 if ctx.duration <= 6 else 10
        payload["duration"] = duration

        # 快速预处理 (仅部分模型支持)
        ctx.fast_pretreatment and payload.update({"fast_pretreatment": True})

        # 根据模型类型添加图片参数
        is_i2v_model = ctx.model in self._i2v_models
        is_t2v_model = ctx.model in self._t2v_models
        is_s2v_model = ctx.model in self._s2v_models
        supports_first_last = ctx.model in self._first_last_frame_models

        # I2V 模型必须有首帧图片
        (is_i2v_model and ctx.image_url) and payload.update({
            "first_frame_image": ctx.image_url
        })

        # T2V 模型 (Hailuo-2.3/02) 可选首帧图片
        (is_t2v_model and ctx.image_url and ctx.video_mode in ("image_to_video", "edit")) and payload.update({
            "first_frame_image": ctx.image_url
        })

        # 尾帧图片 (仅 MiniMax-Hailuo-02 支持)
        (supports_first_last and ctx.last_frame_image) and payload.update({
            "last_frame_image": ctx.last_frame_image
        })

        # 主题参考 (S2V-01 模型)
        (is_s2v_model and ctx.subject_reference) and payload.update({
            "subject_reference": ctx.subject_reference
        })

        return payload

    async def _call_submit(self, ctx: VideoContext, payload: dict) -> VideoResult:
        """POST /v1/video_generation"""
        headers = {
            "Authorization": f"Bearer {ctx.api_key}",
            "Content-Type": "application/json",
        }

        # 日志不打印完整图片数据
        log_payload = {
            k: (v if k not in ("first_frame_image", "last_frame_image") else "<image_data>")
            for k, v in payload.items()
        }
        logger.info(f"MiniMax video submit — mode={ctx.video_mode}, payload={log_payload}")

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{_MINIMAX_BASE_URL}/v1/video_generation",
                    headers=headers,
                    json=payload,
                )
                resp.status_code >= 400 and logger.error(
                    f"MiniMax submit error {resp.status_code}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()

            # 检查 base_resp
            base_resp = data.get("base_resp", {})
            status_code = base_resp.get("status_code", 0)
            error_msg = base_resp.get("status_msg", "")

            (status_code != 0) and logger.error(
                f"MiniMax API error: status_code={status_code}, msg={error_msg}"
            )

            # 翻译常见错误消息
            ("does not support Text-to-Video" in error_msg) and (
                error_msg := f"模型 {ctx.model} 是图片生成视频模型，需要提供首帧图片 (image_url)"
            )
            ("does not support Image-to-Video" in error_msg) and (
                error_msg := f"模型 {ctx.model} 是纯文本生成视频模型，不支持图片输入"
            )

            task_id = data.get("task_id", "")
            logger.info(f"MiniMax video submit OK — task_id={task_id}")

            return VideoResult(
                task_id=task_id,
                status="pending" if status_code == 0 else "failed",
                error=error_msg if status_code != 0 else ""
            )

        except Exception as e:
            logger.error(f"MiniMax submit failed: {e}")
            return VideoResult(status="failed", error=str(e))

    async def _poll_v1(
        self,
        api_key: str,
        task_id: str,
        base_url: Optional[str] = None,
    ) -> VideoResult:
        """GET /v1/query/video_generation?task_id=xxx"""
        headers = {"Authorization": f"Bearer {api_key}"}

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{_MINIMAX_BASE_URL}/v1/query/video_generation",
                    params={"task_id": task_id},
                    headers=headers,
                )
                resp.status_code >= 400 and logger.error(
                    f"MiniMax poll error {resp.status_code} for {task_id}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()

            logger.info(f"MiniMax video poll response: {data}")

            raw_status = data.get("status", "Queueing")
            mapped_status = self._map_status(raw_status)

            result = VideoResult(
                task_id=task_id,
                status=mapped_status,
            )

            # 完成时提取 file_id 和视频尺寸
            (mapped_status == "completed") and (
                setattr(result, "file_id", data.get("file_id", "")),
                setattr(result, "video_width", data.get("video_width", 0)),
                setattr(result, "video_height", data.get("video_height", 0))
            )

            # 失败处理
            (mapped_status == "failed") and setattr(
                result, "error", data.get("base_resp", {}).get("status_msg", "Unknown error")
            )

            return result

        except Exception as e:
            logger.error(f"MiniMax poll failed for {task_id}: {e}")
            return VideoResult(task_id=task_id, status="pending", error=str(e))

    async def get_video_url(self, api_key: str, file_id: str) -> str:
        """
        获取视频下载链接 — GET /v1/files/retrieve?file_id=xxx

        MiniMax 返回的 download_url 有效期为 1 小时。
        v2 (MiniMax-H3) 轮询直接返回 content.url，不走该端点。
        """
        headers = {"Authorization": f"Bearer {api_key}"}

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{_MINIMAX_BASE_URL}/v1/files/retrieve",
                    params={"file_id": file_id},
                    headers=headers,
                )
                resp.status_code >= 400 and logger.error(
                    f"MiniMax files/retrieve error {resp.status_code}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()

            file_data = data.get("file", {})
            download_url = file_data.get("download_url", "")

            logger.info(f"MiniMax video download URL obtained: {download_url[:50]}...")
            return download_url

        except Exception as e:
            logger.error(f"MiniMax get_video_url failed: {e}")
            return ""

    # =======================================================================
    # v2 (MiniMax-H3)
    # =======================================================================
    def h3_scene(self, ctx: VideoContext) -> str:
        """
        推导 H3 生成场景: t2va (文生) / i2va (图生) / r2va (参考生)

        图生与参考生互斥: video_mode=reference_images 或仅绑定了参考素材 -> r2va。
        """
        has_refs = bool(ctx.reference_images or ctx.reference_videos or ctx.reference_audios)
        has_frames = bool(ctx.image_url or ctx.last_frame_image)
        is_ref = has_refs and (ctx.video_mode == "reference_images" or not has_frames)
        scenes = {(True, True): "r2va", (True, False): "r2va", (False, True): "i2va", (False, False): "t2va"}
        return scenes[(is_ref, has_frames)]

    def h3_media_items(self, ctx: VideoContext) -> List[dict]:
        """收集 H3 媒体素材 (kind / role / url), 按场景取首尾帧或参考素材"""
        frames = [
            ("image", "first_frame", ctx.image_url),
            ("image", "last_frame", ctx.last_frame_image),
        ]
        refs = [
            *[("image", "reference_image", r.get("url", "")) for r in (ctx.reference_images or [])[:_H3_MAX_REF_IMAGES]],
            *[("video", "reference_video", r.get("url", "")) for r in (ctx.reference_videos or [])[:_H3_MAX_REF_VIDEOS]],
            *[("audio", "reference_audio", r.get("url", "")) for r in (ctx.reference_audios or [])[:_H3_MAX_REF_AUDIOS]],
        ]
        picked = {"r2va": refs, "i2va": frames, "t2va": []}[self.h3_scene(ctx)]
        return [
            {"kind": kind, "role": role, "url": url}
            for kind, role, url in picked
            if url
        ]

    def build_h3_payload(self, ctx: VideoContext) -> dict:
        """构建 v2 请求体: content[] + resolution + duration + ratio"""
        scene = self.h3_scene(ctx)
        items = self.h3_media_items(ctx)

        content: List[dict] = [{"type": "text", "text": (ctx.prompt or "")[:_H3_TEXT_MAX]}]
        content.extend([
            {
                "type": _H3_CONTENT_TYPES[item["kind"]],
                _H3_CONTENT_TYPES[item["kind"]]: {"url": item["url"]},
                "role": item["role"],
            }
            for item in items
        ])

        low, high = _H3_DURATION_RANGE
        return {
            "model": ctx.model,
            "content": content,
            "resolution": _H3_RESOLUTION,
            "duration": min(max(int(ctx.duration or low), low), high),
            "ratio": _H3_RATIO_RULES[scene](ctx.aspect_ratio),
        }

    def validate_h3(self, ctx: VideoContext) -> str:
        """H3 参数预校验, 返回用户可读错误信息 (通过则返回空字符串)"""
        scene = self.h3_scene(ctx)
        items = self.h3_media_items(ctx)
        kinds = {item["kind"] for item in items}

        checks = [
            (not (ctx.prompt or "").strip(),
             "MiniMax-H3 必须提供文本提示词，请填写提示词后重试"),
            (scene == "r2va" and not (kinds & {"image", "video"}),
             "参考生视频至少需要 1 张参考图或 1 个参考视频（参考音频不能单独输入）"),
            (ctx.video_mode == "image_to_video" and scene == "t2va",
             "图生视频需要提供首帧或尾帧图片"),
        ]
        hits = [msg for failed, msg in checks if failed]
        return (hits or [self._h3_size_error(items)])[0]

    def _h3_size_error(self, items: List[dict]) -> str:
        """素材体积预检: 单文件上限 + 请求体 64MB 上限"""
        oversized = [
            f"{_H3_KIND_LABELS[item['kind']]}素材超过 "
            f"{_H3_MEDIA_MAX_BYTES[item['kind']] // (1024 * 1024)}MB 上限，请压缩后重试"
            for item in items
            if self._raw_bytes(item["url"]) > _H3_MEDIA_MAX_BYTES[item["kind"]]
        ]
        body_bytes = sum(len(item["url"]) for item in items)
        too_large = body_bytes > _H3_BODY_MAX_BYTES
        overflow = [
            f"参考素材总体积约 {body_bytes // (1024 * 1024)}MB，超过 MiniMax-H3 的 64MB 请求上限，"
            f"请减少素材数量或压缩后重试"
        ] * too_large
        return (oversized + overflow + [""])[0]

    @staticmethod
    def _raw_bytes(url: str) -> int:
        """估算素材原始体积: data URL 按 base64 反推, 公网 URL / mm_file 记 0"""
        b64 = url.split(",", 1)[-1] if url.startswith("data:") else ""
        return len(b64) * 3 // 4

    async def _submit_v2(self, ctx: VideoContext) -> VideoResult:
        """POST /v2/video_generation"""
        error = self.validate_h3(ctx)
        if error:
            logger.error(f"MiniMax-H3 参数校验失败: {error}")
            return VideoResult(status="failed", error=error)

        payload = self.build_h3_payload(ctx)
        headers = {
            "Authorization": f"Bearer {ctx.api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self._resolve_base(ctx.base_url)}/v2/video_generation"

        logger.info(
            f"MiniMax-H3 submit — scene={self.h3_scene(ctx)}, mode={ctx.video_mode}, "
            f"payload={self._sanitize_v2_payload(payload)}"
        )

        try:
            # 请求体最大 64MB (含 base64 素材), 上传耗时较长
            async with httpx.AsyncClient(timeout=180) as client:
                resp = await client.post(url, headers=headers, json=payload)

            data = self._safe_json(resp)
            api_error = self._friendly_v2_error(data, resp)
            api_error and logger.error(
                f"MiniMax-H3 submit error {resp.status_code}: {resp.text[:500]}"
            )
            if api_error:
                return VideoResult(status="failed", error=api_error)

            task_id = data.get("task_id", "")
            logger.info(f"MiniMax-H3 submit OK — task_id={task_id}")
            return VideoResult(task_id=task_id, status="pending")

        except Exception as e:
            logger.error(f"MiniMax-H3 submit failed: {e}")
            return VideoResult(status="failed", error=str(e))

    async def _poll_v2(
        self,
        api_key: str,
        task_id: str,
        base_url: Optional[str] = None,
    ) -> VideoResult:
        """GET /v2/query/video_generation/{task_id}"""
        headers = {"Authorization": f"Bearer {api_key}"}
        url = f"{self._resolve_base(base_url)}/v2/query/video_generation/{task_id}"

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url, headers=headers)

            data = self._safe_json(resp)
            # 查询接口自身报错 (401/429/500 等) 不代表任务失败, 保持 pending 让上层重试
            api_error = self._friendly_v2_error(data, resp)
            api_error and logger.warning(
                f"MiniMax-H3 poll error {resp.status_code} for {task_id}: {resp.text[:300]}"
            )
            if api_error:
                return VideoResult(task_id=task_id, status="pending", error=api_error)

            task = data.get("task", {}) or {}
            raw_status = task.get("status", "queued")
            mapped_status = self.V2_STATUS_MAP.get(raw_status, "pending")
            logger.info(f"MiniMax-H3 poll — task={task_id}, status={raw_status} -> {mapped_status}")

            result = VideoResult(
                task_id=task_id,
                status=mapped_status,
                duration_seconds=task.get("duration", 0) or 0,
            )

            # 成功: content.url 即 mp4 下载地址 (有时效, 上层立即落盘)
            (mapped_status == "completed") and setattr(
                result, "video_url", (task.get("content") or {}).get("url", "")
            )

            # 失败/取消/过期: 组合 error 字段与状态说明
            (mapped_status == "failed") and setattr(
                result, "error", self._h3_task_error(task, raw_status)
            )

            return result

        except Exception as e:
            logger.error(f"MiniMax-H3 poll failed for {task_id}: {e}")
            return VideoResult(task_id=task_id, status="pending", error=str(e))

    @classmethod
    def _h3_task_error(cls, task: dict, raw_status: str) -> str:
        """拼装 v2 任务失败原因"""
        err = task.get("error") or {}
        code = str(err.get("code", "") or "")
        message = str(err.get("message", "") or "")
        return (
            _H3_ERROR_HINTS.get(code, "")
            or message
            or cls.V2_STATUS_NOTES.get(raw_status, "")
            or "视频生成失败（未返回具体原因）"
        )

    @staticmethod
    def _safe_json(resp: httpx.Response) -> dict:
        """安全解析 JSON 响应体, 非 JSON 返回空字典"""
        try:
            data = resp.json()
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    @staticmethod
    def _extract_v2_error(data: dict) -> str:
        """提取 OpenAI 风格错误信息: {type: error, error: {type, message, http_code}}"""
        err = data.get("error")
        detail = err if isinstance(err, dict) else {}
        return str(
            detail.get("message")
            or detail.get("type")
            or (err if isinstance(err, str) else "")
            or ""
        )

    @classmethod
    def _friendly_v2_error(cls, data: dict, resp: httpx.Response) -> str:
        """把 v2 错误响应转成用户可读信息 (无错误时返回空字符串)"""
        raw = cls._extract_v2_error(data)
        http_failed = resp.status_code >= 400
        # message 尾部括号内为内部错误码, 如 "insufficient balance (1008)"
        codes = re.findall(r"\((\d+)\)", raw)
        hint = ([_H3_ERROR_HINTS[c] for c in codes if c in _H3_ERROR_HINTS] + [""])[0]
        fallback = (resp.text[:300] or f"MiniMax 返回 HTTP {resp.status_code}") * http_failed
        return hint or raw or fallback

    @staticmethod
    def _sanitize_v2_payload(payload: dict) -> dict:
        """日志脱敏: content 中的媒体数据替换为占位符"""
        media_types = frozenset(_H3_CONTENT_TYPES.values())
        return {
            k: (
                [
                    {
                        ik: (f"<{ik}>" if ik in media_types else iv)
                        for ik, iv in item.items()
                    }
                    for item in v
                ]
                if k == "content" else v
            )
            for k, v in payload.items()
        }

