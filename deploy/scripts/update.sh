#!/usr/bin/env bash
# =============================================================================
# KunFlix - 生产环境一键更新脚本
# -----------------------------------------------------------------------------
# 职责：
#   1. 前置校验 .env.prod 关键变量（REDIS_PASSWORD / JWT_SECRET_KEY 硬化规则）
#   2. 自动数据库快照（失败可回滚）
#   3. git pull --ff-only 拉最新代码
#   4. docker compose build + up -d 滚动重建 5 个应用服务
#   5. 轮询 healthcheck，全部 healthy 后退出 0；否则打印回滚命令
#
# 使用方式：
#   cd /opt/kunflix/deploy
#   sudo bash scripts/update.sh              # 完整流程
#   sudo bash scripts/update.sh --no-pull    # 跳过 git pull（已手动拉好）
#   sudo bash scripts/update.sh --no-backup  # 跳过数据库备份（不推荐）
#   sudo bash scripts/update.sh --dry-run    # 只检查不执行
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# 路径常量 & 参数解析
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_DIR="$(cd "${DEPLOY_DIR}/.." && pwd)"
ENV_FILE="${DEPLOY_DIR}/.env.prod"
COMPOSE=(docker compose --env-file "${ENV_FILE}")

# 需要等待 healthcheck 通过的服务（必须与 docker-compose.yml 的 healthcheck 字段对应）
HEALTH_SERVICES=(postgres redis backend frontend admin nginx)
HEALTH_TIMEOUT_SEC=180

DO_PULL=true
DO_BACKUP=true
DRY_RUN=false
for arg in "$@"; do
    case "${arg}" in
        --no-pull)   DO_PULL=false ;;
        --no-backup) DO_BACKUP=false ;;
        --dry-run)   DRY_RUN=true ;;
        -h|--help)
            sed -n '2,20p' "$0"; exit 0 ;;
        *)
            echo "[ERROR] Unknown argument: ${arg}" >&2; exit 2 ;;
    esac
done

log()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
err()  { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; }
ok()   { echo -e "\033[1;32m[ OK ]\033[0m  $*"; }

run() {
    # --dry-run 下仅回显；否则实际执行
    ${DRY_RUN} && { echo "+ $*"; return 0; } || eval "$*"
}

# ---------------------------------------------------------------------------
# 1. 前置校验
# ---------------------------------------------------------------------------
log "Step 1/5 前置校验 ${ENV_FILE}"

[[ -f "${ENV_FILE}" ]] || { err "${ENV_FILE} 不存在，先从 .env.prod.example 复制并填写"; exit 1; }

# 将 .env.prod 解析到当前 shell，便于做规则校验
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

PLACEHOLDERS=(
    "CHANGE_ME_STRONG_RANDOM_PASSWORD"
    "CHANGE_ME_OPENSSL_RAND_HEX_32"
    "change-me-in-production-use-openssl-rand-hex-32"
)

check_placeholder() {
    local name="$1" value="$2"
    for ph in "${PLACEHOLDERS[@]}"; do
        [[ "${value}" == "${ph}" ]] && { err "${name} 仍为占位符 \"${ph}\"，请改为真实强随机值"; return 1; }
    done
    return 0
}

FAIL=0
: "${DOMAIN:=}"; [[ -n "${DOMAIN}" && "${DOMAIN}" != "example.com" ]] || { err "DOMAIN 未配置或仍为示例值"; FAIL=1; }
: "${POSTGRES_PASSWORD:=}"; [[ -n "${POSTGRES_PASSWORD}" ]] || { err "POSTGRES_PASSWORD 为空"; FAIL=1; }
check_placeholder POSTGRES_PASSWORD "${POSTGRES_PASSWORD}" || FAIL=1

