"""MiniMax-H3 (video generation v2) 适配器单元测试。

覆盖：
- 场景推导 t2va / i2va / r2va（图生与参考生互斥）
- content[] 组装：text / image_url / video_url / audio_url + role
- resolution / duration / ratio 归一化规则
- 素材数量截断（图 9 / 视频 3 / 音频 3）
- 参数预校验：缺提示词、参考音频单独输入、图生缺图、素材体积超限
- v2 任务状态映射与失败原因提取
- base_url 版本后缀剥离

纯函数级测试，不发起真实 HTTP 请求。
"""
from __future__ import annotations

import base64

import pytest

from services.video_providers.base import VideoContext
from services.video_providers.minimax_provider import MiniMaxVideoAdapter
from services.video_providers.model_capabilities import get_model_capabilities


H3 = "MiniMax-H3"


@pytest.fixture
def adapter() -> MiniMaxVideoAdapter:
    return MiniMaxVideoAdapter()


def make_ctx(**overrides) -> VideoContext:
    base = {
        "api_key": "sk-test",
        "model": H3,
        "prompt": "海边打篮球的男孩",
        "provider_type": "minimax",
        "duration": 5,
        "quality": "2k",
        "aspect_ratio": "16:9",
        "video_mode": "text_to_video",
    }
    base.update(overrides)
    return VideoContext(**base)


def data_url(mime: str, size_bytes: int) -> str:
    """构造指定原始体积的 data URL"""
    raw = b"x" * size_bytes
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def content_of(payload: dict, item_type: str) -> list[dict]:
    return [c for c in payload["content"] if c["type"] == item_type]


# =============================================================================
# 场景推导
# =============================================================================
class TestSceneDetection:
    def test_text_only_is_t2va(self, adapter):
        assert adapter.h3_scene(make_ctx()) == "t2va"

    def test_first_frame_is_i2va(self, adapter):
        ctx = make_ctx(video_mode="image_to_video", image_url="https://cdn/a.png")
        assert adapter.h3_scene(ctx) == "i2va"

    def test_last_frame_only_is_i2va(self, adapter):
        ctx = make_ctx(video_mode="image_to_video", last_frame_image="https://cdn/b.png")
        assert adapter.h3_scene(ctx) == "i2va"

    def test_reference_mode_is_r2va(self, adapter):
        ctx = make_ctx(
            video_mode="reference_images",
            reference_images=[{"url": "https://cdn/r1.png"}],
        )
        assert adapter.h3_scene(ctx) == "r2va"

    def test_reference_wins_over_frames_when_mode_is_reference(self, adapter):
        """图生与参考生互斥：reference 模式下首尾帧被丢弃"""
        ctx = make_ctx(
            video_mode="reference_images",
            image_url="https://cdn/first.png",
            last_frame_image="https://cdn/last.png",
            reference_videos=[{"url": "https://cdn/ref.mp4"}],
        )
        assert adapter.h3_scene(ctx) == "r2va"
        roles = {i["role"] for i in adapter.h3_media_items(ctx)}
        assert roles == {"reference_video"}


