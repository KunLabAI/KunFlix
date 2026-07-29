"""FastAPI application entrypoint.

职责收敛：仅做日志配置、Windows 兼容、应用实例创建、中间件 & 路由注册。
数据库连接/迁移/初始化逻辑全部迁移到 `startup.py`，便于单元测试与复用。
"""
import asyncio
import codecs
import logging
import os
import sys

logger = logging.getLogger(__name__)

import uvicorn
from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from errors import BizError, ErrorCode, STATUS_TO_CODE

# ---------------------------------------------------------------------------
# 代理自动检测（跨平台）：
#   1. 自动检测系统代理设置（Windows 注册表 / macOS scutil / Linux gsettings）
#   2. 若检测到系统代理 → 设置 HTTP_PROXY/HTTPS_PROXY → 外网模型（Gemini/Claude）走代理
#   3. 始终将 localhost/127.0.0.1 加入 NO_PROXY → Ollama 本地调用绕过代理
# ---------------------------------------------------------------------------
import subprocess as _sp


def _detect_system_proxy() -> str | None:
    """跨平台检测系统代理。返回 'http://host:port' 或 None。"""
    _DETECTORS = {
        "win32": _detect_proxy_windows,
        "darwin": _detect_proxy_macos,
        "linux": _detect_proxy_linux,
    }
    detector = _DETECTORS.get(sys.platform)
    return detector() if detector else None


def _detect_proxy_windows() -> str | None:
    """Windows: 读取注册表 Internet Settings。"""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                            r"Software\Microsoft\Windows\CurrentVersion\Internet Settings") as key:
            enabled, _ = winreg.QueryValueEx(key, "ProxyEnable")
            server, _ = winreg.QueryValueEx(key, "ProxyServer")
            if enabled and server:
                # 协议分组格式 "http=h:p;https=h:p;..." 或简单格式 "host:port"
                parts = dict(item.split("=", 1) for item in server.split(";") if "=" in item)
                addr = parts.get("https") or parts.get("http") or server
                return f"http://{addr}" if not addr.startswith("http") else addr
    except Exception:
        logging.debug("Failed to detect Windows system proxy from registry.", exc_info=True)
    return None


def _detect_proxy_macos() -> str | None:
    """macOS: 通过 scutil --proxy 读取系统网络代理。"""
    try:
        out = _sp.check_output(["scutil", "--proxy"], text=True, timeout=3)
        lines = {l.strip().split(" : ")[0]: l.strip().split(" : ")[1]
                 for l in out.splitlines() if " : " in l}
        # 优先 HTTPS，回退 HTTP
        for enable_key, host_key, port_key in [
            ("HTTPSEnable", "HTTPSProxy", "HTTPSPort"),
            ("HTTPEnable", "HTTPProxy", "HTTPPort"),
        ]:
            enabled = lines.get(enable_key, "0") == "1"
            host = lines.get(host_key, "")
            port = lines.get(port_key, "")
            if enabled and host:
                return f"http://{host}:{port}" if port else f"http://{host}"
        # SOCKS 代理（Clash 增强模式常用）
        socks_on = lines.get("SOCKSEnable", "0") == "1"
        socks_host = lines.get("SOCKSProxy", "")
        socks_port = lines.get("SOCKSPort", "")
        if socks_on and socks_host:
            return f"socks5://{socks_host}:{socks_port}" if socks_port else f"socks5://{socks_host}"
    except Exception as e:
        logger.debug("Failed to detect macOS system proxy: %s", e, exc_info=True)
    return None


def _detect_proxy_linux() -> str | None:
    """Linux: 通过 gsettings 读取 GNOME 代理，或检测常见代理端口。"""
    # 尝试 gsettings（GNOME 桌面）
    try:
        mode = _sp.check_output(
            ["gsettings", "get", "org.gnome.system.proxy", "mode"], text=True, timeout=3
        ).strip().strip("'")
        if mode == "manual":
            host = _sp.check_output(
                ["gsettings", "get", "org.gnome.system.proxy.http", "host"], text=True, timeout=3
            ).strip().strip("'")
            port = _sp.check_output(
                ["gsettings", "get", "org.gnome.system.proxy.http", "port"], text=True, timeout=3
            ).strip()
            if host and port and port != "0":
                return f"http://{host}:{port}"
    except Exception as e:
        logger.debug("Failed to detect Linux system proxy: %s", e, exc_info=True)
    return None


# 优先级：环境变量 > 系统代理自动检测
_proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or os.environ.get("https_proxy") or os.environ.get("http_proxy")
_proxy_url = _proxy_url or _detect_system_proxy()
_proxy_url and os.environ.setdefault("HTTP_PROXY", _proxy_url)
_proxy_url and os.environ.setdefault("HTTPS_PROXY", _proxy_url)
_proxy_url and os.environ.setdefault("http_proxy", _proxy_url)
_proxy_url and os.environ.setdefault("https_proxy", _proxy_url)

# NO_PROXY: 本地地址始终绕过代理（Ollama / 本地服务）
_no_proxy_existing = os.environ.get("NO_PROXY") or os.environ.get("no_proxy") or ""
_no_proxy_set = {item.strip() for item in _no_proxy_existing.split(",") if item.strip()}
_no_proxy_set.update({"localhost", "127.0.0.1", "::1"})
_no_proxy_value = ",".join(sorted(_no_proxy_set))
os.environ["NO_PROXY"] = _no_proxy_value
os.environ["no_proxy"] = _no_proxy_value

