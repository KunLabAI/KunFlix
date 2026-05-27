import os
import platform
import shutil
import subprocess
import sys
import threading
import time

# 定义项目路径
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
ADMIN_DIR = os.path.join(BACKEND_DIR, "admin")

# 颜色代码（跨平台可能需要 colorama，这里为了简单只做基本处理或不加）
PROCESSES = []

# AgentScope 2.0 要求 Python >= 3.11；ripgrep 从源码编译需 Rust >= 1.85
_MIN_PYTHON = (3, 11)

def log(message, prefix="[SYSTEM]"):
    print(f"{prefix} {message}")


def _check_python_version() -> None:
    """启动前 fail-fast：Python 版本 < 3.11 直接报错退出。

    AgentScope 2.0 在 PyPI 元数据里强制 Requires-Python >= 3.11，
    pip 会静默跳过不兼容版本，最后报 "Could not find a version”。
    提前检测能避免开发者走 5+ 分钟弯路。
    """
    if sys.version_info >= _MIN_PYTHON:
        return
    current = platform.python_version()
    required = ".".join(map(str, _MIN_PYTHON))
    log(
        f"Python {current} 不满足要求；AgentScope 2.0 需 Python >= {required}",
        "[BACKEND]",
    )
    log("Windows  : winget install -e --id Python.Python.3.12", "[BACKEND]")
    log("macOS    : brew install python@3.12", "[BACKEND]")
    log("Linux    : 参考 https://www.python.org/downloads/ 或包管理器", "[BACKEND]")
    log("安装完后请删除 backend/venv 后重新运行本脚本", "[BACKEND]")
    sys.exit(1)


def _check_rust_toolchain() -> None:
    """警告级检测：本地首次 pip install 遇上 ripgrep 编译会需 Rust 工具链。

    不 fail-fast：部分平台（如 Windows + cp312 wheel 已发布）可能不需本地编译，
    仅提示避免 pip 报错后才定位问题。
    """
    cargo = shutil.which("cargo")
    if cargo:
        return
    log("未检测到 cargo；agentscope 2.0 首次安装可能需本地编译 ripgrep。", "[BACKEND]")
    log("若随后 pip install 报错 'feature edition2024 is required'，请安装 Rust：", "[BACKEND]")
    log("  Windows  : winget install -e --id Rustlang.Rustup; rustup default stable", "[BACKEND]")
    log("  macOS/Linux: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh", "[BACKEND]")


def get_python_exec():
    """获取虚拟环境中的 python 解释器路径"""
    if sys.platform == "win32":
        return os.path.join(BACKEND_DIR, "venv", "Scripts", "python.exe")
    return os.path.join(BACKEND_DIR, "venv", "bin", "python")


def _venv_python_version(python_exec: str) -> tuple[int, int] | None:
    """读取现有 venv 里的 python 版本，以 (major, minor) 元组返回；读不到则 None。"""
    if not os.path.exists(python_exec):
        return None
    try:
        out = subprocess.check_output(
            [python_exec, "-c", "import sys; print(sys.version_info[0], sys.version_info[1])"],
            stderr=subprocess.STDOUT,
            text=True,
            timeout=10,
        ).strip().split()
        return int(out[0]), int(out[1])
    except Exception:  # noqa: BLE001 — 检测失败不该阻断主流程
        return None


def setup_backend():
    """检查并安装后端依赖"""
    log("Checking backend environment...", "[BACKEND]")

    _check_python_version()
    _check_rust_toolchain()

    venv_path = os.path.join(BACKEND_DIR, "venv")
    python_exec = get_python_exec()

    # 如果已存在的 venv 是 Python < 3.11（旧 1.0 遗留），提示手动重建
    existing_ver = _venv_python_version(python_exec)
    if existing_ver is not None and existing_ver < _MIN_PYTHON:
        required = ".".join(map(str, _MIN_PYTHON))
        log(
            f"当前 venv 是 Python {existing_ver[0]}.{existing_ver[1]}，不满足 AgentScope 2.0 (>= {required})",
            "[BACKEND]",
        )
        log(
            f"请删除后重建：\n"
            f"  Remove-Item -Recurse -Force \"{venv_path}\"   # PowerShell\n"
            f"  rm -rf \"{venv_path}\"                        # bash\n"
            f"随后使用 Python >= {required} 重新运行本脚本即可",
            "[BACKEND]",
        )
        sys.exit(1)

    if not os.path.exists(venv_path):
        log("Creating virtual environment...", "[BACKEND]")
        subprocess.check_call([sys.executable, "-m", "venv", "venv"], cwd=BACKEND_DIR)

    # 强制 pip 以 UTF-8 读取 requirements.txt，避免 Windows 中文系统默认 GBK 解码失败
    # （requirements.txt 含中文注释，旧版 pip 在非 UTF-8 locale 下会报 UnicodeDecodeError）
    pip_env = os.environ.copy()
    pip_env["PYTHONUTF8"] = "1"
    pip_env["PYTHONIOENCODING"] = "utf-8"

    # 先升级 pip 自身（旧版 pip 23.x 在 Windows 中文环境读取含非 ASCII 的 requirements 会失败）
    log("Upgrading pip...", "[BACKEND]")
    try:
        subprocess.check_call(
            [python_exec, "-m", "pip", "install", "--upgrade", "pip"],
            cwd=BACKEND_DIR,
            env=pip_env,
        )
    except subprocess.CalledProcessError:
        log("Warning: pip upgrade failed, continuing with current version.", "[BACKEND]")

    log("Installing/Updating dependencies...", "[BACKEND]")
    try:
        subprocess.check_call(
            [python_exec, "-m", "pip", "install", "-r", "requirements.txt"],
            cwd=BACKEND_DIR,
            env=pip_env,
        )
    except subprocess.CalledProcessError:
        log("Failed to install backend dependencies. Please check requirements.txt.", "[BACKEND]")
        sys.exit(1)
        
    return python_exec

