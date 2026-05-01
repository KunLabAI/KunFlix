"""Shared retry utilities for transient upstream network errors.

Covers both Gemini SDK (aiohttp under the hood) and direct httpx callers.
Recognizes connection-level instabilities where the response body is cut off
or the socket dies mid-flight — those deserve a retry. Logical 4xx/5xx errors
are re-raised immediately.

Typical symptom this protects against:

    aiohttp.client_exceptions.ClientPayloadError:
      Response payload is not completed: <TransferEncodingError: 400, ...>
"""
from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Error class names matched by module to avoid importing both libraries at import time.
# aiohttp is used by google-genai SDK; httpx is used by our video/music providers.
_TRANSIENT_AIOHTTP: frozenset[str] = frozenset({
    "ClientPayloadError",        # response body truncated (Transfer-Encoding)
    "ServerDisconnectedError",   # keep-alive socket closed mid-request
    "ClientConnectionError",
    "ClientOSError",
    "ClientConnectorError",
})

_TRANSIENT_HTTPX: frozenset[str] = frozenset({
    "RemoteProtocolError",
    "ReadError",
    "WriteError",
    "ConnectError",
    "ReadTimeout",
    "ConnectTimeout",
    "WriteTimeout",
})


def is_transient_network_error(exc: BaseException) -> bool:
    """Walk the exception chain and check for any known transient network error."""
    seen: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        name = type(cur).__name__
        mod = (type(cur).__module__ or "")
        hit = (
            (mod.startswith("aiohttp") and name in _TRANSIENT_AIOHTTP)
            or (mod.startswith("httpx") and name in _TRANSIENT_HTTPX)
        )
        if hit:
            return True
        cur = cur.__cause__ or cur.__context__
    return False


async def run_with_retry(
    func: Callable[[], Awaitable[T]],
    *,
    max_attempts: int = 3,
    base_backoff: float = 2.0,
    label: str = "",
) -> T:
    """Run an async thunk, retrying on transient network errors.

    - max_attempts=3 means: try once, retry up to 2 more times.
    - Backoff is exponential: base_backoff * 2^(attempt-1).
    - Non-transient errors bubble up immediately (no retry).
    """
    attempt = 0
    while True:
        attempt += 1
        try:
            return await func()
        except Exception as exc:
            transient = is_transient_network_error(exc)
            exhausted = attempt >= max_attempts
            # Non-retryable or last attempt: surface the original exception.
            (not transient or exhausted) and _raise(exc)
            delay = base_backoff * (2 ** (attempt - 1))
            logger.warning(
                "[%s] transient network error on attempt %d/%d: %s: %s — retrying in %.1fs",
                label or "retry", attempt, max_attempts,
                type(exc).__name__, exc, delay,
            )
            await asyncio.sleep(delay)


def _raise(exc: BaseException) -> None:
    """Helper to raise from an expression context (keeps run_with_retry if-light)."""
    raise exc


def friendly_network_error_message(exc: BaseException, service: str = "") -> str:
    """Return a user-friendly message for a transient network error.

    Falls back to the raw exception string when the error is not recognized
    as a transient network issue.
    """
    prefix = f"{service} " if service else ""
    return (
        f"{prefix}上游响应中断或网络不稳定（{type(exc).__name__}），"
        f"已自动重试仍失败，请稍后重试"
        if is_transient_network_error(exc)
        else f"{prefix}{exc}"
    )
