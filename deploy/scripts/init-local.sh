#!/usr/bin/env bash
# =============================================================================
# KunFlix 本地 Docker 一键初始化
# -----------------------------------------------------------------------------
# 与云服务器版 init-letsencrypt.sh 平级，但跳过 DNS/Let's Encrypt 证书签发，
# 专为本地开发环境（domain=localhost，HTTP-only）。
#
# 一次性完成：
#   1. 校验 docker / docker compose 可用
#   2. 准备 .env.prod（缺失则从 .env.prod.example 复制并自动生成随机密钥）
#   3. docker compose up -d --build（仅本地服务，跳过 nginx/certbot）
#   4. 等待 backend healthy
#   5. seed 数据库：LLM Provider / Admin / Free Plan / Prompt Templates / Email Templates
#
# 脚本完全幂等，可重复执行：
#   - .env.prod 已存在则不覆盖
#   - admin 已存在则跳过
#   - seed 重复执行时撞唯一约束不视为致命
#
# 用法：
#   cd deploy
#   bash scripts/init-local.sh
#   bash scripts/init-local.sh --admin-email me@test.dev --admin-password 'My$tr0ng!'
#   bash scripts/init-local.sh --no-build --skip-seed
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# 参数解析（默认值）
# ---------------------------------------------------------------------------
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@12345}"
NO_BUILD=0
SKIP_SEED=0
HEALTH_TIMEOUT=180

while [[ $# -gt 0 ]]; do
    case "$1" in
        --admin-email)    ADMIN_EMAIL="$2";    shift 2 ;;
        --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
        --no-build)       NO_BUILD=1;          shift   ;;
        --skip-seed)      SKIP_SEED=1;         shift   ;;
        --health-timeout) HEALTH_TIMEOUT="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: bash scripts/init-local.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --admin-email EMAIL      默认管理员邮箱 (default: admin@example.com)"
            echo "  --admin-password PASS    默认管理员密码 (default: Admin@12345)"
            echo "  --no-build               跳过 --build，仅 up 现有镜像"
            echo "  --skip-seed              跳过数据库灌种"
            echo "  --health-timeout SEC     backend 健康检查超时秒数 (default: 180)"
            exit 0
            ;;
        *) echo "[ERROR] Unknown option: $1" >&2; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# 路径定位
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_EXAMPLE="${DEPLOY_DIR}/.env.prod.example"
ENV_FILE="${DEPLOY_DIR}/.env.prod"
OVERRIDE_EXAMPLE="${DEPLOY_DIR}/docker-compose.override.yml.example"
OVERRIDE_FILE="${DEPLOY_DIR}/docker-compose.override.yml"

# 本地开发仅启动下列服务：跳过 nginx / certbot（本地无 TLS 证书，走端口直通）
LOCAL_SERVICES=(postgres redis backend worker frontend admin)

# ---------------------------------------------------------------------------
# 日志辅助
# ---------------------------------------------------------------------------
step() { printf "\n\033[36m[STEP] %s\033[0m\n" "$1"; }
info() { printf "\033[90m[INFO] %s\033[0m\n" "$1"; }
ok()   { printf "\033[32m[ OK ] %s\033[0m\n" "$1"; }
err()  { printf "\033[31m[FAIL] %s\033[0m\n" "$1" >&2; }

# =============================================================================
# 1. 校验 Docker
# =============================================================================
step "1/5  Checking Docker availability"
if ! docker --version >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    err "docker / docker compose v2 不可用。请安装并启动 Docker Desktop 后重试"
    exit 1
fi
ok "Docker / Compose v2 ready"

# =============================================================================
# 2. 准备 .env.prod（含随机密钥自动生成）
# =============================================================================
step "2/5  Preparing .env.prod"

hex_secret() {
    # 生成指定字节数的十六进制随机字符串
    local bytes="${1:-32}"
    head -c "$bytes" /dev/urandom | xxd -p | tr -d '\n'
}

fernet_key() {
    # Fernet 要求 url-safe base64 编码的 32 字节随机数据
    head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '='
}

if [[ -f "${ENV_FILE}" ]]; then
    ok ".env.prod 已存在，保留原文件不覆盖"
