"""
火山方舟 Seedance 视频生成适配器

支持 Seedance 系列视频生成模型 (doubao-seedance-*)。

REST 端点:
  提交: POST /contents/generations/tasks
  轮询: GET  /contents/generations/tasks/{task_id}

模型系列:
  - doubao-seedance-2-0-260128      (T2V, I2V, 首尾帧, 多模态参考, 有声视频)
  - doubao-seedance-2-0-fast-260128 (快速版, 与 2.0 同等能力)
  - doubao-seedance-1-5-pro-251215  (T2V, I2V, 首尾帧, 有声视频)
  - doubao-seedance-1-0-pro-250801  (T2V, I2V, 首尾帧)
  - doubao-seedance-1-0-pro-fast-250801 (快速版, 首帧 + T2V)
  - doubao-seedance-1-0-lite-t2v    (纯文本)
  - doubao-seedance-1-0-lite-i2v    (首帧, 首尾帧, 参考图)

输入模式:
  - text_to_video:    content[text] -> 视频
  - image_to_video:   content[text + image_url(first_frame)] -> 视频
  - 首尾帧:           content[text + image_url(first_frame) + image_url(last_frame)] -> 视频
"""
from __future__ import annotations
from typing import Dict, List, ClassVar
import logging

import httpx

from .base import VideoProviderAdapter, VideoContext, VideoResult

logger = logging.getLogger(__name__)

_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

# 分辨率映射: 内部 quality -> Seedance resolution
_RESOLUTION_MAP: Dict[str, str] = {
    "480p": "480p",
    "720p": "720p",
    "1080p": "1080p",
}

# 宽高比映射: 内部 aspect_ratio -> Seedance ratio
_RATIO_MAP: Dict[str, str] = {
    "16:9": "16:9",
    "9:16": "9:16",
    "4:3": "4:3",
    "3:4": "3:4",
    "1:1": "1:1",
    "21:9": "21:9",
    "auto": "adaptive",
}


