# KunFlix Docker 生产部署指南

> 面向 2C4G+ Ubuntu/Debian 服务器的完整 Docker Compose 一键部署方案。

简体中文 | [English](./DEPLOY_EN.md)

---

## 架构概览

```
Internet ─► nginx:443 ┬─ /            ─► frontend:3666  (Next.js 主站)
                      ├─ /api/*        ─► backend:8000   (FastAPI + WebSocket/SSE)
                      ├─ /admin*       ─► admin:3888     (Next.js Admin, basePath=/admin)
                      └─ /media/*      ─► 本地卷直出     (跳过后端, 节省资源)

backend ──► postgres:5432  (主库, PostgreSQL 18)
backend ──► redis:6379     (db0=缓存/PubSub/限流, db1=arq队列)
certbot ──► 每12h自动续期  (webroot 模式, 不中断服务)
```

---

## 环境要求

| 项目 | 最低要求 |
|------|---------|
| 操作系统 | Ubuntu 22.04+ / Debian 12+ |
| CPU | 2 核 |
| 内存 | 4 GB |
| 磁盘 | 40 GB SSD |
| Docker | 24.0+（含 Compose V2） |
| 域名 | 已解析到服务器 IP |

---

## 本地 Docker 部署（跨平台）

> 适用于在个人电脑跳过域名 / Let's Encrypt 的全流程打通。支持 Windows（Git Bash / WSL）、macOS、Linux。

### 1. 安装 Docker Desktop