def init_database(python_exec):
    """初始化数据库（执行迁移和种子数据），幂等操作"""
    log("Initializing database...", "[DATABASE]")
    
    seed_script = os.path.join(BACKEND_DIR, "scripts", "seed_db.py")
    try:
        subprocess.check_call([python_exec, seed_script], cwd=BACKEND_DIR)
        log("Database initialization completed.", "[DATABASE]")
    except subprocess.CalledProcessError as e:
        log(f"Database initialization failed: {e}", "[DATABASE]")
        sys.exit(1)

def _ensure_node_deps(project_dir, tag):
    """幂等安装前端依赖：仅在 node_modules 缺失时跳 npm ci，避免每次启动污染 package-lock.json。

    - node_modules 存在：跳过，直接用现有依赖启动。
    - node_modules 缺失：用 npm ci（严格按 package-lock.json 安装，不修改 lock）；
      如果 lock 与 package.json 不一致导致 npm ci 失败，提示开发者手动处理，
      不自动 fallback 到 npm install（避免污染跨平台 lock，参见 PR #121 教训）。
    """
    node_modules = os.path.join(project_dir, "node_modules")
    if os.path.exists(node_modules):
        log("node_modules already present, skip install (use `npm ci` manually if you pulled lock changes).", tag)
        return

    log("Installing dependencies via `npm ci` (first run)...", tag)
    try:
        subprocess.check_call("npm ci --no-audit --no-fund", shell=True, cwd=project_dir)
    except subprocess.CalledProcessError:
        log(
            "`npm ci` failed. This usually means package.json is out of sync with package-lock.json.\n"
            "       Run `npm install` manually in this directory to update the lock file,\n"
            "       then review the lock diff before committing (preserve cross-platform optional deps).",
            tag,
        )
        sys.exit(1)


def setup_frontend():
    """检查并安装前端依赖"""
    log("Checking frontend environment...", "[FRONTEND]")
    _ensure_node_deps(FRONTEND_DIR, "[FRONTEND]")

def run_process(command, cwd, prefix):
    """运行一个子进程并实时打印输出"""
    process = None
    try:
        # Use shell=True for node commands, but for uvicorn/python it's better to pass it as a list 
        # or use CREATE_NEW_PROCESS_GROUP on windows to avoid signal propagation issues during reload.
        kwargs = {
            "cwd": cwd,
            "shell": True,
            "stdout": subprocess.PIPE,
            "stderr": subprocess.STDOUT,
            "text": True,
            "bufsize": 1,
            "encoding": 'utf-8',
            "errors": 'replace'
        }
        
        process = subprocess.Popen(command, **kwargs)
        PROCESSES.append(process)
        
        # 实时读取输出
        for line in process.stdout:
            print(f"{prefix} {line.strip()}")
            
        process.wait()
    except Exception as e:
        log(f"Error running process: {e}", prefix)
    finally:
        if process and process in PROCESSES:
            PROCESSES.remove(process)

def main():
    log("Starting development environment setup...")

    # 1. Setup Phase (Blocking)
    python_exec = setup_backend()
    setup_frontend()
    
    # Setup Admin Dashboard
    log("Checking admin dashboard environment...", "[ADMIN]")
    _ensure_node_deps(ADMIN_DIR, "[ADMIN]")

    # Initialize database (migrations + seed data), idempotent operation
    init_database(python_exec)

    log("Setup complete. Starting servers...")

    # 2. Start Phase (Parallel)
    # Backend Command
    # Use asyncio loop for Windows compatibility with asyncpg
    # Exclude skills/active_skills from watchfiles to prevent reload loop when toggling skills
    # Must use absolute path: uvicorn FileFilter compares exclude_dir against absolute paths from watchfiles
    active_skills_abs = os.path.join(BACKEND_DIR, "skills", "active_skills")
    backend_cmd = f'"{python_exec}" -m uvicorn main:app --reload --reload-exclude "{active_skills_abs}" --host 127.0.0.1 --port 8000 --loop asyncio'
    
    # Frontend Command
    frontend_cmd = "npm run dev"
    
    # Admin Dashboard Command
    admin_cmd = "npm run dev"

    # 使用线程并发运行
    # 注意：这里的 run_process 是阻塞的，所以需要放在线程里
    t1 = threading.Thread(target=run_process, args=(backend_cmd, BACKEND_DIR, "[BACKEND]"))
    t2 = threading.Thread(target=run_process, args=(frontend_cmd, FRONTEND_DIR, "[FRONTEND]"))
    t3 = threading.Thread(target=run_process, args=(admin_cmd, ADMIN_DIR, "[ADMIN]"))

    t1.daemon = True
    t2.daemon = True
    t3.daemon = True

    t1.start()
    t2.start()
    t3.start()

    try:
        # Give processes a moment to start and be added to the PROCESSES list
        time.sleep(2)
        
        # Keep the main thread alive.
        # Check if all processes have exited instead of just threads.
        # In Windows, Uvicorn reload might cause the thread to finish or the process to restart.
        while True:
            # Re-fetch the length to ensure we don't prematurely exit 
            # if processes are still initializing.
            if len(PROCESSES) > 0:
                active_processes = [p for p in PROCESSES if p.poll() is None]
                if not active_processes:
                    log("All processes exited. Stopping dev environment.", "[SYSTEM]")
                    break
            time.sleep(1)
    except KeyboardInterrupt:
        log("Stopping servers...", "[SYSTEM]")
        for p in list(PROCESSES):
            try:
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    p.terminate()
            except Exception:
                pass
        sys.exit(0)

if __name__ == "__main__":
    main()
