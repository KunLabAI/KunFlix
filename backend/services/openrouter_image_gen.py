"""
OpenRouter image generation / editing.

统一调用路径：所有图像模型走 ``/v1/chat/completions`` + ``modalities=["image","text"]``
+ ``image_config``（aspect_ratio / image_size）。

公共能力：
  - 文本生图、图像编辑/参考、batch_count（并发模拟）
  - data URL / 公开 URL 自动持久化到本地媒体目录

设计原则：注册表分发 + 函数式 + 极简 if（遵循 style.md）。
"""
from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any, AsyncIterator, Iterable

import httpx

from services._retry_utils import run_with_retry
from services.media_utils import save_image_from_url, save_inline_image

logger = logging.getLogger(__name__)


_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"

# quality 别名 → OpenRouter image_config.image_size
_QUALITY_TO_IMAGE_SIZE: dict[str, str] = {
    "standard": "1K",
    "hd": "2K",
    "ultra": "4K",
    "low": "1K",
    "medium": "1K",
    "high": "2K",
}

# OpenRouter 支持的 aspect_ratio 列表（其他值将被忽略）
_OPENROUTER_ASPECT_RATIOS = {
    "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _normalize_base(base_url: str | None) -> str:
    """规范化 base_url，确保以 /v1 结尾。"""
    base = (base_url or _DEFAULT_BASE_URL).rstrip("/")
    return base if base.endswith("/v1") else f"{base}/api/v1"


def _build_image_config(aspect_ratio: str | None, quality: str | None) -> dict[str, str]:
    """Build OpenRouter image_config from aspect_ratio + quality."""
    cfg: dict[str, str] = {}
    ar = (aspect_ratio or "").strip()
    ar and ar != "auto" and ar in _OPENROUTER_ASPECT_RATIOS and cfg.update(aspect_ratio=ar)
    q = (quality or "").lower()
    q and q in _QUALITY_TO_IMAGE_SIZE and cfg.update(image_size=_QUALITY_TO_IMAGE_SIZE[q])
    return cfg


async def _persist_data_url(data_url: str, user_id: str | None) -> str:
    """把 data URL 或公开 URL 持久化到本地媒体目录，返回 /api/media/xxx。"""
    return (
        await save_image_from_url(data_url, user_id=user_id)
        if data_url.startswith(("http://", "https://"))
        else await _save_base64_data_url(data_url, user_id)
    )


async def _save_base64_data_url(data_url: str, user_id: str | None) -> str:
    header, _, payload = data_url.partition(",")
    mime = (header.split(";")[0].split(":", 1)[-1] or "image/png") if header else "image/png"
    raw = base64.b64decode(payload + "=" * ((4 - len(payload) % 4) % 4))
    return await save_inline_image(mime, raw, user_id=user_id)


def _build_auth_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------------
# chat.completions + modalities + image_config
# ---------------------------------------------------------------------------
def _build_user_content(prompt: str, image_urls: Iterable[str]) -> Any:
    refs = [u for u in image_urls if u]
    return prompt if not refs else [
        {"type": "text", "text": prompt},
        *[{"type": "image_url", "image_url": {"url": u}} for u in refs],
    ]


def _extract_data_urls_from_chat(payload: dict) -> list[str]:
    choices = payload.get("choices") or []
    return [
        item.get("image_url", {}).get("url", "")
        for ch in choices
        for item in ((ch.get("message") or {}).get("images") or [])
        if item.get("image_url", {}).get("url")
    ]


async def _call_chat_image_path(
    *,
    api_key: str,
    base_url: str | None,
    model: str,
    prompt: str,
    reference_image_urls: Iterable[str] = (),
    aspect_ratio: str | None = None,
    quality: str | None = None,
    user_id: str | None = None,
    timeout: float = 180.0,
) -> list[str]:
    """OpenRouter 图像生成统一路径：chat/completions + modalities + image_config。"""
    url = f"{_normalize_base(base_url)}/chat/completions"
    image_config = _build_image_config(aspect_ratio, quality)
    body: dict[str, Any] = {
        "model": model,
        "modalities": ["image", "text"],
        "messages": [
            {
                "role": "user",
                "content": _build_user_content(prompt, reference_image_urls),
            }
        ],
    }
    image_config and body.update(image_config=image_config)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await run_with_retry(
            lambda: client.post(url, headers=_build_auth_headers(api_key), json=body),
            label="openrouter.image_chat",
        )
        if resp.status_code >= 400:
            logger.error("OpenRouter image error %s: %s", resp.status_code, resp.text[:500])
            raise RuntimeError(_friendly_error(resp))
        data = resp.json()

    data_urls = _extract_data_urls_from_chat(data)
    not data_urls and logger.warning("OpenRouter chat response had no images: %s", str(data)[:300])
    return await asyncio.gather(*[_persist_data_url(u, user_id) for u in data_urls]) if data_urls else []


def _friendly_error(resp: httpx.Response) -> str:
    msg = resp.text[:300]
    try:
        err = resp.json().get("error")
        msg = err.get("message") if isinstance(err, dict) else (err or msg)
    except Exception:
        pass
    return f"OpenRouter image {resp.status_code}: {msg}"


# ---------------------------------------------------------------------------
# StreamEvent type (used by streaming entrypoint)
# ---------------------------------------------------------------------------
StreamEvent = dict[str, Any]


# ===========================================================================
# Public entrypoints
# ===========================================================================
async def batch_generate_openrouter_images(
    *,
    api_key: str,
    base_url: str | None,
    model: str,
    prompt: str,
    aspect_ratio: str | None = None,
    quality: str | None = None,
    n: int = 1,
    user_id: str | None = None,
) -> list[str]:
    """文生图统一入口。

    注：output_format/output_compression/background/moderation 在 OpenRouter 上不生效，
    保留签名以向上层保持接口兼容。
    """
    return await _dispatch_generate(
        api_key=api_key,
        base_url=base_url,
        model=model,
        prompt=prompt,
        aspect_ratio=aspect_ratio,
        quality=quality,
        n=n,
        user_id=user_id,
    )


async def _dispatch_generate(**kw) -> list[str]:
    """All models unified: chat/completions + image_config (OpenRouter 不提供 /images/generations)。"""
    model = kw["model"]
    count = max(1, int(kw.get("n") or 1))
    results = await asyncio.gather(
        *[
            _call_chat_image_path(
                api_key=kw["api_key"],
                base_url=kw.get("base_url"),
                model=model,
                prompt=kw["prompt"],
                aspect_ratio=kw.get("aspect_ratio"),
                quality=kw.get("quality"),
                user_id=kw.get("user_id"),
            )
            for _ in range(count)
        ],
        return_exceptions=True,
    )
    urls: list[str] = []
    for r in results:
        isinstance(r, Exception) and logger.warning("OpenRouter image batch item failed: %s", r)
        isinstance(r, list) and urls.extend(r)
    return urls


async def edit_openrouter_image(
    *,
    api_key: str,
    base_url: str | None,
    model: str,
    image_urls: list[str],
    prompt: str,
    aspect_ratio: str | None = None,
    quality: str | None = None,
    mask_url: str | None = None,
    user_id: str | None = None,
) -> str:
    """图像编辑/多图参考入口：统一走 chat/completions + image_config。

    注：OpenRouter 不提供 /images/edits 端点；
    mask/output_format/output_compression/background/moderation 在 OpenRouter 上不生效，
    保留签名以向上层保持接口兼容。
    """
    mask_url and logger.debug("mask_url provided but OpenRouter does not support image editing masks; ignored for %s", model)
    urls = await _call_chat_image_path(
        api_key=api_key,
        base_url=base_url,
        model=model,
        prompt=prompt,
        reference_image_urls=image_urls,
        aspect_ratio=aspect_ratio,
        quality=quality,
        user_id=user_id,
    )
    return urls[0] if urls else ""


# ---------------------------------------------------------------------------
# Public streaming entrypoint (degraded: sync + single-frame yield)
# ---------------------------------------------------------------------------
async def stream_generate_openrouter_images(
    *,
    api_key: str,
    base_url: str | None,
    model: str,
    prompt: str,
    aspect_ratio: str | None = None,
    quality: str | None = None,
    n: int = 1,
    user_id: str | None = None,
) -> AsyncIterator[StreamEvent]:
    """Streaming image generation (degraded to sync + single-frame yield).

    OpenRouter 不提供原生图像 SSE，因此等待同步结果后单帧推送，保持调用方接口一致。
    """
    try:
        urls = await batch_generate_openrouter_images(
            api_key=api_key,
            base_url=base_url,
            model=model,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            quality=quality,
            n=n,
            user_id=user_id,
        )
    except Exception as e:
        yield {"type": "error", "message": str(e)[:300]}
        return
    for idx, u in enumerate(urls):
        yield {"type": "final_image", "index": idx, "url": u}
    yield {"type": "done"}
