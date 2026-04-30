"""Rate limiting setup based on slowapi.

提供两个层级 limiter：
- `limiter`: 默认通用 limiter（key_func 优先 user_id，否则 IP）
- `ip_limiter`: 强制 IP 维度（用于登录/注册等未鉴权端点）

启用方式：通过 `RATE_LIMIT_ENABLED` 配置 + Redis 时使用分布式存储。
未启用或 Redis 缺失时退化为 in-memory，开发环境可用、不报错。

业务侧使用：
    from ratelimit import limiter
    @router.post("/...")
    @limiter.limit("60/minute")
    async def handler(request: Request, ...): ...
"""
from ratelimit.limiter import limiter, ip_limiter, install_rate_limit, rate_limit_exceeded_handler, ENDPOINT_LIMITS

__all__ = [
    "limiter",
    "ip_limiter",
    "install_rate_limit",
    "rate_limit_exceeded_handler",
    "ENDPOINT_LIMITS",
]