# 日志输出代理状态（启动时可见）
_proxy_url and print(f"[PROXY] 检测到代理: {_proxy_url} | NO_PROXY: {_no_proxy_value}")
(not _proxy_url) and print(f"[PROXY] 未检测到代理，外网模型可能无法连接 | NO_PROXY: {_no_proxy_value}")

# ---------------------------------------------------------------------------
# Windows 兼容：asyncpg + 控制台 UTF-8
# ---------------------------------------------------------------------------
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    hasattr(sys.stdout, "buffer") and setattr(
        sys, "stdout", codecs.getwriter("utf-8")(sys.stdout.buffer, "ignore")
    )
    hasattr(sys.stderr, "buffer") and setattr(
        sys, "stderr", codecs.getwriter("utf-8")(sys.stderr.buffer, "ignore")
    )

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="[%(name)s] %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

# 日志噪音抑制策略（映射表驱动）
# watchfiles.main: uvicorn --reload 底层的文件监听器，SQLite WAL 模式下
# kunflix.db-wal/-shm 会因每次连接/查询频繁变动，触发 "N change(s) detected"
# INFO 刷屏；uvicorn 的 FileFilter 只匹配 *.py 不会真的 reload，因此这里
# 直接抑制 INFO 级别，避免掩盖真正有意义的日志。
_LOGGER_LEVELS = {
    "sqlalchemy.engine": logging.WARNING,
    "sqlalchemy.pool": logging.WARNING,
    "uvicorn.access": logging.WARNING,
    "watchfiles.main": logging.WARNING,
}
for _name, _level in _LOGGER_LEVELS.items():
    logging.getLogger(_name).setLevel(_level)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Imports that depend on logging/env set above
# ---------------------------------------------------------------------------
from config import settings  # noqa: E402
from routers import (  # noqa: E402
    admin as admin_router,
    admin_auth,
    admin_dashboard,
    admin_debug,
    admin_email_providers,
    admin_pricing,
    admin_sub_agent_templates,
    admin_system_settings,
    admin_tools,
    admin_virtual_humans,
    agents,
    auth as auth_router,
    chats,
    images,
    llm_config,
    media,
    music,
    orchestrate,
    prompt_templates,
    skills_api,
    sse as sse_router,
    subscriptions,
    theaters,
    videos,
)
from startup import lifespan  # noqa: E402
from ratelimit import install_rate_limit  # noqa: E402


app = FastAPI(title="KunFlix", lifespan=lifespan)
install_rate_limit(app)


# ---------------------------------------------------------------------------
# Exception handlers
#  统一响应结构：{"code": str, "detail": str, "data": any}
#  前端按 code 查 i18n 字典展示文案，detail 作为 fallback
# ---------------------------------------------------------------------------
@app.exception_handler(BizError)
async def _biz_error_handler(request: Request, exc: BizError):
    logger.info(
        "[BizError] %s %s => %s (%d)", request.method, request.url.path, exc.code, exc.status_code
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "detail": exc.detail, "data": exc.data},
    )


@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException):
    """兼容现有 raise HTTPException 调用，自动包装为统一结构。

    - status 反查 code（STATUS_TO_CODE），未命中走 HTTP_ERROR
    - detail 保留原始文案作为 fallback
    - 保留 exc.headers（如 WWW-Authenticate）
    """
    code = STATUS_TO_CODE.get(exc.status_code, ErrorCode.HTTP_ERROR)
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": code, "detail": detail, "data": None},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def _validation_error_handler(request: Request, exc: RequestValidationError):
    logger.error("[422] %s %s => %s", request.method, request.url.path, exc.errors())
    return JSONResponse(
        status_code=422,
        content={
            "code": ErrorCode.VALIDATION_ERROR,
            "detail": "Invalid request parameters",
            "data": {"errors": exc.errors()},
        },
    )


@app.exception_handler(Exception)
async def _fallback_exception_handler(request: Request, exc: Exception):
    logger.exception("[500] %s %s => unhandled %s", request.method, request.url.path, type(exc).__name__)
    return JSONResponse(
        status_code=500,
        content={
            "code": ErrorCode.INTERNAL_ERROR,
            "detail": "Internal server error",
            "data": None,
        },
    )


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Router registry（列表驱动，避免重复 app.include_router 样板）
# ---------------------------------------------------------------------------
_ROUTERS = (
    auth_router.router,
    admin_auth.router,
    llm_config.router,
    admin_pricing.router,
    admin_router.router,
    agents.router,
    chats.router,
    orchestrate.router,
    media.router,
    subscriptions.router,
    prompt_templates.router,
    videos.router,
    images.router,
    theaters.router,
    skills_api.router,
    admin_debug.router,
    admin_system_settings.router,
    admin_email_providers.router,
    admin_email_providers.templates_router,
    admin_tools.router,
    music.router,
    admin_dashboard.router,
    admin_virtual_humans.router,
    admin_sub_agent_templates.router,
    sse_router.router,
)
for _router in _ROUTERS:
    app.include_router(_router)


@app.get("/")
async def root():
    return {"message": "Welcome to the KunFlix API"}


@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    """统一实时网关。客户端连接 /api/ws?token=<jwt>。"""
    from realtime.gateway import websocket_endpoint as ws_handler
    await ws_handler(websocket)


# 向后兼容：保留旧路径 /ws/{user_id} 作为 echo 调试，不参与事件路由
@app.websocket("/ws/{user_id}")
async def legacy_echo_ws(websocket: WebSocket, user_id: str):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Message received: {data}")
    except Exception as exc:  # noqa: BLE001
        logger.warning("WebSocket error (user=%s): %s", user_id, exc)
    finally:
        await websocket.close()


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
