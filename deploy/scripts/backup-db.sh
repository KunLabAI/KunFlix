#!/usr/bin/env bash
# =============================================================================
# KunFlix - PostgreSQL 备份脚本（可选，配合 crontab 使用）
# -----------------------------------------------------------------------------
# 运行方式：
#   bash scripts/backup-db.sh
# Cron 建议（每天凌晨 3 点）：
#   0 3 * * * cd /opt/kunflix/deploy && /usr/bin/bash scripts/backup-db.sh >> /var/log/kunflix-backup.log 2>&1
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env.prod"
BACKUP_DIR="${BACKUP_DIR:-${DEPLOY_DIR}/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

[[ -f "${ENV_FILE}" ]] || { echo "[ERROR] ${ENV_FILE} not found." >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

mkdir -p "${BACKUP_DIR}"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="${BACKUP_DIR}/kunflix_${TS}.sql.gz"

echo "[INFO] Dumping ${POSTGRES_DB} -> ${OUT}"
docker compose --env-file "${ENV_FILE}" exec -T postgres \
    pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists \
    | gzip > "${OUT}"

echo "[INFO] Cleaning backups older than ${KEEP_DAYS} days..."
find "${BACKUP_DIR}" -type f -name 'kunflix_*.sql.gz' -mtime "+${KEEP_DAYS}" -delete

echo "[DONE] ${OUT} ($(du -h "${OUT}" | cut -f1))"
