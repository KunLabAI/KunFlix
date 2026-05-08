# KunFlix 生产部署（Docker Compose）

面向 2C4G Ubuntu 服务器的一键部署方案。

## 目录结构
```
deploy/
├── docker-compose.yml           # 6 服务编排：nginx / frontend / admin / backend / postgres / redis / certbot
├── .env.prod.example            # 生产环境变量样例（复制为 .env.prod）
├── backend.Dockerfile           # FastAPI + uvicorn（python:3.11-slim，非 root）
├── frontend.Dockerfile          # Next.js standalone（主站，3666）
├── admin.Dockerfile             # Next.js standalone（Admin，3888，basePath=/admin）
├── nginx/
│   ├── nginx.conf               # 主配置（gzip / 日志 / SSL 基础）
│   └── templates/
│       └── kunflix.conf.template  # envsubst 渲染后自动加载
├── postgres/init.sql            # 首启时执行（字符集/扩展兜底）
├── redis/redis.conf             # AOF + maxmemory 256MB
└── scripts/
    ├── init-letsencrypt.sh      # 一键首签脚本（certbot standalone）
    └── backup-db.sh             # pg_dump 定时备份（可选）
```

## 架构
```
Internet ─► nginx:443 ┬─ /            ─► frontend:3666
                     ├─ /api/*        ─► backend:8000 (WebSocket / SSE)
                     ├─ /admin/*      ─► admin:3888
                     └─ /media/*      ─► 本地卷直出（跳过后端）
backend ──► postgres:5432（主库）
backend ──► redis:6379 db0（缓存/PubSub/SSE）+ db1（arq 队列）
certbot ──► 每 12h 自动续期（webroot 模式）
```

## 首次部署（服务器端）
```bash
# 0) 安装 Docker 与防火墙
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin ufw
sudo systemctl enable --now docker
sudo ufw allow 22,80,443/tcp && sudo ufw --force enable

# 1) 拉代码 + 填环境变量
git clone <your-repo-url> /opt/kunflix
cd /opt/kunflix/deploy
cp .env.prod.example .env.prod
vi .env.prod   # 填写 DOMAIN / CERTBOT_EMAIL / POSTGRES_PASSWORD / JWT_SECRET_KEY /
               #      ENCRYPTION_KEY / OPENAI_API_KEY

# 2) 生成加密密钥（示例）
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
openssl rand -hex 32

# 3) DNS 已指向本机后，一键签发证书 + 启动全栈
bash scripts/init-letsencrypt.sh

# 4) 访问验证
curl -I https://<DOMAIN>/
curl    https://<DOMAIN>/api/
curl -I https://<DOMAIN>/admin/
```

## 日常运维
```bash
# 查看状态 / 日志
docker compose --env-file .env.prod ps
docker compose --env-file .env.prod logs -f backend

# 更新代码后重建镜像
git pull
docker compose --env-file .env.prod up -d --build

# 手动触发 Alembic 迁移（compose 已在容器启动时自动执行）
docker compose --env-file .env.prod exec backend python -m alembic upgrade head

# 初始化种子数据
docker compose --env-file .env.prod exec backend python scripts/seed_db.py

# 数据库备份 / 续期检查
bash scripts/backup-db.sh
docker compose --env-file .env.prod exec certbot certbot certificates
```

## 资源建议（2C4G 兜底）
- `uvicorn --workers 1`（单进程，Redis 多实例同步由 arq 承担）
- Postgres `shared_buffers` 默认 128MB 即可；连接池 `DB_POOL_SIZE=20`
- Redis `maxmemory 256mb allkeys-lru`
- Next.js `output: 'standalone'`，镜像 < 200MB，单实例常驻 ~150MB

## 关键点
- **CORS**：生产走同源 Nginx，前端/Admin 通过 `/api` 相对路径访问，无跨域。
- **SSE/WebSocket**：Nginx `proxy_buffering off` + `$connection_upgrade` 映射已配置。
- **媒体文件**：`mediadata` 卷同时挂给 backend（读写）和 nginx（只读直出），节省后端带宽。
- **证书续期**：`certbot` 容器 12h 轮询 `renew`，webroot 模式不中断服务。
- **迁移**：`RUN_MIGRATIONS=true` 让 backend 首启时自动 `alembic upgrade head`。
