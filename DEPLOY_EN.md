# KunFlix Docker Production Deployment Guide

> A complete one-command Docker Compose deployment plan targeting 2C4G+ Ubuntu/Debian servers.

[简体中文](./DEPLOY.md) | English

---

## Architecture Overview

```
Internet ─► nginx:443 ┬─ /            ─► frontend:3666  (Next.js main site)
                      ├─ /api/*        ─► backend:8000   (FastAPI + WebSocket/SSE)
                      ├─ /admin*       ─► admin:3888     (Next.js Admin, basePath=/admin)
                      └─ /media/*      ─► local volume   (skips backend, saves resources)

backend ──► postgres:5432  (primary DB, PostgreSQL 18)
backend ──► redis:6379     (db0=cache/PubSub/rate-limit, db1=arq queue)
certbot ──► auto-renew every 12h  (webroot mode, no service interruption)
```

---

## Requirements

| Item | Minimum |
|------|---------|
| OS | Ubuntu 22.04+ / Debian 12+ |
| CPU | 2 cores |
| Memory | 4 GB |
| Disk | 40 GB SSD |
| Docker | 24.0+ (with Compose V2) |
| Domain | Resolved to your server IP |

---

## Local Docker Deployment (Cross-Platform)

> Suitable for end-to-end validation on a personal computer without a domain or Let's Encrypt. Supports Windows (Git Bash / WSL), macOS, and Linux.

### 1. Install Docker Desktop

