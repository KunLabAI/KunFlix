import os
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

def log(message, prefix="[SYSTEM]"):
    print(f"{prefix} {message}")

def get_python_exec():
    """获取虚拟环境中的 python 解释器路径"""
    if sys.platform == "win32":
        return os.path.join(BACKEND_DIR, "venv", "Scripts", "python.exe")
    return os.path.join(BACKEND_DIR, "venv", "bin", "python")

def setup_backend():
    """检查并安装后端依赖"""
    log("Checking backend environment...", "[BACKEND]")
    
    venv_path = os.path.join(BACKEND_DIR, "venv")
    if not os.path.exists(venv_path):
        log("Creating virtual environment...", "[BACKEND]")
        subprocess.check_call([sys.executable, "-m", "venv", "venv"], cwd=BACKEND_DIR)
    
    python_exec = get_python_exec()
    log("Installing/Updating dependencies...", "[BACKEND]")
    try:
        subprocess.check_call([python_exec, "-m", "pip", "install", "-r", "requirements.txt"], cwd=BACKEND_DIR)
    except subprocess.CalledProcessError:
        log("Failed to install backend dependencies. Please check requirements.txt.", "[BACKEND]")
        sys.exit(1)
        
    return python_exec

def setup_frontend():
    """检查并安装前端依赖"""
    log("Checking frontend environment...", "[FRONTEND]")
    
    # 简单的检查：如果 node_modules 不存在，肯定要装
    # 如果存在，为了确保依赖最新，也可以运行 npm install（通常很快）
    node_modules = os.path.join(FRONTEND_DIR, "node_modules")
    if not os.path.exists(node_modules):
        log("Installing dependencies (first run)...", "[FRONTEND]")
    else:
        log("Updating dependencies...", "[FRONTEND]")

    try:
        # 使用 shell=True 以便在 Windows 上找到 npm
        subprocess.check_call("npm install", shell=True, cwd=FRONTEND_DIR)
    except subprocess.CalledProcessError:
        log("Failed to install frontend dependencies. Please check package.json.", "[FRONTEND]")
        sys.exit(1)

def run_process(command, cwd, prefix):
    """运行一个子进程并实时打印输出"""
    process = None
    try:
        process = subprocess.Popen(
            command,
            cwd=cwd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding='utf-8',
            errors='replace'
        )
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
    if not os.path.exists(os.path.join(ADMIN_DIR, "node_modules")):
        log("Installing admin dashboard dependencies...", "[ADMIN]")
        try:
             subprocess.check_call("npm install", shell=True, cwd=ADMIN_DIR)
        except subprocess.CalledProcessError:
             log("Failed to install admin dependencies.", "[ADMIN]")

    log("Setup complete. Starting servers...")

    # 2. Start Phase (Parallel)
    # Backend Command
    # Use asyncio loop for Windows compatibility with asyncpg
    backend_cmd = f'"{python_exec}" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000 --loop asyncio'
    
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
        while True:
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
