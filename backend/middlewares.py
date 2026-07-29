"""KunFlix Agent Middlewares — 基于 AgentScope 2.0 MiddlewareBase。

提供以下中间件：
- DynamicContextMiddleware: on_system_prompt 钩子，注入动态上下文（时间、环境信息）
- ModelRetryMiddleware: on_model_call 钩子，模型调用失败时自动重试 + 可选回退模型
- ObservabilityMiddleware: on_reply + on_model_call 钩子，结构化日志和 token 追踪
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Awaitable, Callable, TYPE_CHECKING

from agentscope.middleware import MiddlewareBase

if TYPE_CHECKING:
    from agentscope.agent import Agent
    from agentscope.event import AgentEvent
    from agentscope.message import Msg
    from agentscope.model import ChatResponse

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# DynamicContextMiddleware — on_system_prompt
# ---------------------------------------------------------------------------

class DynamicContextMiddleware(MiddlewareBase):
    """在每次推理前向 system prompt 注入动态上下文。

    注入内容：
    - 当前时间（UTC + 本地）
    - 可选的自定义上下文提供函数
    """

    def __init__(
        self,
        timezone_name: str = "Asia/Shanghai",
        extra_context_fn: Callable[[], str] | None = None,
    ) -> None:
        self._tz_name = timezone_name
        self._extra_fn = extra_context_fn

    async def on_system_prompt(self, agent: "Agent", current_prompt: str) -> str:
        """在 system prompt 末尾追加动态上下文段落。"""
        now = datetime.now(timezone.utc)
        parts = [
            "\n\n## Dynamic Context",
            f"- Current time (UTC): {now.strftime('%Y-%m-%d %H:%M:%S')}",
            f"- Timezone: {self._tz_name}",
        ]
        # 追加自定义上下文（如果提供）
        extra = self._extra_fn() if self._extra_fn else None
        extra and parts.append(f"- {extra}")

        return current_prompt + "\n".join(parts)


# ---------------------------------------------------------------------------
# ModelRetryMiddleware — on_model_call
# ---------------------------------------------------------------------------

class ModelRetryMiddleware(MiddlewareBase):
    """模型调用失败时自动重试；可选配置回退模型。

    特性：
    - 指数退避重试（默认 3 次）
    - 可配置回退模型实例（所有重试失败后切换）
    - 记录每次重试的延迟和错误
    """

    def __init__(
        self,
        max_retries: int = 2,
        backoff_base: float = 1.0,
        fallback_model: Any | None = None,
    ) -> None:
        self._max_retries = max_retries
        self._backoff_base = backoff_base
        self._fallback = fallback_model

    async def on_model_call(
        self,
        agent: "Agent",
        input_kwargs: dict,
        next_handler: Callable[..., Awaitable["ChatResponse | AsyncGenerator[ChatResponse, None]"]],
    ) -> "ChatResponse | AsyncGenerator[ChatResponse, None]":
        """包裹模型调用：重试 + 可选回退。"""
        last_exc: Exception | None = None

        for attempt in range(self._max_retries + 1):
            try:
                return await next_handler(**input_kwargs)
            except Exception as exc:
                last_exc = exc
                remaining = self._max_retries - attempt
                logger.warning(
                    "[ModelRetry] %s attempt %d/%d failed: %s (remaining: %d)",
                    agent.name, attempt + 1, self._max_retries + 1, exc, remaining,
                )
                # 未达上限则退避
                remaining > 0 and await asyncio.sleep(self._backoff_base * (2 ** attempt))

        # 所有重试耗尽 — 尝试回退模型
        if self._fallback:
            logger.info("[ModelRetry] All retries exhausted, switching to fallback model for %s", agent.name)
            try:
                return await next_handler(current_model=self._fallback, **{
                    k: v for k, v in input_kwargs.items() if k != "current_model"
                })
            except Exception as fallback_exc:
                logger.error("[ModelRetry] Fallback model also failed: %s", fallback_exc)
                raise fallback_exc from last_exc

        # 无回退模型，抛出最后一个异常（or 兜底满足静态分析：循环至少执行一次时 last_exc 必非 None）
        raise last_exc or RuntimeError("ModelRetry: model call failed before any attempt was made")


# ---------------------------------------------------------------------------
# ObservabilityMiddleware — on_reply + on_model_call
# ---------------------------------------------------------------------------

class ObservabilityMiddleware(MiddlewareBase):
    """结构化日志 + token 追踪。

    - on_reply: 记录整个 reply 的开始/结束和耗时
    - on_model_call: 记录每次模型调用的 token 消耗
    """

    async def on_reply(
        self,
        agent: "Agent",
        input_kwargs: dict,
        next_handler: Callable[..., AsyncGenerator["AgentEvent | Msg", None]],
    ) -> AsyncGenerator["AgentEvent | Msg", None]:
        """包裹整个 reply 流程，记录耗时。"""
        start = time.perf_counter()
        logger.info("[Reply] %s starting reply", agent.name)

        async for item in next_handler(**input_kwargs):
            yield item

        elapsed = time.perf_counter() - start
        logger.info("[Reply] %s completed in %.2fs", agent.name, elapsed)

    async def on_model_call(
        self,
        agent: "Agent",
        input_kwargs: dict,
        next_handler: Callable[..., Awaitable["ChatResponse | AsyncGenerator[ChatResponse, None]"]],
    ) -> "ChatResponse | AsyncGenerator[ChatResponse, None]":
        """记录模型调用的 token 消耗和耗时。"""
        model_name = getattr(input_kwargs.get("current_model"), "model", "unknown")
        start = time.perf_counter()

        result = await next_handler(**input_kwargs)

        elapsed = time.perf_counter() - start
        # 流式模式下 result 是 generator，非流式是 ChatResponse
        # 非流式时可以直接读取 usage
        usage = getattr(result, "usage", None)
        usage_info = (
            f"in={usage.input_tokens} out={usage.output_tokens}"
            if usage and hasattr(usage, "input_tokens")
            else "streaming"
        )
        logger.info("[ModelCall] %s → %s: %s (%.2fs)", agent.name, model_name, usage_info, elapsed)

        return result


# ---------------------------------------------------------------------------
# 默认中间件栈工厂
# ---------------------------------------------------------------------------

def build_default_middlewares(
    *,
    enable_retry: bool = True,
    enable_dynamic_context: bool = True,
    enable_observability: bool = True,
    fallback_model: Any | None = None,
    extra_context_fn: Callable[[], str] | None = None,
) -> list[MiddlewareBase]:
    """构建默认中间件栈。

    顺序：ObservabilityMiddleware（最外层）→ ModelRetryMiddleware → DynamicContextMiddleware
    """
    middlewares: list[MiddlewareBase] = []

    # 最外层：可观测性（记录整体耗时）
    enable_observability and middlewares.append(ObservabilityMiddleware())

    # 模型调用重试
    enable_retry and middlewares.append(
        ModelRetryMiddleware(max_retries=2, fallback_model=fallback_model)
    )

    # 动态上下文注入
    enable_dynamic_context and middlewares.append(
        DynamicContextMiddleware(extra_context_fn=extra_context_fn)
    )

    return middlewares


__all__ = [
    "DynamicContextMiddleware",
    "ModelRetryMiddleware",
    "ObservabilityMiddleware",
    "build_default_middlewares",
]
