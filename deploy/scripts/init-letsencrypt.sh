#!/usr/bin/env bash
# =============================================================================
# KunFlix - Let's Encrypt 首次证书签发脚本
# -----------------------------------------------------------------------------
# 使用前提：
#   1. .env.prod 中 DOMAIN / CERTBOT_EMAIL 已正确填写
#   2. DNS A 记录已指向本机公网 IP
#   3. 服务器 80 端口对公网放通
# 运行方式：
#   cd deploy
#   bash scripts/init-letsencrypt.sh
# -----------------------------------------------------------------------------
# 原理：使用 certbot standalone 模式临时占用 80 端口完成 HTTP-01 校验，
#       证书写入 certbotdata 命名卷；随后正常 `docker compose up -d` 启动 nginx
#       即可直接加载真实证书，续期由 compose 中 certbot 容器的 webroot 模式接管。
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env.prod"

if [[ ! -f "${ENV_FILE}" ]]; then
    echo "[ERROR] ${ENV_FILE} not found. Copy .env.prod.example first." >&2
    exit 1
fi

# 导出 .env.prod 中的变量
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${DOMAIN:?DOMAIN must be set in .env.prod}"
: "${CERTBOT_EMAIL:?CERTBOT_EMAIL must be set in .env.prod}"

STAGING="${STAGING:-0}"   # 传 STAGING=1 走测试环境避免踩限额
STAGING_FLAG=""
[[ "${STAGING}" == "1" ]] && STAGING_FLAG="--staging"

echo "[INFO] Domain:        ${DOMAIN}"
echo "[INFO] Email:         ${CERTBOT_EMAIL}"
echo "[INFO] Staging mode:  ${STAGING}"
echo

# 1) 确保端口 80 空闲（停掉 nginx 容器，若已启动）
echo "[STEP 1/3] Stopping nginx container if running..."
docker compose --env-file "${ENV_FILE}" stop nginx >/dev/null 2>&1 || true

# 2) 运行 certbot standalone 一次性签发；证书落到命名卷 kunflix_certbotdata
echo "[STEP 2/3] Requesting certificate via certbot standalone..."
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

# 3) 拉起全部服务
echo "[STEP 3/3] Starting full stack..."
cd "${DEPLOY_DIR}"
docker compose --env-file "${ENV_FILE}" up -d --build

echo
echo "[DONE] Certificate installed for ${DOMAIN}."
echo "      Browse: https://${DOMAIN}"
echo "      Admin : https://${DOMAIN}/admin"
