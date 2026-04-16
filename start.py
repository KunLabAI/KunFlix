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

PROCESSES = []

def print_banner():
    """打印 KunFlix 生产环境启动 Banner"""
    banner = r"""
    __  __  __  __  _   __  ______  __      ____  _  __
   / / / / / / / / / | / / / ____/ / /     /  _/ | |/ /
  / /_/ / / / / / /  |/ / / /_    / /      / /   |   / 
 / __  / / /_/ / / /|  / / __/   / /___  _/ /   /   |  
/_/ /_/  \____/ /_/ |_/ /_/     /_____/ /___/  /_/|_|  

[Production Mode]
"""
    print(banner)

def log(message, prefix="[SYSTEM]"):
    print(f"{prefix} {message}")

def get_python_exec():
    """获取虚拟环境中的 python 解释器路径"""
    if sys.platform == "win32":
        return os.path.join(BACKEND_DIR, "venv", "Scripts", "python.exe")
    return os.path.join(BACKEND_DIR, "venv", "bin", "python")

def check_backend_env():
    """检查后端环境是否就绪"""
    log("Checking backend environment...", "[BACKEND]")
    
    venv_path = os.path.join(BACKEND_DIR, "venv")
    if not os.path.exists(venv_path):
        log("Virtual environment not found! Please run 'python dev.py' first to set up the environment.", "[BACKEND]")
        sys.exit(1)
    
    python_exec = get_python_exec()
    if not os.path.exists(python_exec):
        log("Python executable not found in virtual environment!", "[BACKEND]")
        sys.exit(1)
    
    # 检查关键依赖
    try:
        subprocess.check_call(
            [python_exec, "-c", "import uvicorn; import fastapi"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
    except subprocess.CalledProcessError:
        log("Required dependencies not installed. Please run 'python dev.py' first.", "[BACKEND]")
        sys.exit(1)
    
    log("Backend environment ready.", "[BACKEND]")
    return python_exec

def check_and_build_frontend():
    """检查并构建前端"""
    log("Checking frontend build...", "[FRONTEND]")
    
    node_modules = os.path.join(FRONTEND_DIR, "node_modules")
    build_id_file = os.path.join(FRONTEND_DIR, ".next", "BUILD_ID")
    
    if not os.path.exists(node_modules):
        log("node_modules not found! Installing dependencies...", "[FRONTEND]")
        try:
            subprocess.check_call("npm install", shell=True, cwd=FRONTEND_DIR)
        except subprocess.CalledProcessError:
            log("Failed to install frontend dependencies.", "[FRONTEND]")
            sys.exit(1)
    
    # 检查 BUILD_ID 文件是否存在，验证构建是否完整
    if not os.path.exists(build_id_file):
        log("Production build not found or incomplete! Building frontend...", "[FRONTEND]")
        try:
            subprocess.check_call("npm run build", shell=True, cwd=FRONTEND_DIR)
        except subprocess.CalledProcessError:
            log("Failed to build frontend.", "[FRONTEND]")
            sys.exit(1)
    else:
        log("Frontend build found.", "[FRONTEND]")

def check_and_build_admin():
    """检查并构建 Admin Dashboard"""
    log("Checking admin dashboard build...", "[ADMIN]")
    
    node_modules = os.path.join(ADMIN_DIR, "node_modules")
    build_id_file = os.path.join(ADMIN_DIR, ".next", "BUILD_ID")
    
    if not os.path.exists(node_modules):
        log("node_modules not found! Installing dependencies...", "[ADMIN]")
        try:
            subprocess.check_call("npm install", shell=True, cwd=ADMIN_DIR)
        except subprocess.CalledProcessError:
            log("Failed to install admin dependencies.", "[ADMIN]")
            sys.exit(1)
    
    # 检查 BUILD_ID 文件是否存在，验证构建是否完整
    if not os.path.exists(build_id_file):
        log("Production build not found or incomplete! Building admin dashboard...", "[ADMIN]")
        try:
            subprocess.check_call("npm run build", shell=True, cwd=ADMIN_DIR)
        except subprocess.CalledProcessError:
            log("Failed to build admin dashboard.", "[ADMIN]")
            sys.exit(1)
    else:
        log("Admin dashboard build found.", "[ADMIN]")

def run_process(command, cwd, prefix):
    """运行一个子进程并实时打印输出"""
    process = None
    try:
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
    print_banner()
    log("Starting production environment...")
    
    # 1. 环境检查阶段
    python_exec = check_backend_env()
    check_and_build_frontend()
    check_and_build_admin()
    
    log("All checks passed. Starting production servers...")
    
    # 2. 启动生产服务
    # 后端：使用 uvicorn 生产模式（无 --reload）
    # 可通过环境变量配置 workers 数量，默认 1
    workers = os.environ.get("KUNFLIX_WORKERS", "1")
    backend_cmd = f'"{python_exec}" -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers {workers}'
    
    # 前端：使用 next start 生产模式
    frontend_cmd = "npm run start"
    
    # Admin Dashboard：使用 next start 生产模式
    admin_cmd = "npm run start"
    
    # 使用线程并发运行
    t1 = threading.Thread(target=run_process, args=(backend_cmd, BACKEND_DIR, "[BACKEND]"))
    t2 = threading.Thread(target=run_process, args=(frontend_cmd, FRONTEND_DIR, "[FRONTEND]"))
    t3 = threading.Thread(target=run_process, args=(admin_cmd, ADMIN_DIR, "[ADMIN]"))
    
    t1.daemon = True
    t2.daemon = True
    t3.daemon = True
    
    t1.start()
    t2.start()
    t3.start()
    
    log("Production servers started:")
    log("  - Backend API: http://localhost:8000")
    log("  - Frontend: http://localhost:3666")
    log("  - Admin Dashboard: http://localhost:3888")
    
    try:
        # 等待进程启动
        time.sleep(2)
        
        # 保持主线程运行
        while True:
            if len(PROCESSES) > 0:
                active_processes = [p for p in PROCESSES if p.poll() is None]
                if not active_processes:
                    log("All processes exited. Stopping production environment.", "[SYSTEM]")
                    break
            time.sleep(1)
    except KeyboardInterrupt:
        log("Stopping production servers...", "[SYSTEM]")
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
