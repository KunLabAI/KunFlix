#!/usr/bin/env bash
# =============================================================================
# KunFlix 生产环境 .env.prod 一键初始化
# -----------------------------------------------------------------------------
# 交互式询问域名 & 邮箱，自动生成所有密钥。
# 幂等：.env.prod 已存在时不覆盖（使用 --force 强制重新生成）。
#
# 用法：
#   cd deploy
#   bash scripts/setup-env.sh
#   bash scripts/setup-env.sh --domain kunflix.example.com --email admin@example.com
#   bash scripts/setup-env.sh --force
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# 参数解析
# ---------------------------------------------------------------------------
DOMAIN=""
EMAIL=""
FORCE=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain) DOMAIN="$2"; shift 2 ;;
        --email)  EMAIL="$2";  shift 2 ;;
        --force)  FORCE=1;     shift   ;;
        -h|--help)
            echo "Usage: bash scripts/setup-env.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --domain DOMAIN   你的域名（如 kunflix.example.com）"
            echo "  --email  EMAIL    Let's Encrypt 通知邮箱"
            echo "  --force           强制覆盖已有的 .env.prod"
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

# ---------------------------------------------------------------------------
# 日志辅助
# ---------------------------------------------------------------------------
info() { printf "\033[36m[INFO] %s\033[0m\n" "$1"; }
ok()   { printf "\033[32m[ OK ] %s\033[0m\n" "$1"; }
err()  { printf "\033[31m[FAIL] %s\033[0m\n" "$1" >&2; }

# ---------------------------------------------------------------------------
# 检查是否已存在
# ---------------------------------------------------------------------------
if [[ -f "${ENV_FILE}" && "${FORCE}" -eq 0 ]]; then
    ok ".env.prod 已存在，跳过生成（使用 --force 强制重新生成）"
    exit 0
fi

if [[ ! -f "${ENV_EXAMPLE}" ]]; then
    err ".env.prod.example 不存在：${ENV_EXAMPLE}"
    exit 1
fi

# ---------------------------------------------------------------------------
# 交互式输入（仅当命令行未提供时）
# ---------------------------------------------------------------------------
if [[ -z "${DOMAIN}" ]]; then
    printf "\033[33m请输入你的域名（如 kunflix.example.com）: \033[0m"
    read -r DOMAIN
    if [[ -z "${DOMAIN}" ]]; then
        err "域名不能为空"
        exit 1
    fi
fi

if [[ -z "${EMAIL}" ]]; then
    printf "\033[33m请输入 Let's Encrypt 通知邮箱: \033[0m"
    read -r EMAIL
    if [[ -z "${EMAIL}" ]]; then
        err "邮箱不能为空"
        exit 1
    fi
fi

# ---------------------------------------------------------------------------
# 密钥生成
# ---------------------------------------------------------------------------
hex_secret() {
    local bytes="${1:-32}"
    head -c "$bytes" /dev/urandom | xxd -p | tr -d '\n'
}

fernet_key() {
    head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '='
}

PG_PASS="$(hex_secret 24)"
REDIS_PASS="$(hex_secret 32)"
JWT_KEY="$(hex_secret 32)"
ENC_KEY="$(fernet_key)"

# ---------------------------------------------------------------------------
# 写入 .env.prod
# ---------------------------------------------------------------------------
cp "${ENV_EXAMPLE}" "${ENV_FILE}"

sed_inplace() {
    if sed --version >/dev/null 2>&1; then
        sed -i "s|^$1=.*|$1=$2|" "${ENV_FILE}"
    else
        sed -i '' "s|^$1=.*|$1=$2|" "${ENV_FILE}"
    fi
}

sed_inplace "DOMAIN" "${DOMAIN}"
sed_inplace "CERTBOT_EMAIL" "${EMAIL}"
sed_inplace "POSTGRES_PASSWORD" "${PG_PASS}"
sed_inplace "REDIS_PASSWORD" "${REDIS_PASS}"
sed_inplace "JWT_SECRET_KEY" "${JWT_KEY}"
sed_inplace "ENCRYPTION_KEY" "${ENC_KEY}"

# ---------------------------------------------------------------------------
# 结果输出
# ---------------------------------------------------------------------------
echo ""
ok ".env.prod 已生成！"
echo ""
info "  DOMAIN          = ${DOMAIN}"
info "  CERTBOT_EMAIL   = ${EMAIL}"
info "  POSTGRES_PASSWORD = ${PG_PASS:0:8}******** (已随机生成)"
info "  REDIS_PASSWORD    = ${REDIS_PASS:0:8}******** (已随机生成)"
info "  JWT_SECRET_KEY    = ${JWT_KEY:0:8}******** (已随机生成)"
info "  ENCRYPTION_KEY    = ${ENC_KEY:0:8}******** (已随机生成)"
echo ""
info "如需修改其他可选配置（AI 模型密钥、限流参数等），请编辑："
info "  ${ENV_FILE}"