[下载 Docker Desktop](https://www.docker.com/products/docker-desktop/) 安装后启动，确保 `docker --version` 与 `docker compose version` 都能返回版本。

### 2. 拉取代码

```bash
git clone https://github.com/KunLabAI/KunFlix
cd deploy
```

### 3. 一键初始化

```bash
# Windows 用户请使用 Git Bash 或 WSL 执行
bash scripts/init-local.sh
```

该脚本一次性完成：

1. 检查 Docker / Compose
2. 生成 `.env.prod`（`DOMAIN=localhost` + 随机生成 POSTGRES_PASSWORD / REDIS_PASSWORD / JWT_SECRET_KEY / ENCRYPTION_KEY）
3. 生成 `docker-compose.override.yml`（本地端口直通 3666/3888/8000/5432/6379）
4. `docker compose up -d --build` 拉起 **postgres / redis / backend / worker / frontend / admin** 六个服务（跳过 nginx + certbot，本地无 TLS 证书）
5. 等待 backend healthy → seed 数据库（LLM Provider / Admin / Email Templates / Prompt Templates，幂等）

脚本完全幂等，重跑不会破坏已有数据。可选参数：

```bash
# 自定义默认管理员凭证
bash scripts/init-local.sh --admin-email me@test.dev --admin-password 'My$tr0ng!Pass'

# 仅重启不重建镜像（代码未改时更快）
bash scripts/init-local.sh --no-build

# 跳过数据库灌种
bash scripts/init-local.sh --skip-seed
```

启动后访问：

| 入口 | 地址 | 默认凭证 |
|------|------|---------|
| 前台主站 | http://localhost:3666/ | 自行注册 |
| 管理后台 | http://localhost:3888/admin | `admin@example.com` / `Admin@12345` |
| 后端 API 文档 | http://localhost:8000/docs | — |

> ⚠️ 默认 admin 凭证仅限本地开发。上线生产务必通过 `--admin-password` 参数传入高强度密码，或在后台 UI 中手动修改。

停止与清理：

```bash
# 仅停服务（保留数据卷）
docker compose --env-file .env.prod down

# 连数据一起炸（重新初始化用）
docker compose --env-file .env.prod down -v
```

---

## 云服务器生产部署

### 1. 安装 Docker & 防火墙

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin ufw
sudo systemctl enable --now docker
sudo ufw allow 22,80,443/tcp && sudo ufw --force enable
```

### 2. 拉取代码 & 配置环境变量

```bash
git clone https://github.com/KunLabAI/KunFlix
cd /opt/kunflix/deploy
cp .env.prod.example .env.prod
```

编辑 `.env.prod`，必须修改以下字段：

```bash
vi .env.prod
```

| 变量 | 说明 | 生成方式 |
|------|------|---------|
| `DOMAIN` | 你的域名（如 `kunflix.example.com`） | — |
| `CERTBOT_EMAIL` | Let's Encrypt 通知邮箱 | — |
| `POSTGRES_PASSWORD` | 数据库密码（高强度随机） | `openssl rand -base64 24` |
| `JWT_SECRET_KEY` | JWT 签名密钥 | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | 数据加密密钥 | `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |

### 3. 签发 HTTPS 证书 & 启动

```bash
# 确保 DNS 已指向服务器，然后一键签发 + 启动
bash scripts/init-letsencrypt.sh
```

该脚本会自动完成：证书签发 → 启动全部容器 → 健康检查。

### 4. 初始化数据

```bash
# 灌入默认 LLM Provider 配置 & Prompt Templates
docker compose --env-file .env.prod exec backend python -c "
import asyncio, sys
sys.path.insert(0, '/app/scripts')
from scripts.seed_db import seed
asyncio.run(seed())
"

# 创建管理员账号（邮箱必须是合法格式，不能用 .local 域名）
docker compose --env-file .env.prod exec backend python -c "
import asyncio
from database import AsyncSessionLocal
from models import Admin
from auth import hash_password
async def main():
    async with AsyncSessionLocal() as db:
        a = Admin(email='your-email@example.com', nickname='Admin', password_hash=hash_password('YourStrongPassword!'), is_active=True, permission_level='super_admin')
        db.add(a)
        await db.commit()
        print('Admin created successfully')
asyncio.run(main())
"
```

### 5. 验证

```bash
curl -I https://<DOMAIN>/           # 前端主站 → 200
curl https://<DOMAIN>/api/auth/me   # API → 401 (未认证, 正常)
curl -I https://<DOMAIN>/admin      # 管理后台 → 307 → /admin/admin
```

浏览器访问：
- `https://<DOMAIN>/` — 前端主站（注册/登录/使用）
- `https://<DOMAIN>/admin` — 管理后台（配置 LLM Provider API Key 等）

---

## 目录结构

```
deploy/
├── docker-compose.yml              # 7 服务编排
├── .env.prod.example               # 环境变量样例（复制为 .env.prod）
├── backend.Dockerfile              # FastAPI + uvicorn (python:3.12-slim)
├── frontend.Dockerfile             # Next.js standalone (主站, port 3666)
├── admin.Dockerfile                # Next.js standalone (Admin, port 3888, basePath=/admin)
├── nginx/
│   ├── nginx.conf                  # 主配置（gzip / SSL / WebSocket 升级映射）
│   └── templates/
│       └── kunflix.conf.template   # envsubst 渲染（$DOMAIN 自动替换）
├── postgres/
│   └── init.sql                    # 首启时执行（字符集/扩展兜底）
├── redis/
│   └── redis.conf                  # AOF + maxmemory 256MB + protected-mode off
└── scripts/
    ├── init-letsencrypt.sh         # 云服务器一键首签脚本（certbot standalone）
    ├── init-local.sh               # 本地 Docker 一键初始化（跨平台 bash）
    └── backup-db.sh                # pg_dump 定时备份
```

---

## 本地 LLM 接入（Ollama，可选）

KunFlix 后端原生支持 Ollama，部署形态推荐「宿主机直跑 Ollama + Backend 容器通过 `host.docker.internal` 回连」。

### 1. 宿主机启动 Ollama 并对外监听

Ollama 默认仅监听 `127.0.0.1:11434`，容器无法访问，需改为 `0.0.0.0`：

```bash
# 一次性启动（前台）
OLLAMA_HOST=0.0.0.0:11434 ollama serve

# systemd 持久化（推荐生产）
sudo systemctl edit ollama.service
# 在 [Service] 段加入：
#   Environment="OLLAMA_HOST=0.0.0.0:11434"
sudo systemctl restart ollama

# 拉取至少一个模型
ollama pull llama3.1
```

### 2. Backend 容器联通性确认

`deploy/docker-compose.yml` 的 backend 服务已配置 `extra_hosts: host.docker.internal:host-gateway`，无需额外改动：

```bash
docker compose --env-file .env.prod exec backend \
  curl -s http://host.docker.internal:11434/api/tags
# 预期返回 JSON 模型列表
```

若宿主机有防火墙（如 ufw），需放行 11434 端口对 docker bridge 网段的入站访问。

### 3. 后台注册 Ollama 供应商

登录 admin 后台 `https://${DOMAIN}/admin/llm`：

- **品牌**：选择 `Ollama (Local)`
- **Base URL**：`http://host.docker.internal:11434`
- **API Key**：留空（前端校验已对 Ollama 放宽）
- **Models**：填入已 `ollama pull` 的模型名，如 `llama3.1`
- 点击「测试连接」，应回显推理结果

> 全新部署时 `seed_db.py` 已自动预创建 Ollama 默认条目，仅需补全 models 即可。

---

## 日常运维

```bash
cd /opt/kunflix/deploy

# 一键更新（推荐）：内置校验 / 自动备份 / 健康检查
#   常用参数：--dry-run / --no-pull / --no-backup
sudo bash scripts/update.sh


# 查看服务状态
docker compose --env-file .env.prod ps

# 实时日志
docker compose --env-file .env.prod logs -f backend

# 更新代码后重建并部署
git pull
docker compose --env-file .env.prod up -d --build

# 只重建特定服务（如仅修改了后端代码）
docker compose --env-file .env.prod up -d --build backend

# 只重建 nginx（修改了配置模板，无需 --build）
docker compose --env-file .env.prod up -d --force-recreate nginx

# 数据库备份
bash scripts/backup-db.sh

# 镜像冗余清理
docker system prune -a -f

# 证书状态查看
docker compose --env-file .env.prod exec certbot certbot certificates
```

---

## 数据库管理

### 全新部署（推荐）

项目采用 **Fast Bootstrap** 策略：检测到空数据库时，直接用 SQLAlchemy `create_all()` 建立终态 schema，然后 `alembic stamp head` 标记版本。跳过整条历史迁移链，避免跨方言兼容问题。

### 重置数据库

```bash
docker compose --env-file .env.prod down
docker volume rm kunflix_pgdata
docker compose --env-file .env.prod up -d
# 重新执行 seed 和创建 admin（见上方"初始化数据"）
```

---

## 常见问题 & 排查

### 1. 注册/登录时 500 错误

**原因**：Rate Limiter 连接 Redis 失败。

**排查**：
```bash
docker compose --env-file .env.prod exec redis redis-cli ping   # 应返回 PONG
docker compose --env-file .env.prod logs backend --tail=30      # 看具体错误
```

**解决**：确保 `deploy/redis/redis.conf` 中 `protected-mode no`（Docker 内网无需密码保护）。

### 2. Admin 后台打不开（404 / chrome-error）

**原因**：Nginx 未匹配无尾斜杠的 `/admin` 路径。

**解决**：确保 nginx 模板中 location 为 `location /admin`（不带尾斜杠），覆盖 `/admin`、`/admin/`、`/admin/xxx` 所有情况。

### 3. Admin 登录后 401 / 被踢回登录页

**排查**：
- 确认 Redis 连接正常（rate limiter 依赖 Redis）
- 确认 `.env.prod` 中 `JWT_SECRET_KEY` 不为空
- 清除浏览器 localStorage 后重新登录

### 4. API 返回 `function date(...) does not exist`

**原因**：代码中使用了 SQLite 专用函数（如 `date('now', '-30 days')`），PostgreSQL 不兼容。

**解决**：使用 SQLAlchemy 跨方言写法：`cast(column, Date)` + `func.current_date() - text("INTERVAL 'N days'")`。已在最新代码中修复。

### 5. Alembic 迁移失败

**原因**：历史迁移脚本为 SQLite 编写，含 `PRAGMA`、`sqlite_master` 等不兼容语法。

**解决**：项目已启用 Fast Bootstrap（空库直建终态 schema + stamp head），无需逐条运行迁移。如遇问题：
```bash
# 清空数据库重来
docker volume rm kunflix_pgdata
docker compose --env-file .env.prod up -d
```

### 6. 邮箱验证失败（422 Unprocessable Entity）

**原因**：Pydantic `EmailStr` 拒绝 `.local` 等非公共 TLD 域名。

**解决**：使用合法邮箱格式（如 `admin@yourcompany.com`）。

---

## 国内服务器特别说明

如果服务器在中国大陆（如阿里云、火山引擎），构建时需配置国内镜像源：

```bash
# Dockerfile 中已预设 npmmirror 和清华 PyPI 源
# 如需覆盖，构建时传入参数：
docker compose --env-file .env.prod build \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
```

---

## 安全建议

1. **永远不要**将 `.env.prod` 提交到 Git 仓库
2. `POSTGRES_PASSWORD` 和 `JWT_SECRET_KEY` 使用随机生成的高强度密码
3. 定期运行 `bash scripts/backup-db.sh` 备份数据
4. Redis 端口（6379）和 PostgreSQL 端口（5432）仅在 Docker 内网暴露，不映射到宿主机
5. Nginx 已配置 HSTS、X-Content-Type-Options、X-Frame-Options 等安全响应头

---

## 资源配置参考（2C4G）

| 服务 | 内存占用 | 备注 |
|------|---------|------|
| PostgreSQL | ~200MB | shared_buffers 128MB |
| Redis | ~50MB | maxmemory 256MB（LRU 淘汰） |
| Backend (uvicorn) | ~300MB | 单 worker |
| Frontend (Next.js) | ~150MB | standalone 模式 |
| Admin (Next.js) | ~120MB | standalone 模式 |
| Nginx | ~10MB | — |

总计约 830MB，4GB 内存绰绰有余。