class ArkSeedanceAdapter(VideoProviderAdapter):
    """火山方舟 Seedance 视频生成适配器"""

    SUPPORTED_MODELS: ClassVar[List[str]] = [
        "doubao-seedance-2-0",
        "doubao-seedance-1-5",
        "doubao-seedance-1-0",
    ]

    STATUS_MAP: ClassVar[Dict[str, str]] = {
        "queued": "pending",
        "running": "processing",
        "succeeded": "completed",
        "failed": "failed",
        "expired": "failed",
    }

    # Seedance 2.0 系列: 支持多模态参考、有声视频
    _V2_MODELS: ClassVar[frozenset] = frozenset({
        "doubao-seedance-2-0-260128",
        "doubao-seedance-2-0-fast-260128",
    })

    # 支持有声视频的模型
    _AUDIO_MODELS: ClassVar[frozenset] = frozenset({
        "doubao-seedance-2-0-260128",
        "doubao-seedance-2-0-fast-260128",
        "doubao-seedance-1-5-pro-251215",
    })

    # 支持首尾帧的模型
    _FIRST_LAST_FRAME_MODELS: ClassVar[frozenset] = frozenset({
        "doubao-seedance-2-0-260128",
        "doubao-seedance-2-0-fast-260128",
        "doubao-seedance-1-5-pro-251215",
        "doubao-seedance-1-0-pro-250801",
        "doubao-seedance-1-0-lite-i2v",
    })

    async def submit(self, ctx: VideoContext) -> VideoResult:
        """提交视频生成任务"""
        payload = self._build_payload(ctx)
        return await self._call_submit(ctx, payload)

    def _build_payload(self, ctx: VideoContext) -> dict:
        """构建 Seedance 请求 payload"""
        content: list[dict] = []

        # 文本提示词
        ctx.prompt and content.append({
            "type": "text",
            "text": ctx.prompt,
        })

        # 首帧图片
        (ctx.image_url and ctx.video_mode in ("image_to_video", "edit")) and content.append({
            "type": "image_url",
            "image_url": {"url": ctx.image_url},
            "role": "first_frame",
        })

        # 尾帧图片 (支持首尾帧的模型)
        (ctx.last_frame_image and ctx.model in self._FIRST_LAST_FRAME_MODELS) and content.append({
            "type": "image_url",
            "image_url": {"url": ctx.last_frame_image},
            "role": "last_frame",
        })

        # 参考图片 (Seedance 2.0 系列, 最多 9 张)
        (ctx.reference_images and ctx.model in self._V2_MODELS) and content.extend([
            {
                "type": "image_url",
                "image_url": {"url": img.get("url", img.get("image_url", ""))},
                "role": "reference_image",
            }
            for img in ctx.reference_images[:9]
        ])

        # 视频扩展/编辑 (Seedance 2.0 系列)
        (ctx.extension_video_url and ctx.model in self._V2_MODELS) and content.append({
            "type": "video_url",
            "video_url": {"url": ctx.extension_video_url},
            "role": "reference_video",
        })

        payload: dict = {
            "model": ctx.model,
            "content": content,
        }

        # 分辨率
        resolution = _RESOLUTION_MAP.get(ctx.quality.lower(), "720p")
        payload["resolution"] = resolution

        # 宽高比
        ratio = _RATIO_MAP.get(ctx.aspect_ratio, "16:9")
        payload["ratio"] = ratio

        # 时长
        payload["duration"] = ctx.duration

        # 有声视频 (默认 True, 仅支持的模型)
        (ctx.model in self._AUDIO_MODELS) and payload.update({"generate_audio": True})

        return payload

    async def _call_submit(self, ctx: VideoContext, payload: dict) -> VideoResult:
        """POST /contents/generations/tasks"""
        headers = {
            "Authorization": f"Bearer {ctx.api_key}",
            "Content-Type": "application/json",
        }

        # 日志不打印完整图片/视频数据
        log_payload = {
            k: (
                [self._sanitize_content_item(item) for item in v]
                if k == "content" else v
            )
            for k, v in payload.items()
        }
        logger.info(f"Ark Seedance submit — mode={ctx.video_mode}, payload={log_payload}")

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{_ARK_BASE_URL}/contents/generations/tasks",
                    headers=headers,
                    json=payload,
                )
                resp.status_code >= 400 and logger.error(
                    f"Ark Seedance submit error {resp.status_code}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()

            task_id = data.get("id", "")
            status = data.get("status", "queued")
            logger.info(f"Ark Seedance submit OK — task_id={task_id}, status={status}")

            return VideoResult(
                task_id=task_id,
                status=self._map_status(status),
            )

        except Exception as e:
            logger.error(f"Ark Seedance submit failed: {e}")
            return VideoResult(status="failed", error=str(e))

    async def poll(self, task_id: str) -> VideoResult:
        """轮询需要通过 poll_with_key 传递 api_key"""
        pass

    async def poll_with_key(self, api_key: str, task_id: str) -> VideoResult:
        """带 API key 的轮询方法 — GET /contents/generations/tasks/{task_id}"""
        headers = {"Authorization": f"Bearer {api_key}"}

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{_ARK_BASE_URL}/contents/generations/tasks/{task_id}",
                    headers=headers,
                )
                resp.status_code >= 400 and logger.error(
                    f"Ark Seedance poll error {resp.status_code} for {task_id}: {resp.text[:500]}"
                )
                resp.raise_for_status()
                data = resp.json()

            logger.debug(f"Ark Seedance poll response: {data}")

            raw_status = data.get("status", "queued")
            mapped_status = self._map_status(raw_status)

            result = VideoResult(
                task_id=task_id,
                status=mapped_status,
            )

            # 成功时提取视频 URL 和元信息
            (mapped_status == "completed") and self._extract_video_info(data, result)

            # 失败处理：提取错误信息（支持多种格式）
            error_msg = self._extract_error_message(data)
            error_msg and setattr(result, "error", error_msg)
            
            # 状态为 failed 但无错误信息时设置默认消息
            (mapped_status == "failed" and not result.error) and setattr(
                result, "error", "Video generation failed (unknown reason)"
            )

            return result

        except Exception as e:
            logger.error(f"Ark Seedance poll failed for {task_id}: {e}")
            return VideoResult(task_id=task_id, status="pending", error=str(e))

    def _extract_video_info(self, data: dict, result: VideoResult) -> None:
        """从查询响应中提取视频信息"""
        # Seedance 成功时返回 video_url 字段
        video_url = data.get("video_url", "")
        video_url and setattr(result, "video_url", video_url)

        # 尝试从 content 提取视频信息 (部分响应格式)
        content = data.get("content", {})
        (not video_url and isinstance(content, dict)) and setattr(
            result, "video_url", content.get("video_url", ""),
        )

    @staticmethod
    def _extract_error_message(data: dict) -> str:
        """
        从响应数据中提取错误消息（支持多种格式）
        
        火山方舟可能返回的错误格式:
          - {error: {message: "...", code: "..."}}  — 字典格式
          - {error: "..."}                         — 字符串格式
          - {error_message: "..."}                 — 直接字段
          - {message: "..."}                       — 顶层消息
        """
        # 尝试 error 字典格式
        error_info = data.get("error")
        is_dict_error = isinstance(error_info, dict)
        is_dict_error and (msg := error_info.get("message") or error_info.get("code", "")) and None
        dict_msg = (error_info.get("message") or error_info.get("code", "")) if is_dict_error else ""
        dict_msg and None  # early return equivalent
        
        # error 是字符串
        is_str_error = isinstance(error_info, str) and error_info
        str_msg = error_info if is_str_error else ""
        
        # 其他字段
        fallback_msg = data.get("error_message", "") or data.get("message", "")
        
        return dict_msg or str_msg or fallback_msg

    @staticmethod
    def _sanitize_content_item(item: dict) -> dict:
        """清理单个 content 项用于日志 (移除图片/视频数据)"""
        _MEDIA_TYPES = frozenset({"image_url", "video_url", "audio_url"})
        return (
            {k: (f"<{k}_data>" if k in _MEDIA_TYPES else v) for k, v in item.items()}
            if item.get("type") in _MEDIA_TYPES
            else item
        )
