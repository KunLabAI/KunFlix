#!/usr/bin/env bash
# =============================================================================
# KunFlix - 生产环境一键初始化（证书签发 + 启动 + 数据库初始化）
# -----------------------------------------------------------------------------
# 使用前提：
#   1. .env.prod 已生成（运行 setup-env.sh）
#   2. DNS A 记录已指向本机公网 IP
#   3. 服务器 80 端口对公网放通
# 运行方式：
#   cd deploy
#   bash scripts/init-letsencrypt.sh
#   bash scripts/init-letsencrypt.sh --admin-email me@example.com --admin-password 'Str0ng!'
#   bash scripts/init-letsencrypt.sh --skip-seed
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# 参数解析
# ---------------------------------------------------------------------------
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
SKIP_SEED=0
HEALTH_TIMEOUT=180
STAGING="${STAGING:-0}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --admin-email)    ADMIN_EMAIL="$2";    shift 2 ;;
        --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
        --skip-seed)      SKIP_SEED=1;         shift   ;;
        --health-timeout) HEALTH_TIMEOUT="$2"; shift 2 ;;
        --staging)        STAGING=1;           shift   ;;
        -h|--help)
            echo "Usage: bash scripts/init-letsencrypt.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --admin-email EMAIL      管理员邮箱 (交互式输入)"
            echo "  --admin-password PASS    管理员密码 (交互式输入)"
            echo "  --skip-seed              跳过数据库初始化"
            echo "  --health-timeout SEC     backend 健康检查超时秒数 (default: 180)"
            echo "  --staging                certbot 使用测试环境（避免踩限额）"
            exit 0
            ;;
        *) echo "[ERROR] Unknown option: $1" >&2; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# 路径 & 日志
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env.prod"

step() { printf "\n\033[36m[STEP] %s\033[0m\n" "$1"; }
info() { printf "\033[90m[INFO] %s\033[0m\n" "$1"; }
ok()   { printf "\033[32m[ OK ] %s\033[0m\n" "$1"; }
err()  { printf "\033[31m[FAIL] %s\033[0m\n" "$1" >&2; }

# ---------------------------------------------------------------------------
# 校验 .env.prod
# ---------------------------------------------------------------------------
if [[ ! -f "${ENV_FILE}" ]]; then
    err ".env.prod 不存在，请先运行: bash scripts/setup-env.sh"
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${DOMAIN:?DOMAIN must be set in .env.prod}"
: "${CERTBOT_EMAIL:?CERTBOT_EMAIL must be set in .env.prod}"

STAGING_FLAG=""
[[ "${STAGING}" == "1" ]] && STAGING_FLAG="--staging"

echo ""
info "Domain:       ${DOMAIN}"
info "Email:        ${CERTBOT_EMAIL}"
info "Staging mode: ${STAGING}"

# =============================================================================
# 1/4  签发证书
# =============================================================================
step "1/4  Requesting HTTPS certificate via certbot standalone"

docker compose --env-file "${ENV_FILE}" stop nginx >/dev/null 2>&1 || true

docker run --rm \
    -p 80:80 \
    -v kunflix_certbotdata:/etc/letsencrypt \
    -v kunflix_certbotwww:/var/www/certbot \
    certbot/certbot:latest \
    certonly --standalone \
        ${STAGING_FLAG} \
        --non-interactive --agree-tos \
        --email "${CERTBOT_EMAIL}" \
        -d "${DOMAIN}" \
        --preferred-challenges http

ok "Certificate issued for ${DOMAIN}"

# =============================================================================
# 2/4  拉起全部服务
# =============================================================================
step "2/4  Starting full stack"

cd "${DEPLOY_DIR}"
docker compose --env-file "${ENV_FILE}" up -d --build

ok "Containers started"

# =============================================================================
# 3/4  等待 backend healthy
# =============================================================================
step "3/4  Waiting for backend healthy (max ${HEALTH_TIMEOUT}s)"

elapsed=0
status="unknown"
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
# 4/4  初始化数据库（seed + 创建管理员）
# =============================================================================
if [[ "${SKIP_SEED}" == "1" ]]; then
    info "Skipping database seed (--skip-seed)"
else
    step "4/4  Seeding database & creating admin"

    # 交互式输入管理员凭据（仅当命令行未提供时）
    if [[ -z "${ADMIN_EMAIL}" ]]; then
        printf "\033[33m请输入管理员邮箱: \033[0m"
        read -r ADMIN_EMAIL
        [[ -z "${ADMIN_EMAIL}" ]] && { err "管理员邮箱不能为空"; exit 1; }
    fi

    if [[ -z "${ADMIN_PASSWORD}" ]]; then
        printf "\033[33m请输入管理员密码: \033[0m"
        read -rs ADMIN_PASSWORD
        echo ""
        [[ -z "${ADMIN_PASSWORD}" ]] && { err "管理员密码不能为空"; exit 1; }
    fi

    # seed 数据库
    echo '
import asyncio, sys
sys.path.insert(0, "/app/scripts")
from scripts.seed_db import seed
asyncio.run(seed())
' | docker exec -i \
        -e "KUNFLIX_INIT_EMAIL=${ADMIN_EMAIL}" \
        -e "KUNFLIX_INIT_PASSWORD=${ADMIN_PASSWORD}" \
        kunflix-backend python -

    ok "Database seeded & admin created"
fi

# =============================================================================
# Done
# =============================================================================
echo ""
echo -e "\033[32m==================================================================\033[0m"
echo -e "\033[32m  KunFlix production deployment complete\033[0m"
echo -e "\033[32m==================================================================\033[0m"
echo ""
echo "  Site   :  https://${DOMAIN}/"
echo "  Admin  :  https://${DOMAIN}/admin"
echo ""
if [[ "${SKIP_SEED}" == "0" ]]; then
    echo -e "\033[33m  Admin login:\033[0m"
    echo "      email    = ${ADMIN_EMAIL}"
    echo ""
fi
echo "  常用运维："
echo "      docker compose --env-file .env.prod ps               # 查看状态"
echo "      docker compose --env-file .env.prod logs -f backend  # 实时日志"
echo "      docker compose --env-file .env.prod down             # 停止全部"
echo ""