# =============================================================================
# payload 组装
# =============================================================================
class TestPayloadBuild:
    def test_text_to_video_payload(self, adapter):
        payload = adapter.build_h3_payload(make_ctx())
        assert payload["model"] == H3
        assert payload["resolution"] == "2K"
        assert payload["duration"] == 5
        assert payload["ratio"] == "16:9"
        assert payload["content"] == [{"type": "text", "text": "海边打篮球的男孩"}]

    def test_first_and_last_frame_roles(self, adapter):
        ctx = make_ctx(
            video_mode="image_to_video",
            image_url="https://cdn/first.png",
            last_frame_image="https://cdn/last.png",
        )
        payload = adapter.build_h3_payload(ctx)
        images = content_of(payload, "image_url")
        assert [i["role"] for i in images] == ["first_frame", "last_frame"]
        assert images[0]["image_url"] == {"url": "https://cdn/first.png"}

    def test_reference_content_types_and_roles(self, adapter):
        ctx = make_ctx(
            video_mode="reference_images",
            reference_images=[{"url": "https://cdn/i.png"}],
            reference_videos=[{"url": "https://cdn/v.mp4"}],
            reference_audios=[{"url": "https://cdn/a.mp3"}],
        )
        payload = adapter.build_h3_payload(ctx)
        assert content_of(payload, "image_url")[0]["role"] == "reference_image"
        assert content_of(payload, "video_url")[0]["role"] == "reference_video"
        assert content_of(payload, "audio_url")[0]["role"] == "reference_audio"
        # 提示词始终作为首个 content 项
        assert payload["content"][0]["type"] == "text"

    def test_reference_counts_are_truncated(self, adapter):
        ctx = make_ctx(
            video_mode="reference_images",
            reference_images=[{"url": f"https://cdn/i{n}.png"} for n in range(12)],
            reference_videos=[{"url": f"https://cdn/v{n}.mp4"} for n in range(5)],
            reference_audios=[{"url": f"https://cdn/a{n}.mp3"} for n in range(5)],
        )
        payload = adapter.build_h3_payload(ctx)
        assert len(content_of(payload, "image_url")) == 9
        assert len(content_of(payload, "video_url")) == 3
        assert len(content_of(payload, "audio_url")) == 3

    @pytest.mark.parametrize("raw,expected", [(3, 4), (4, 4), (15, 15), (99, 15), (-1, 4)])
    def test_duration_clamped_to_4_15(self, adapter, raw, expected):
        payload = adapter.build_h3_payload(make_ctx(duration=raw))
        assert payload["duration"] == expected

    def test_t2va_rejects_adaptive_ratio(self, adapter):
        """文生视频 ratio 必填且不能为 adaptive"""
        payload = adapter.build_h3_payload(make_ctx(aspect_ratio="adaptive"))
        assert payload["ratio"] == "16:9"

    def test_t2va_keeps_concrete_ratio(self, adapter):
        payload = adapter.build_h3_payload(make_ctx(aspect_ratio="9:16"))
        assert payload["ratio"] == "9:16"

    def test_i2va_ratio_forced_adaptive(self, adapter):
        """图生视频宽高比由输入图决定，恒为 adaptive"""
        ctx = make_ctx(video_mode="image_to_video", image_url="https://cdn/a.png", aspect_ratio="21:9")
        assert adapter.build_h3_payload(ctx)["ratio"] == "adaptive"

    def test_r2va_ratio_defaults_adaptive(self, adapter):
        ctx = make_ctx(
            video_mode="reference_images",
            aspect_ratio="unknown-ratio",
            reference_images=[{"url": "https://cdn/i.png"}],
        )
        assert adapter.build_h3_payload(ctx)["ratio"] == "adaptive"

    def test_prompt_truncated_to_7000_chars(self, adapter):
        payload = adapter.build_h3_payload(make_ctx(prompt="字" * 8000))
        assert len(payload["content"][0]["text"]) == 7000

    def test_log_payload_masks_media(self, adapter):
        ctx = make_ctx(video_mode="image_to_video", image_url=data_url("image/png", 1024))
        sanitized = adapter._sanitize_v2_payload(adapter.build_h3_payload(ctx))
        assert sanitized["content"][1]["image_url"] == "<image_url>"


