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
| **Rust toolchain** | 不需要 | **stable ≥ 1.85**（含 cargo） | 仅本地首次安装需要（运行时不依赖） |
| Node.js | 20+ | 20+ | 不变 |
| AgentScope | `1.0.18` | `>=2.0.0` | 由 `requirements.txt` 锁定 |

**为什么需要 Rust？** AgentScope 2.0 把 [`Grep` 工具](https://docs.agentscope.io/v2/building-blocks/tool.md) 的实现交给了 PyPI 上的 [`ripgrep`](https://pypi.org/project/ripgrep/) 包；这个包在 Linux / macOS 没有预编译 wheel，必须本地用 cargo 编译。**项目运行时不会用到 Grep 工具**，但 ripgrep 是 agentscope 的硬安装依赖，跳不掉。编译只在首次 `pip install` 时一次性发生，之后 wheel 进入 pip 缓存，重装秒过。

---

### 1.2 本地开发者：彻底重建 venv（推荐）

```powershell
# Windows PowerShell
# 1. 安装 Python 3.12（如已有 3.11+ 可跳过）
winget install -e --id Python.Python.3.12

# 2. 安装 Rust（如已有 stable ≥ 1.85 可跳过）
winget install -e --id Rustlang.Rustup
rustup default stable

# 3. 删旧 venv，用 3.12 重建
Remove-Item -Recurse -Force "$PWD\backend\venv"
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" -m venv backend\venv

# 4. 安装依赖（首次会触发 ripgrep cargo 编译，约 3-8 分钟）
$env:PYTHONUTF8="1"; $env:PYTHONIOENCODING="utf-8"
.\backend\venv\Scripts\python.exe -m pip install --upgrade pip
.\backend\venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt

# 5. 验证
.\backend\venv\Scripts\python.exe -c "import agentscope; print(agentscope.__version__)"
# 预期：2.0.x
```

```bash
# macOS / Linux
# 1. 安装 Python 3.12
brew install python@3.12              # macOS
# Linux: 用包管理器 / pyenv install 3.12

# 2. 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# 3. 重建 venv
rm -rf backend/venv
python3.12 -m venv backend/venv

# 4. 安装依赖
backend/venv/bin/pip install --upgrade pip
backend/venv/bin/pip install -r backend/requirements.txt

# 5. 验证
backend/venv/bin/python -c "import agentscope; print(agentscope.__version__)"
```

之后 `python dev.py` 启动开发环境，[dev.py](./dev.py) 会在启动前自动校验 Python 与 cargo 是否就绪，若 venv 仍是 3.10 会主动提示重建。

---

### 1.3 国内开发者：镜像加速（强烈推荐）

不配镜像，rustup 下载和 cargo 拉 crates.io 索引可能慢到 16 KiB/s。配完后 5–20 MiB/s。

#### rustup 镜像（环境变量，仅当前 shell 生效）

```powershell
$env:RUSTUP_DIST_SERVER = "https://rsproxy.cn"
$env:RUSTUP_UPDATE_ROOT = "https://rsproxy.cn/rustup"
rustup update stable
```

```bash
export RUSTUP_DIST_SERVER="https://rsproxy.cn"
export RUSTUP_UPDATE_ROOT="https://rsproxy.cn/rustup"
rustup update stable
```

#### cargo crates.io 镜像（写入 `~/.cargo/config.toml`，永久生效）

```toml
[source.crates-io]
replace-with = "rsproxy-sparse"

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[net]
git-fetch-with-cli = true
```

PowerShell 一行写好：

```powershell
$cargoDir = "$env:USERPROFILE\.cargo"
New-Item -ItemType Directory -Force -Path $cargoDir | Out-Null
@"
[source.crates-io]
replace-with = "rsproxy-sparse"

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[net]
git-fetch-with-cli = true
"@ | Set-Content "$cargoDir\config.toml" -Encoding UTF8
```

#### pip 镜像

`requirements.txt` 默认走 `pypi.tuna.tsinghua.edu.cn`（在 [dev.py](./dev.py) 中通过 `pip config` 已配置）。如果你的环境没配，可手动指定：

```bash
pip install -r backend/requirements.txt -i https://mirrors.aliyun.com/pypi/simple
```

---

### 1.4 生产 / 测试环境（Docker 路径）

[deploy/backend.Dockerfile](./deploy/backend.Dockerfile) 已经改造为 multi-stage：

| Stage | 作用 | 是否进运行镜像 |
|---|---|---|
| `rust-builder` | 装 Rust + cargo + 编译 ripgrep wheel | 否（仅产出 `/wheels`） |
| `base` | 纯 Python 3.14 + `pip install --no-index --find-links /wheels` | 是（运行镜像） |

**好处**：运行镜像不带 Rust toolchain（节省 ~1GB），且 builder 内置 `rsproxy.cn` 镜像，crate 拉取无需翻墙。

#### 2c4g 测试 / 生产服务器的部署流程

```bash
cd /opt/kunflix/deploy

# 串行构建（避免 cargo 并发编译爆 CPU/内存）
sudo bash scripts/update.sh --serial
```

[deploy/scripts/update.sh](./deploy/scripts/update.sh) 中已有 `--serial` 参数，按 backend → admin → frontend 串行 build，对 2c4g 友好。**首次构建仍会触发 cargo 编译 ripgrep（~5-8 分钟），后续构建命中 BuildKit 缓存秒过。**


---

### 1.5 常见错误自检表

| 报错关键字 | 根因 | 解决 |
|---|---|---|
| `Could not find a version that satisfies agentscope>=2.0.0` | Python < 3.11 | 装 3.11+，删 venv 重建 |
| `Ignored the following versions that require a different python version: 2.0.0 Requires-Python >=3.11` | 同上（pip 静默过滤） | 同上 |
| `feature edition2024 is required` / `not stabilized in this version of Cargo (1.80.x)` | Rust < 1.85 | `rustup update stable` |
| `rustup could not choose a version of cargo to run` | rustup 装了但没设默认 toolchain | `rustup default stable` |
| `Preparing metadata (pyproject.toml) ...` 长时间卡住 | cargo 拉 crates.io 慢 | 配 cargo `rsproxy.cn` 镜像，重新 `pip install` |
| `error: could not create link from rustup.exe to cargo-miri.exe (os error 183)` | rustup self-update 旧 shim 残留（不影响 toolchain 升级） | 忽略；toolchain 已升级 |
| Docker 构建期 OOM | 2c4g 并发跑 cargo 内存不够 | `update.sh --serial`；提前 `docker compose stop frontend admin` 腾资源 |

---

