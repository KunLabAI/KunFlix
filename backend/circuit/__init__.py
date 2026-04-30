"""Circuit breaker abstraction backed by purgatory.

设计要点：
- 按上游供应商维度维护独立 breaker（key = "llm:openai" / "llm:anthropic" 等）
- threshold / ttl 通过 settings 控制，未启用时退化为 no-op 上下文，零侵入
- 失败由调用方 raise 异常触发，breaker.open 后调用方应快速降级返回（HTTP 503）
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from config import settings

logger = logging.getLogger(__name__)


class CircuitOpenError(RuntimeError):
    """断路器开启状态时抛出，调用方应转为 503/降级响应。"""


# 真实工厂在启用时延迟初始化（避免无依赖时 import 失败）
_factory = None
_init_done = False


def _ensure_factory():
    global _factory, _init_done
    if _init_done:
        return _factory
    _init_done = True
    try:
        from purgatory import AsyncCircuitBreakerFactory  # type: ignore
        _factory = AsyncCircuitBreakerFactory(
            default_threshold=settings.CIRCUIT_BREAKER_THRESHOLD,
            default_ttl=settings.CIRCUIT_BREAKER_TTL,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("purgatory unavailable, circuit breaker disabled: %s", exc)
        _factory = None
    return _factory


@asynccontextmanager
async def guarded(name: str) -> AsyncIterator[None]:
    """异步上下文管理器：在受保护代码块外加断路器。

    使用：
        async with guarded(f"llm:{provider_type}"):
            ... # call upstream

    未启用 / purgatory 不可用 → 直接 yield，无副作用。
    断路器为 OPEN 时抛 CircuitOpenError。
    """
    enabled = bool(settings.CIRCUIT_BREAKER_ENABLED)
    factory = _ensure_factory() if enabled else None
    if not factory:
        yield
        return
    try:
        breaker = await factory.get_breaker(name)
        async with breaker:
            yield
    except Exception as exc:  # noqa: BLE001
        # purgatory OpenedState 异常类名包含 "Open"
        if type(exc).__name__.lower().endswith("opened") or "opened" in str(exc).lower():
            raise CircuitOpenError(f"circuit '{name}' is OPEN") from exc
        raise


__all__ = ["guarded", "CircuitOpenError"]