# =============================================================================
# 参数预校验
# =============================================================================
class TestValidation:
    def test_valid_text_to_video(self, adapter):
        assert adapter.validate_h3(make_ctx()) == ""

    def test_empty_prompt_rejected(self, adapter):
        assert "提示词" in adapter.validate_h3(make_ctx(prompt="   "))

    def test_reference_audio_alone_rejected(self, adapter):
        ctx = make_ctx(
            video_mode="reference_images",
            reference_audios=[{"url": "https://cdn/a.mp3"}],
        )
        assert "参考音频不能单独输入" in adapter.validate_h3(ctx)

    def test_reference_audio_with_image_accepted(self, adapter):
        ctx = make_ctx(
            video_mode="reference_images",
            reference_images=[{"url": "https://cdn/i.png"}],
            reference_audios=[{"url": "https://cdn/a.mp3"}],
        )
        assert adapter.validate_h3(ctx) == ""

    def test_image_to_video_without_image_rejected(self, adapter):
        assert "首帧或尾帧" in adapter.validate_h3(make_ctx(video_mode="image_to_video"))

    def test_oversized_image_rejected(self, adapter):
        ctx = make_ctx(
            video_mode="image_to_video",
            image_url=data_url("image/png", 31 * 1024 * 1024),
        )
        error = adapter.validate_h3(ctx)
        assert "图片" in error and "30MB" in error

    def test_oversized_audio_rejected(self, adapter):
        ctx = make_ctx(
            video_mode="reference_images",
            reference_images=[{"url": "https://cdn/i.png"}],
            reference_audios=[{"url": data_url("audio/mp3", 16 * 1024 * 1024)}],
        )
        error = adapter.validate_h3(ctx)
        assert "音频" in error and "15MB" in error

    def test_public_urls_never_trigger_size_guard(self, adapter):
        ctx = make_ctx(
            video_mode="reference_images",
            reference_videos=[{"url": "https://cdn/huge.mp4"}],
        )
        assert adapter.validate_h3(ctx) == ""

    def test_total_body_over_64mb_rejected(self, adapter):
        """单文件合规但总体积超过 64MB 请求上限"""
        ctx = make_ctx(
            video_mode="reference_images",
            reference_videos=[{"url": data_url("video/mp4", 40 * 1024 * 1024)} for _ in range(2)],
        )
        assert "64MB" in adapter.validate_h3(ctx)


# =============================================================================
# 轮询结果解析
# =============================================================================
class TestStatusMapping:
    @pytest.mark.parametrize("raw,mapped", [
        ("queued", "pending"),
        ("running", "processing"),
        ("succeeded", "completed"),
        ("failed", "failed"),
        ("cancelled", "failed"),
        ("expired", "failed"),
        ("unknown", "pending"),
    ])
    def test_v2_status_map(self, adapter, raw, mapped):
        assert MiniMaxVideoAdapter.V2_STATUS_MAP.get(raw, "pending") == mapped

    def test_known_error_code_translated(self, adapter):
        task = {"error": {"code": "1026", "message": "video description contains sensitive content"}}
        assert "敏感" in MiniMaxVideoAdapter._h3_task_error(task, "failed")

    def test_unknown_error_code_keeps_message(self, adapter):
        task = {"error": {"code": "9999", "message": "boom"}}
        assert MiniMaxVideoAdapter._h3_task_error(task, "failed") == "boom"

    def test_cancelled_without_error_uses_status_note(self, adapter):
        assert MiniMaxVideoAdapter._h3_task_error({}, "cancelled") == "任务已取消"

    def test_expired_without_error_uses_status_note(self, adapter):
        assert "过期" in MiniMaxVideoAdapter._h3_task_error({}, "expired")

    def test_oai_error_extraction(self, adapter):
        body = {
            "type": "error",
            "error": {
                "type": "insufficient_balance_error",
                "message": "insufficient balance (1008)",
                "http_code": "402",
            },
        }
        assert MiniMaxVideoAdapter._extract_v2_error(body) == "insufficient balance (1008)"


# =============================================================================
# Endpoint 归一化 & 能力声明
# =============================================================================
class TestEndpointAndCapabilities:
    @pytest.mark.parametrize("configured,expected", [
        (None, "https://api.minimax.io"),
        ("", "https://api.minimax.io"),
        ("https://api.minimaxi.com", "https://api.minimaxi.com"),
        ("https://api.minimaxi.com/", "https://api.minimaxi.com"),
        ("https://api.minimaxi.com/v1", "https://api.minimaxi.com"),
        ("https://api.minimaxi.com/v2/", "https://api.minimaxi.com"),
    ])
    def test_base_url_normalization(self, configured, expected):
        assert MiniMaxVideoAdapter._resolve_base(configured) == expected

    def test_h3_is_supported_model(self):
        assert MiniMaxVideoAdapter.supports_model(H3)
        assert MiniMaxVideoAdapter.is_v2_model(H3)
        assert not MiniMaxVideoAdapter.is_v2_model("MiniMax-Hailuo-2.3")

    def test_capabilities_declared(self):
        caps = get_model_capabilities(H3)
        assert caps is not None
        assert caps["provider"] == "minimax"
        assert caps["resolutions"] == ["2k"]
        assert caps["durations"] == list(range(4, 16))
        assert set(caps["modes"]) == {"text_to_video", "image_to_video", "reference_images"}
        assert caps["supports_first_frame"] and caps["supports_last_frame"]
        assert caps["max_reference_images"] == 9
        assert caps["max_reference_videos"] == 3
        assert caps["max_reference_audios"] == 3
        assert "adaptive" in caps["aspect_ratios"]

    @pytest.mark.asyncio
    async def test_delete_task_unsupported_for_v1(self, adapter):
        assert await adapter.delete_task("sk", "task-1", model="MiniMax-Hailuo-2.3") is False