else
    if [[ ! -f "${ENV_EXAMPLE}" ]]; then
        err ".env.prod.example 不存在：${ENV_EXAMPLE}"
        exit 1
    fi

    cp "${ENV_EXAMPLE}" "${ENV_FILE}"

    # 生成随机密钥
    PG_PASS="$(hex_secret 24)"
    REDIS_PASS="$(hex_secret 32)"
    JWT_KEY="$(hex_secret 32)"
    ENC_KEY="$(fernet_key)"

    # sed -i 替换（兼容 macOS 的 BSD sed 和 GNU sed）
    sed_inplace() {
        if sed --version >/dev/null 2>&1; then
            # GNU sed
            sed -i "s|^$1=.*|$1=$2|" "${ENV_FILE}"
        else
            # BSD sed (macOS)
            sed -i '' "s|^$1=.*|$1=$2|" "${ENV_FILE}"
        fi
    }

    sed_inplace "DOMAIN" "localhost"
    sed_inplace "CERTBOT_EMAIL" "${ADMIN_EMAIL}"
    sed_inplace "POSTGRES_PASSWORD" "${PG_PASS}"
    sed_inplace "REDIS_PASSWORD" "${REDIS_PASS}"
    sed_inplace "JWT_SECRET_KEY" "${JWT_KEY}"
    sed_inplace "ENCRYPTION_KEY" "${ENC_KEY}"

    ok ".env.prod created with randomly generated secrets"
    info "    DOMAIN=localhost (本地 HTTP-only，不签发 TLS 证书)"
    info "    POSTGRES_PASSWORD / REDIS_PASSWORD / JWT_SECRET_KEY / ENCRYPTION_KEY 已随机生成"
fi

# docker-compose.override.yml 控制本地端口映射（3666/3888/8000）
if [[ -f "${OVERRIDE_FILE}" ]]; then
    ok "docker-compose.override.yml 已存在，保留原文件不覆盖"
elif [[ -f "${OVERRIDE_EXAMPLE}" ]]; then
    cp "${OVERRIDE_EXAMPLE}" "${OVERRIDE_FILE}"
    ok "docker-compose.override.yml created from example"
    info "    本地端口直通：Frontend:3666 / Admin:3888 / Backend:8000 / PG:5432 / Redis:6379"
else
    info "docker-compose.override.yml.example 不存在，跳过本地端口映射配置"
fi

# =============================================================================
# 3. docker compose up -d --build（仅本地服务，不启 nginx/certbot）
# =============================================================================
step "3/5  Building & starting containers (${LOCAL_SERVICES[*]})"

BUILD_FLAG=""
[[ "${NO_BUILD}" == "0" ]] && BUILD_FLAG="--build"

cd "${DEPLOY_DIR}"
docker compose --env-file "${ENV_FILE}" up -d ${BUILD_FLAG} "${LOCAL_SERVICES[@]}"

ok "Containers started"

# =============================================================================
# 4. 等 backend 容器 healthy
# =============================================================================
step "4/5  Waiting for backend healthy (max ${HEALTH_TIMEOUT}s)"

elapsed=0
while [[ $elapsed -lt $HEALTH_TIMEOUT ]]; do
    status="$(docker inspect --format '{{.State.Health.Status}}' kunflix-backend 2>/dev/null || echo "unknown")"
    [[ "${status}" == "healthy" ]] && break
    printf "."
    sleep 3
    elapsed=$((elapsed + 3))
done
echo ""

if [[ "${status}" != "healthy" ]]; then
    err "backend 未在 ${HEALTH_TIMEOUT}s 内变为 healthy。请运行: docker logs kunflix-backend"
    exit 1
fi
ok "backend healthy"

# =============================================================================
# 5. seed 数据库（LLM Provider / Admin / Free Plan / Prompt Templates / Email Templates）
# =============================================================================
if [[ "${SKIP_SEED}" == "1" ]]; then
    info "5/5  Skipping seed (--skip-seed)"
else
    step "5/5  Seeding database (LLM providers, admin, email templates, prompt templates)"

    # 通过 stdin 管道把脚本喂给容器内 python，避免 -c 引号转义问题
    # 通过环境变量注入 admin 凭据，避免 Python 字面量里出现密码特殊字符
    echo '
import asyncio, sys
sys.path.insert(0, "/app/scripts")
from scripts.seed_db import seed
asyncio.run(seed())
' | docker exec -i \
        -e "KUNFLIX_INIT_EMAIL=${ADMIN_EMAIL}" \
        -e "KUNFLIX_INIT_PASSWORD=${ADMIN_PASSWORD}" \
        kunflix-backend python -

    ok "Seed step done (重复执行时撞唯一约束属正常)"
fi

# =============================================================================
# Done
# =============================================================================
echo ""
echo -e "\033[32m==================================================================\033[0m"
echo -e "\033[32m  KunFlix local stack ready\033[0m"
echo -e "\033[32m==================================================================\033[0m"
echo ""
echo "  Frontend     :  http://localhost:3666/"
echo "  Admin panel  :  http://localhost:3888/admin"
echo "  Backend API  :  http://localhost:8000/docs"
echo ""
echo -e "\033[33m  Default admin login:\033[0m"
echo "      email    = ${ADMIN_EMAIL}"
echo "      password = ${ADMIN_PASSWORD}"
echo ""
echo "  常用运维："
echo "      docker compose --env-file .env.prod ps               # 查看状态"
echo "      docker compose --env-file .env.prod logs -f backend  # 实时日志"
echo "      docker compose --env-file .env.prod down             # 停止全部"
echo ""
