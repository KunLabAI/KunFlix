"""数据库连通性探测脚本。

被 ``dev.py`` 在 ``init_database`` 之前调用，用来在真正启动应用前 fail-fast
提示 "DB 不可达"，并给出可复制的 3 条修复命令。

设计取舍：
- 独立文件、独立进程：避免污染 dev.py 的 stdlib-only 依赖假设；
  同时用 backend venv 的 python 执行，天然拿到 asyncpg / aiosqlite。
- 只测 ``engine.connect()``，不做任何写操作，保证幂等且安全。
- 3 秒硬超时：本地环境如果连不上，等太久没意义，快速失败进入引导。
- 退出码：0 = 可达；1 = 不可达；2 = 内部错误（依赖缺失等）。
- 打印到 stderr 让调用方能过滤出诊断行，stdout 只用于成功摘要。
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# 让本脚本无需 `python -m scripts.probe_db` 也能跑：确保 backend/ 在 sys.path 首位
_BACKEND_DIR = Path(__file__).resolve().parent.parent
str(_BACKEND_DIR) not in sys.path and sys.path.insert(0, str(_BACKEND_DIR))


_PROBE_TIMEOUT_SECONDS = 3.0


def _mask_url(url: str) -> str:
    """把 DATABASE_URL 里的密码替换成 ***，安全打印到日志。"""
    # 只处理最常见的 dialect://user:password@host 形式，处理不了也无所谓
    at_idx = url.rfind("@")
    scheme_end = url.find("://")
    if at_idx <= scheme_end + 3:
        return url
    creds = url[scheme_end + 3:at_idx]
    colon = creds.find(":")
    masked_creds = f"{creds[:colon]}:***" if colon >= 0 else creds
    return f"{url[:scheme_end + 3]}{masked_creds}{url[at_idx:]}"


async def _probe() -> int:
    from sqlalchemy.ext.asyncio import create_async_engine

    from config import settings

    url = settings.DATABASE_URL
    print(f"[probe_db] target: {_mask_url(url)}", file=sys.stderr)

    engine = create_async_engine(url, pool_pre_ping=False)
    try:
        # asyncio.wait_for 兜底：某些驱动的默认 connect_timeout 太长
        async with asyncio.timeout(_PROBE_TIMEOUT_SECONDS):
            async with engine.begin():
                pass
        print("[probe_db] ok", file=sys.stderr)
        return 0
    except Exception as exc:  # noqa: BLE001 — 探测阶段任何异常都视为不可达
        print(f"[probe_db] FAIL {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    finally:
        await engine.dispose()


def main() -> int:
    try:
        return asyncio.run(_probe())
    except ModuleNotFoundError as exc:
        # 依赖未装（比如 setup_backend 尚未完成），返回 2 让调用方跳过此步
        print(f"[probe_db] SKIP dependency missing: {exc.name}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