# =============================================================================
# HTTP 路由（端点 / 方法 / 请求体）—— 用假客户端替换 httpx.AsyncClient
# =============================================================================
class _FakeResponse:
    def __init__(self, status_code: int = 200, payload: dict | None = None, text: str = ""):
        self.status_code = status_code
        self._payload = payload
        self.text = text
        self.headers = {"content-type": "application/json"}

    def json(self):
        if self._payload is None:
            raise ValueError("not json")
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _FakeClient:
    """记录请求并返回预设响应"""

    def __init__(self, response: _FakeResponse, calls: list):
        self._response = response
        self._calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def _record(self, method: str, url: str, **kwargs):
        self._calls.append({"method": method, "url": url, **kwargs})
        return self._response

    async def post(self, url, **kwargs):
        return await self._record("POST", url, **kwargs)

    async def get(self, url, **kwargs):
        return await self._record("GET", url, **kwargs)

    async def delete(self, url, **kwargs):
        return await self._record("DELETE", url, **kwargs)


@pytest.fixture
def http(monkeypatch):
    """替换 minimax_provider 使用的 httpx.AsyncClient，返回 (calls, set_response)"""
    from services.video_providers import minimax_provider as mod

    state = {"response": _FakeResponse(payload={})}
    calls: list = []
    monkeypatch.setattr(
        mod.httpx, "AsyncClient", lambda **_kw: _FakeClient(state["response"], calls)
    )

    def set_response(status_code: int = 200, payload: dict | None = None, text: str = ""):
        state["response"] = _FakeResponse(status_code, payload, text)

    return calls, set_response


