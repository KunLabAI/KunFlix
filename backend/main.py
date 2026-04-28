"""FastAPI application entrypoint.

职责收敛：仅做日志配置、Windows 兼容、应用实例创建、中间件 & 路由注册。
数据库连接/迁移/初始化逻辑全部迁移到 `startup.py`，便于单元测试与复用。
"""
import asyncio
import codecs
import logging
import sys

import uvicorn
from fastapi import FastAPI, Request, WebSocket
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
_LOGGER_LEVELS = {
    "sqlalchemy.engine": logging.WARNING,
    "sqlalchemy.pool": logging.WARNING,
    "uvicorn.access": logging.WARNING,
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
    subscriptions,
    theaters,
    videos,
)
from startup import lifespan  # noqa: E402


app = FastAPI(title="KunFlix", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Exception handler
# ---------------------------------------------------------------------------
@app.exception_handler(RequestValidationError)
async def _validation_error_handler(request: Request, exc: RequestValidationError):
    logger.error("[422] %s %s => %s", request.method, request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


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
    admin_tools.router,
    music.router,
    admin_dashboard.router,
    admin_virtual_humans.router,
)
for _router in _ROUTERS:
    app.include_router(_router)


@app.get("/")
async def root():
    return {"message": "Welcome to the KunFlix API"}


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
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
