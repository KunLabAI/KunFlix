"""统一业务异常 BizError + 错误码常量。

设计原则：
1. error_code 为 UPPER_SNAKE_CASE 的机器可读字符串，前端按 code 查 i18n 字典
2. detail 是英文 fallback 文案（前端 i18n 缺 key 时降级展示）
3. data 携带可选业务上下文，例如 {"current_balance": 0, "required": 5}
4. 不依赖 FastAPI，纯异常类；由 main.py 的 exception_handler 转 JSONResponse

使用示例：
    raise BizError.insufficient_credits(current_balance=0)
    raise BizError("CUSTOM_CODE", "Custom error", status_code=400, data={"x": 1})
"""
from __future__ import annotations

from typing import Any, Optional


# ---------------------------------------------------------------------------
# 错误码常量（与前端 i18n key 一一对应）
# ---------------------------------------------------------------------------
class ErrorCode:
    # 认证 / 授权
    UNAUTHORIZED = "UNAUTHORIZED"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"

    # 资源
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    RESOURCE_CONFLICT = "RESOURCE_CONFLICT"

    # 计费
    INSUFFICIENT_CREDITS = "INSUFFICIENT_CREDITS"
    BALANCE_FROZEN = "BALANCE_FROZEN"

    # 限流
    RATE_LIMITED = "RATE_LIMITED"

    # 校验
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INVALID_PARAMETER = "INVALID_PARAMETER"

    # 服务
    INTERNAL_ERROR = "INTERNAL_ERROR"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    UPSTREAM_ERROR = "UPSTREAM_ERROR"

    # 兜底
    HTTP_ERROR = "HTTP_ERROR"
    UNKNOWN = "UNKNOWN"


# HTTP 状态码 → 默认错误码（兼容老的 raise HTTPException）
STATUS_TO_CODE: dict[int, str] = {
    400: ErrorCode.INVALID_PARAMETER,
    401: ErrorCode.UNAUTHORIZED,
    402: ErrorCode.INSUFFICIENT_CREDITS,
    403: ErrorCode.PERMISSION_DENIED,
    404: ErrorCode.RESOURCE_NOT_FOUND,
    409: ErrorCode.RESOURCE_CONFLICT,
    422: ErrorCode.VALIDATION_ERROR,
    429: ErrorCode.RATE_LIMITED,
    500: ErrorCode.INTERNAL_ERROR,
    502: ErrorCode.UPSTREAM_ERROR,
    503: ErrorCode.SERVICE_UNAVAILABLE,
    504: ErrorCode.UPSTREAM_ERROR,
}


# ---------------------------------------------------------------------------
# BizError
# ---------------------------------------------------------------------------
class BizError(Exception):
    """业务异常基类。被 main.py 的 exception_handler 捕获并转结构化响应。"""

    def __init__(
        self,
        code: str,
        detail: str,
        status_code: int = 400,
        data: Optional[dict[str, Any]] = None,
    ):
        self.code = code
        self.detail = detail
        self.status_code = status_code
        self.data = data
        super().__init__(detail)

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "detail": self.detail, "data": self.data}

    # ------------------------------------------------------------
    # 工厂方法（业务侧调用入口，避免散落的字符串字面量）
    # ------------------------------------------------------------
    @classmethod
    def insufficient_credits(
        cls, current_balance: float = 0.0, required: Optional[float] = None
    ) -> "BizError":
        return cls(
            code=ErrorCode.INSUFFICIENT_CREDITS,
            detail="Insufficient credits. Please recharge to continue.",
            status_code=402,
            data={"current_balance": current_balance, "required": required},
        )

    @classmethod
    def balance_frozen(cls, user_id: Optional[str] = None) -> "BizError":
        return cls(
            code=ErrorCode.BALANCE_FROZEN,
            detail="Account balance is frozen. Please contact administrator.",
            status_code=403,
            data={"user_id": user_id} if user_id else None,
        )

    @classmethod
    def not_found(cls, resource: str = "Resource") -> "BizError":
        return cls(
            code=ErrorCode.RESOURCE_NOT_FOUND,
            detail=f"{resource} not found",
            status_code=404,
        )

    @classmethod
    def permission_denied(cls, detail: str = "Permission denied") -> "BizError":
        return cls(
            code=ErrorCode.PERMISSION_DENIED,
            detail=detail,
            status_code=403,
        )

    @classmethod
    def rate_limited(cls, retry_after: Optional[int] = None) -> "BizError":
        return cls(
            code=ErrorCode.RATE_LIMITED,
            detail="Too many requests. Please try again later.",
            status_code=429,
            data={"retry_after": retry_after} if retry_after else None,
        )

    @classmethod
    def invalid_parameter(cls, detail: str = "Invalid parameter") -> "BizError":
        return cls(
            code=ErrorCode.INVALID_PARAMETER,
            detail=detail,
            status_code=400,
        )

    @classmethod
    def upstream(cls, detail: str = "Upstream service error") -> "BizError":
        return cls(
            code=ErrorCode.UPSTREAM_ERROR,
            detail=detail,
            status_code=502,
        )


__all__ = ["BizError", "ErrorCode", "STATUS_TO_CODE"]