class TestHttpRouting:
    @pytest.mark.asyncio
    async def test_submit_h3_hits_v2_endpoint(self, adapter, http):
        calls, set_response = http
        set_response(200, {"task_id": "424010985738629"})

        result = await adapter.submit(make_ctx(duration=8, aspect_ratio="9:16"))

        assert len(calls) == 1
        assert calls[0]["method"] == "POST"
        assert calls[0]["url"] == "https://api.minimax.io/v2/video_generation"
        body = calls[0]["json"]
        assert body["model"] == H3 and body["resolution"] == "2K"
        assert body["duration"] == 8 and body["ratio"] == "9:16"
        assert result.task_id == "424010985738629"
        assert result.status == "pending" and result.error == ""

    @pytest.mark.asyncio
    async def test_submit_v1_model_still_hits_v1_endpoint(self, adapter, http):
        calls, set_response = http
        set_response(200, {"task_id": "v1-task", "base_resp": {"status_code": 0}})

        result = await adapter.submit(make_ctx(model="MiniMax-Hailuo-2.3", quality="1080p"))

        assert calls[0]["url"] == "https://api.minimax.io/v1/video_generation"
        assert calls[0]["json"]["resolution"] == "1080P"
        assert result.task_id == "v1-task"

    @pytest.mark.asyncio
    async def test_submit_validation_failure_skips_http(self, adapter, http):
        calls, _ = http
        result = await adapter.submit(make_ctx(prompt=""))
        assert calls == []
        assert result.status == "failed" and "提示词" in result.error

    @pytest.mark.asyncio
    async def test_submit_insufficient_balance_translated(self, adapter, http):
        _, set_response = http
        set_response(402, {
            "type": "error",
            "error": {
                "type": "insufficient_balance_error",
                "message": "insufficient balance (1008)",
                "http_code": "402",
            },
        })
        result = await adapter.submit(make_ctx())
        assert result.status == "failed" and "余额不足" in result.error

    @pytest.mark.asyncio
    async def test_poll_h3_success_extracts_url(self, adapter, http):
        calls, set_response = http
        set_response(200, {"task": {
            "id": "t1",
            "model": H3,
            "status": "succeeded",
            "content": {"url": "https://cdn.minimax.io/out.mp4"},
            "resolution": "2K",
            "duration": 5,
            "ratio": "16:9",
        }})

        result = await adapter.poll_with_key("sk", "t1", model=H3)

        assert calls[0]["method"] == "GET"
        assert calls[0]["url"] == "https://api.minimax.io/v2/query/video_generation/t1"
        assert result.status == "completed"
        assert result.video_url == "https://cdn.minimax.io/out.mp4"
        assert result.duration_seconds == 5
        # v2 直接返回下载地址，无需 file_id 二次换取
        assert result.file_id == ""

    @pytest.mark.asyncio
    async def test_poll_h3_failed_extracts_reason(self, adapter, http):
        _, set_response = http
        set_response(200, {"task": {
            "status": "failed",
            "error": {"code": "1026", "message": "video description contains sensitive content"},
        }})
        result = await adapter.poll_with_key("sk", "t2", model=H3)
        assert result.status == "failed" and "敏感" in result.error

    @pytest.mark.asyncio
    async def test_poll_h3_transport_error_stays_pending(self, adapter, http):
        """查询接口报错不等于任务失败，保持 pending 让上层重试"""
        _, set_response = http
        set_response(429, {"type": "error", "error": {"message": "rate limit, please retry later (1002)"}})
        result = await adapter.poll_with_key("sk", "t3", model=H3)
        assert result.status == "pending" and "限流" in result.error

    @pytest.mark.asyncio
    async def test_poll_v1_model_hits_v1_endpoint(self, adapter, http):
        calls, set_response = http
        set_response(200, {"status": "Success", "file_id": "f1", "video_width": 1280, "video_height": 720})

        result = await adapter.poll_with_key("sk", "t4", model="MiniMax-Hailuo-02")

        assert calls[0]["url"] == "https://api.minimax.io/v1/query/video_generation"
        assert calls[0]["params"] == {"task_id": "t4"}
        assert result.status == "completed" and result.file_id == "f1"

    @pytest.mark.asyncio
    async def test_poll_honors_base_url_override(self, adapter, http):
        calls, set_response = http
        set_response(200, {"task": {"status": "running"}})
        result = await adapter.poll_with_key("sk", "t5", base_url="https://api.minimaxi.com/v1", model=H3)
        assert calls[0]["url"] == "https://api.minimaxi.com/v2/query/video_generation/t5"
        assert result.status == "processing"

    @pytest.mark.asyncio
    async def test_delete_h3_task(self, adapter, http):
        calls, set_response = http
        set_response(200, {"task_id": "t6", "action": "cancel", "status": "cancelled"})

        ok = await adapter.delete_task("sk", "t6", model=H3)

        assert ok is True
        assert calls[0]["method"] == "DELETE"
        assert calls[0]["url"] == "https://api.minimax.io/v2/video_generation/t6"

    @pytest.mark.asyncio
    async def test_delete_h3_running_task_returns_false(self, adapter, http):
        _, set_response = http
        set_response(400, {"type": "error", "error": {"message": "task is running (2013)"}})
        assert await adapter.delete_task("sk", "t7", model=H3) is False


class TestServiceLayerRouting:
    """services.video_generation 工厂层对 MiniMax 双代次的透传"""

    @pytest.mark.asyncio
    async def test_poll_video_task_passes_model_and_skips_file_retrieve(self, http):
        from services.video_generation import poll_video_task

        calls, set_response = http
        set_response(200, {"task": {"status": "succeeded", "content": {"url": "https://cdn/out.mp4"}, "duration": 6}})

        result = await poll_video_task("sk", "t8", "minimax", model=H3)

        # 只有一次查询请求，未再调用 /v1/files/retrieve
        assert len(calls) == 1
        assert calls[0]["url"].endswith("/v2/query/video_generation/t8")
        assert result.video_url == "https://cdn/out.mp4"

    @pytest.mark.asyncio
    async def test_cancel_video_task_unsupported_provider(self):
        from services.video_generation import cancel_video_task

        assert await cancel_video_task("sk", "t9", "xai", model="grok-imagine-video") is False