[Download Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it. Confirm that both `docker --version` and `docker compose version` return a version string.

### 2. Pull the Code

```bash
git clone https://github.com/KunLabAI/KunFlix
cd deploy
```

### 3. One-Command Initialization

```bash
# Windows users please run this inside Git Bash or WSL
bash scripts/init-local.sh
```

The script handles everything in one shot:

1. Verifies Docker / Compose
2. Generates `.env.prod` (`DOMAIN=localhost` + randomly generated POSTGRES_PASSWORD / REDIS_PASSWORD / JWT_SECRET_KEY / ENCRYPTION_KEY)
3. Generates `docker-compose.override.yml` (exposes 3666/3888/8000/5432/6379 directly to the host)
4. Runs `docker compose up -d --build` to launch six services: **postgres / redis / backend / worker / frontend / admin** (skipping nginx + certbot since there is no TLS cert locally)
5. Waits for backend `healthy` → seeds the database (LLM Provider / Admin / Email Templates / Prompt Templates, idempotent)

The script is fully idempotent — re-running it never destroys existing data. Optional flags:

```bash
# Customize the default admin credentials
bash scripts/init-local.sh --admin-email me@test.dev --admin-password 'My$tr0ng!Pass'

# Restart only, skip image rebuild (faster when code is unchanged)
bash scripts/init-local.sh --no-build

# Skip database seeding
bash scripts/init-local.sh --skip-seed
```

After startup, open:

| Entry | URL | Default Credentials |
|------|------|---------------------|
| Main site | http://localhost:3666/ | Self-register |
| Admin Dashboard | http://localhost:3888/admin | `admin@example.com` / `Admin@12345` |
| Backend API Docs | http://localhost:8000/docs | — |

> ⚠️ The default admin credentials are for local development only. For production, always pass a strong password via `--admin-password`, or change it manually in the dashboard UI.

Stop and clean up:

```bash
# Stop services only (preserve volumes)
docker compose --env-file .env.prod down

# Wipe everything including data (use when re-initializing)
docker compose --env-file .env.prod down -v
```

---

## Cloud Server Production Deployment

### 1. Install Docker & Firewall

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin ufw
sudo systemctl enable --now docker
sudo ufw allow 22,80,443/tcp && sudo ufw --force enable
```

### 2. Pull the Code & Configure Environment Variables

```bash
git clone https://github.com/KunLabAI/KunFlix
cd /opt/kunflix/deploy
cp .env.prod.example .env.prod
```

Edit `.env.prod` and set the following required fields:

```bash
vi .env.prod
```

| Variable | Description | How to Generate |
|------|------|-----------------|
| `DOMAIN` | Your domain (e.g. `kunflix.example.com`) | — |
| `CERTBOT_EMAIL` | Let's Encrypt notification email | — |
| `POSTGRES_PASSWORD` | Database password (high-entropy random) | `openssl rand -base64 24` |
| `JWT_SECRET_KEY` | JWT signing key | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | Data encryption key | `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |

### 3. Issue HTTPS Certificate & Launch

```bash
# Make sure DNS already points to the server, then issue + start in one command
bash scripts/init-letsencrypt.sh
```

The script automates: certificate issuance → start all containers → health check.

### 4. Initialize Data

```bash
# Seed default LLM Provider configs & Prompt Templates
docker compose --env-file .env.prod exec backend python -c "
import asyncio, sys
sys.path.insert(0, '/app/scripts')
from scripts.seed_db import seed
asyncio.run(seed())
"

# Create the admin account (email must be a valid format; .local domains are rejected)
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

### 5. Verify

```bash
curl -I https://<DOMAIN>/           # Frontend main site → 200
curl https://<DOMAIN>/api/auth/me   # API → 401 (unauthenticated, expected)
curl -I https://<DOMAIN>/admin      # Admin → 307 → /admin/admin
```

Open in a browser:
- `https://<DOMAIN>/` — Frontend main site (sign up / log in / use)
- `https://<DOMAIN>/admin` — Admin dashboard (configure LLM Provider API Keys, etc.)

---

## Directory Layout

```
deploy/
├── docker-compose.yml              # 7-service orchestration
├── .env.prod.example               # Env var sample (copy to .env.prod)
├── backend.Dockerfile              # FastAPI + uvicorn (python:3.12-slim)
├── frontend.Dockerfile             # Next.js standalone (main site, port 3666)
├── admin.Dockerfile                # Next.js standalone (Admin, port 3888, basePath=/admin)
├── nginx/
│   ├── nginx.conf                  # Main config (gzip / SSL / WebSocket upgrade map)
│   └── templates/
│       └── kunflix.conf.template   # envsubst rendered ($DOMAIN auto-replaced)
├── postgres/
│   └── init.sql                    # Runs on first start (charset / extension fallback)
├── redis/
│   └── redis.conf                  # AOF + maxmemory 256MB + protected-mode off
└── scripts/
    ├── init-letsencrypt.sh         # Cloud server first-issue script (certbot standalone)
    ├── init-local.sh               # Local Docker one-command init (cross-platform bash)
    └── backup-db.sh                # pg_dump scheduled backup
```

---

## Local LLM Integration (Ollama, Optional)

KunFlix backend natively supports Ollama. The recommended topology is "Ollama runs on the host + Backend container connects back via `host.docker.internal`".

### 1. Start Ollama on the Host with External Listening

Ollama listens on `127.0.0.1:11434` by default, which containers cannot reach. Change it to `0.0.0.0`:

```bash
# One-off start (foreground)
OLLAMA_HOST=0.0.0.0:11434 ollama serve

# Persistent via systemd (recommended for production)
sudo systemctl edit ollama.service
# Add under [Service]:
#   Environment="OLLAMA_HOST=0.0.0.0:11434"
sudo systemctl restart ollama

# Pull at least one model
ollama pull llama3.1
```

### 2. Verify Backend Container Connectivity

`deploy/docker-compose.yml` already configures `extra_hosts: host.docker.internal:host-gateway` for the backend service—no extra changes needed:

```bash
docker compose --env-file .env.prod exec backend \
  curl -s http://host.docker.internal:11434/api/tags
# Should return a JSON model list
```

If the host has a firewall (e.g. ufw), allow port 11434 inbound from the docker bridge subnet.

### 3. Register Ollama Provider in Admin Panel

Log in to the admin dashboard at `https://${DOMAIN}/admin/llm`:

- **Brand**: Select `Ollama (Local)`
- **Base URL**: `http://host.docker.internal:11434`
- **API Key**: Leave empty (frontend validation is relaxed for Ollama)
- **Models**: Click "Sync local models" to auto-fill, or manually enter model names like `llama3.1`
- Click "Test Connection"—should return an inference result

> On fresh deployments `seed_db.py` auto-creates a default Ollama entry; just sync the model list.

---

## Daily Operations

```bash
cd /opt/kunflix/deploy

# One-command update (recommended): built-in validation / auto backup / health check
#   Common flags: --dry-run / --no-pull / --no-backup
sudo bash scripts/update.sh


# Check service status
docker compose --env-file .env.prod ps

# Tail logs
docker compose --env-file .env.prod logs -f backend

# Rebuild and redeploy after pulling new code
git pull
docker compose --env-file .env.prod up -d --build

# Rebuild a single service (e.g. backend code only changed)
docker compose --env-file .env.prod up -d --build backend

# Recreate nginx only (config template changed, no --build needed)
docker compose --env-file .env.prod up -d --force-recreate nginx

# Database backup
bash scripts/backup-db.sh

# Image cleanup
docker system prune -a -f

# Inspect certificate status
docker compose --env-file .env.prod exec certbot certbot certificates
```

---

## Database Management

### Fresh Deployment (Recommended)

The project uses a **Fast Bootstrap** strategy: when an empty database is detected, SQLAlchemy `create_all()` directly builds the final schema, then `alembic stamp head` marks the version. The full historical migration chain is skipped, avoiding cross-dialect compatibility issues.

### Reset the Database

```bash
docker compose --env-file .env.prod down
docker volume rm kunflix_pgdata
docker compose --env-file .env.prod up -d
# Re-run seed and admin creation (see "Initialize Data" above)
```

---

## Troubleshooting & FAQ

### 1. 500 error on signup / login

**Cause**: Rate Limiter failed to connect to Redis.

**Diagnosis**:
```bash
docker compose --env-file .env.prod exec redis redis-cli ping   # should return PONG
docker compose --env-file .env.prod logs backend --tail=30      # check the actual error
```

**Fix**: Make sure `deploy/redis/redis.conf` has `protected-mode no` (no password protection needed inside the Docker network).

### 2. Admin dashboard does not open (404 / chrome-error)

**Cause**: Nginx is not matching the trailing-slash-less `/admin` path.

**Fix**: Make sure the nginx template uses `location /admin` (no trailing slash) so that `/admin`, `/admin/`, and `/admin/xxx` are all covered.

### 3. Admin returns 401 after login / kicks back to login page

**Diagnosis**:
- Confirm Redis connectivity (rate limiter depends on Redis)
- Confirm `JWT_SECRET_KEY` in `.env.prod` is not empty
- Clear browser localStorage and log in again

### 4. API returns `function date(...) does not exist`

**Cause**: The code is using SQLite-only functions (e.g. `date('now', '-30 days')`) that PostgreSQL does not support.

**Fix**: Use a cross-dialect SQLAlchemy form: `cast(column, Date)` + `func.current_date() - text("INTERVAL 'N days'")`. Already fixed in the latest code.

### 5. Alembic migration failure

**Cause**: Historical migration scripts were written for SQLite and contain `PRAGMA`, `sqlite_master`, and other incompatible syntax.

**Fix**: The project enables Fast Bootstrap (empty DB → final schema + stamp head), so you do not need to run migrations one by one. If you do hit issues:
```bash
# Wipe the database and start over
docker volume rm kunflix_pgdata
docker compose --env-file .env.prod up -d
```

### 6. Email validation failure (422 Unprocessable Entity)

**Cause**: Pydantic `EmailStr` rejects non-public TLDs such as `.local`.

**Fix**: Use a valid email format (e.g. `admin@yourcompany.com`).

---

## Notes for China-Based Servers

If your server is in mainland China (Alibaba Cloud, Volcengine, etc.), you need to use China-based mirrors during the build:

```bash
# The Dockerfile already presets npmmirror and Tsinghua PyPI as defaults
# To override, pass build args explicitly:
docker compose --env-file .env.prod build \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
```

---

## Security Recommendations

1. **Never** commit `.env.prod` to a Git repository
2. Use random high-entropy strings for `POSTGRES_PASSWORD` and `JWT_SECRET_KEY`
3. Run `bash scripts/backup-db.sh` regularly to back up data
4. Redis (6379) and PostgreSQL (5432) are exposed only inside the Docker network and not mapped to the host
5. Nginx is configured with HSTS, X-Content-Type-Options, X-Frame-Options, and other security headers

---

## Resource Sizing Reference (2C4G)

| Service | Memory | Notes |
|------|---------|------|
| PostgreSQL | ~200MB | shared_buffers 128MB |
| Redis | ~50MB | maxmemory 256MB (LRU eviction) |
| Backend (uvicorn) | ~300MB | single worker |
| Frontend (Next.js) | ~150MB | standalone mode |
| Admin (Next.js) | ~120MB | standalone mode |
| Nginx | ~10MB | — |

Total ~830MB — 4GB of memory leaves plenty of headroom.
