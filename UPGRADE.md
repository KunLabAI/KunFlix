# KunFlix 升级指南

本文档记录跨大版本升级的关键步骤与常见坑点。**当前主线为 AgentScope 1.0 → 2.0 升级**，
首次拉取本仓库或从旧版本拉取最新代码的开发者，请先按下文流程操作。

> 已经在 dev 分支验证通过；本地 / 测试环境 / 生产环境的执行步骤略有差异，按场景跳转。

---

## 一、AgentScope 1.0 → 2.0（M1 最小破坏面升级）

### 1.1 必要前置

| 组件 | 旧版本 | 新版本 | 是否必装 |
|---|---|---|---|
| **Python** | 3.10+ | **3.11+** | 必须 |
| Node.js | 20+ | 20+ | 不变 |
| AgentScope | `1.0.18` | `>=2.0.9` | 由 `requirements.txt` 锁定 |

**不再需要 Rust。** AgentScope 自 2.0.4 起把 [`ripgrep`](https://pypi.org/project/ripgrep/)（内置 [`Grep` 工具](https://docs.agentscope.io/v2/building-blocks/tool.md) 的实现）改为**可选依赖**，2.0.8 起又将其锁定在 `<15.x`。KunFlix 运行时不使用内置 `Grep` 工具，`requirements.txt` 也已移除对 ripgrep 的显式锁定，因此本地 / Docker 安装都不会再触发 cargo 编译，无需安装 Rust 工具链。

---

### 1.2 本地开发者：彻底重建 venv（推荐）

```powershell
# Windows PowerShell
# 1. 安装 Python 3.12（如已有 3.11+ 可跳过）
winget install -e --id Python.Python.3.12

# 2. 删旧 venv，用 3.12 重建
Remove-Item -Recurse -Force "$PWD\backend\venv"
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" -m venv backend\venv

# 3. 安装依赖
$env:PYTHONUTF8="1"; $env:PYTHONIOENCODING="utf-8"
.\backend\venv\Scripts\python.exe -m pip install --upgrade pip
.\backend\venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt

# 4. 验证
.\backend\venv\Scripts\python.exe -c "import agentscope; print(agentscope.__version__)"
# 预期：2.0.x
```

```bash
# macOS / Linux
# 1. 安装 Python 3.12
brew install python@3.12              # macOS
# Linux: 用包管理器 / pyenv install 3.12

# 2. 重建 venv
rm -rf backend/venv
python3.12 -m venv backend/venv

# 3. 安装依赖
backend/venv/bin/pip install --upgrade pip
backend/venv/bin/pip install -r backend/requirements.txt

# 4. 验证
backend/venv/bin/python -c "import agentscope; print(agentscope.__version__)"
```

之后 `python dev.py` 启动开发环境，[dev.py](./dev.py) 会在启动前自动校验 Python 版本，若 venv 仍是 3.10 会主动提示重建。

---

### 1.3 国内开发者：pip 镜像加速（推荐）

`requirements.txt` 默认走 `pypi.tuna.tsinghua.edu.cn`（在 [dev.py](./dev.py) 中通过 `pip config` 已配置）。如果你的环境没配，可手动指定：

```bash
pip install -r backend/requirements.txt -i https://mirrors.aliyun.com/pypi/simple
```

---

### 1.4 生产 / 测试环境（Docker 路径）

[deploy/backend.Dockerfile](./deploy/backend.Dockerfile) 为**单阶段构建**：基于 `python:3.14-slim`，直接 `pip install -r requirements.txt`。由于 ripgrep 已是 agentscope 可选依赖且项目不使用，镜像内**不再包含 Rust 构建阶段**，构建更快、体积更小。

#### 2c4g 测试 / 生产服务器的部署流程

```bash
cd /opt/kunflix/deploy

# 串行构建（避免多镜像并发 build 爆 CPU/内存）
sudo bash scripts/update.sh --serial
```

[deploy/scripts/update.sh](./deploy/scripts/update.sh) 中已有 `--serial` 参数，按 backend → admin → frontend 串行 build，对 2c4g 友好。


---

### 1.5 常见错误自检表

| 报错关键字 | 根因 | 解决 |
|---|---|---|
| `Could not find a version that satisfies agentscope>=2.0.9` | Python < 3.11 | 装 3.11+，删 venv 重建 |
| `Ignored the following versions that require a different python version: ... Requires-Python >=3.11` | 同上（pip 静默过滤） | 同上 |
| Docker 构建期 OOM | 2c4g 并发 build 内存不够 | `update.sh --serial`；提前 `docker compose stop frontend admin` 腾资源 |

---