: "${REDIS_PASSWORD:=}"; [[ -n "${REDIS_PASSWORD}" ]] || { err "REDIS_PASSWORD 为空 —— 本次升级起 Redis 强制要求密码"; FAIL=1; }
check_placeholder REDIS_PASSWORD "${REDIS_PASSWORD}" || FAIL=1
# REDIS_URL 直接插值密码（redis://:${REDIS_PASSWORD}@redis:6379/0），URL 保留字符会导致 urllib 解析错位
# 触发 ValueError: Port could not be cast to integer。强制要求密码为 URL 安全字符（字母+数字+_-）。
[[ "${REDIS_PASSWORD}" =~ [/+=:@?\#\&\ ] ]] && { err "REDIS_PASSWORD 含 URL 保留字符（/ + = : @ ? # & 空格 之一），会让 Redis URL 解析失败。请用 \`openssl rand -hex 32\` 重新生成"; FAIL=1; }

: "${JWT_SECRET_KEY:=}"; [[ -n "${JWT_SECRET_KEY}" ]] || { err "JWT_SECRET_KEY 为空"; FAIL=1; }
check_placeholder JWT_SECRET_KEY "${JWT_SECRET_KEY}" || FAIL=1
[[ ${#JWT_SECRET_KEY} -ge 32 ]] || { err "JWT_SECRET_KEY 长度=${#JWT_SECRET_KEY}，硬化规则要求 ≥ 32，请用 \`openssl rand -hex 32\` 生成"; FAIL=1; }

command -v docker >/dev/null || { err "docker 未安装"; FAIL=1; }
docker compose version >/dev/null 2>&1 || { err "docker compose v2 未可用"; FAIL=1; }

[[ ${FAIL} -eq 0 ]] || { err "前置校验未通过，已中止"; exit 1; }
ok "前置校验通过"

# ---------------------------------------------------------------------------
# 2. 数据库备份
# ---------------------------------------------------------------------------
if ${DO_BACKUP}; then
    log "Step 2/5 数据库备份"
    # 仅在 postgres 已运行时备份；首次部署无容器跳过
    if "${COMPOSE[@]}" ps --status running postgres 2>/dev/null | grep -q postgres; then
        run bash "${SCRIPT_DIR}/backup-db.sh"
        ok "数据库备份完成"
    else
        warn "postgres 容器未运行，跳过备份（首次部署属正常情况）"
    fi
else
    warn "Step 2/5 已跳过数据库备份 (--no-backup)"
fi

# ---------------------------------------------------------------------------
# 3. 拉代码
# ---------------------------------------------------------------------------
if ${DO_PULL}; then
    log "Step 3/5 git pull --ff-only"
    cd "${REPO_DIR}"
    # 确保工作区干净，避免 rebase 冲突
    if ! git diff --quiet || ! git diff --cached --quiet; then
        err "仓库存在未提交改动：\n$(git status --short)"
        err "请先 stash/commit，或使用 --no-pull 跳过"
        exit 1
    fi
    run git fetch --tags origin
    run git pull --ff-only origin "$(git rev-parse --abbrev-ref HEAD)"
    HEAD_SHA="$(git rev-parse --short HEAD)"
    ok "代码已更新到 ${HEAD_SHA}"
    cd "${DEPLOY_DIR}"
else
    warn "Step 3/5 已跳过 git pull (--no-pull)"
fi

# ---------------------------------------------------------------------------
# 4. 重建 + 滚动起容器
# ---------------------------------------------------------------------------
log "Step 4/5 docker compose up -d --build"
cd "${DEPLOY_DIR}"
run "${COMPOSE[@]} build --pull"
run "${COMPOSE[@]} up -d --remove-orphans"
ok "容器已启动，开始等待 healthcheck"

# ---------------------------------------------------------------------------
# 5. 健康检查
# ---------------------------------------------------------------------------
log "Step 5/5 等待服务 healthy（超时 ${HEALTH_TIMEOUT_SEC}s）"

${DRY_RUN} && { ok "dry-run 模式，跳过 healthcheck 轮询"; exit 0; }

svc_health() {
    # 返回 healthy / unhealthy / starting / none（无 healthcheck）/ missing
    local svc="$1"
    local cid
    cid="$("${COMPOSE[@]}" ps -q "${svc}" 2>/dev/null || true)"
    [[ -z "${cid}" ]] && { echo missing; return; }
    docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${cid}" 2>/dev/null || echo missing
}

deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SEC ))
while :; do
    all_good=true
    summary=""
    for svc in "${HEALTH_SERVICES[@]}"; do
        status="$(svc_health "${svc}")"
        summary+="${svc}=${status}  "
        # healthy 或 none（无 healthcheck 的服务如 certbot 归此类）都算通过
        case "${status}" in
            healthy|none) ;;
            *) all_good=false ;;
        esac
    done
    ${all_good} && { ok "全部服务就绪：${summary}"; break; }

    now=$(date +%s)
    if [[ ${now} -ge ${deadline} ]]; then
        err "健康检查超时：${summary}"
        err "查看日志定位问题："
        err "  ${COMPOSE[*]} logs --tail=100 backend"
        err "  ${COMPOSE[*]} logs --tail=50  redis"
        err "回滚命令："
        err "  cd ${REPO_DIR} && git checkout <上一个 tag>"
        err "  cd ${DEPLOY_DIR} && ${COMPOSE[*]} up -d --build"
        exit 1
    fi
    echo -n "  ${summary}  剩余 $(( deadline - now ))s"$'\r'
    sleep 5
done

echo
log "最终服务状态："
"${COMPOSE[@]}" ps
ok "KunFlix 更新完成 🎉"
