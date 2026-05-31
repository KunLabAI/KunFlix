# syntax=docker/dockerfile:1.7
# ============================================================================
# KunFlix Backend (FastAPI + uvicorn) - Production Image
# ----------------------------------------------------------------------------
# Build context: project root (.)
#   docker build -f deploy/backend.Dockerfile -t kunflix-backend ..
#
# ripgrep 已锁定 14.1.0（有预编译 manylinux wheel），无需 Rust 工具链。
# 单阶段构建，体积小、速度快。
# ============================================================================

FROM python:3.14-slim-bookworm AS base

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TZ=Asia/Shanghai

# Debian 多镜像源 fallback：依次尝试，命中即用
ARG DEBIAN_MIRRORS="mirrors.volces.com:http mirrors.tuna.tsinghua.edu.cn:https mirrors.aliyun.com:http deb.debian.org:http"
ARG DEBIAN_MIRROR=
ARG DEBIAN_MIRROR_PROTO=https

# 系统依赖：libpq-dev 供 psycopg2 运行时；build-essential 供无 wheel 的小依赖兆底
RUN set -eux; \
    printf '%s\n' \
        'Acquire::Retries "3";' \
        'Acquire::http::Timeout "30";' \
        'Acquire::https::Timeout "30";' \
        'Acquire::http::No-Cache "true";' \
        > /etc/apt/apt.conf.d/99-retries; \
    write_sources() { \
        host="$1"; proto="$2"; sec_host="$1"; \
        [ "$host" = "deb.debian.org" ] && sec_host="security.debian.org"; \
        rm -f /etc/apt/sources.list.d/debian.sources; \
        printf '%s\n' \
            "deb ${proto}://${host}/debian bookworm main" \
            "deb ${proto}://${host}/debian bookworm-updates main" \
            "deb ${proto}://${sec_host}/debian-security bookworm-security main" \
            > /etc/apt/sources.list; \
    }; \
    if [ -n "$DEBIAN_MIRROR" ]; then \
        MIRRORS="${DEBIAN_MIRROR}:${DEBIAN_MIRROR_PROTO}"; \
    else \
        MIRRORS="$DEBIAN_MIRRORS"; \
    fi; \
    ok=0; \
    for spec in $MIRRORS; do \
        host="${spec%:*}"; proto="${spec##*:}"; \
        echo ">>> [apt] trying mirror: ${proto}://${host}"; \
        write_sources "$host" "$proto"; \
        for i in 1 2 3; do \
            if apt-get update \
                && apt-get install -y --no-install-recommends --fix-missing \
                    build-essential libpq-dev curl tini; then \
                ok=1; break; \
            fi; \
            echo ">>> [apt] install failed on ${host} (${i}/3), retry in 5s..."; \
            sleep 5; \
        done; \
        [ "$ok" = "1" ] && break; \
        echo ">>> [apt] mirror ${host} unusable, switching to next..."; \
    done; \
    [ "$ok" = "1" ] || { echo "FATAL: all debian mirrors failed"; exit 1; }; \
    command -v curl >/dev/null && command -v tini >/dev/null \
        || { echo "FATAL: required tools missing after install"; exit 1; }; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app

# pip 镜像源
ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple
ARG PIP_EXTRA_INDEX_URL="https://pypi.org/simple"
ARG PIP_TRUSTED_HOST="mirrors.aliyun.com pypi.org files.pythonhosted.org"
ENV PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_EXTRA_INDEX_URL=${PIP_EXTRA_INDEX_URL} \
    PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST} \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=3

# 安装依赖（ripgrep==14.1.0 有预编译 wheel，无需 Rust）
COPY backend/requirements.txt /app/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip install --upgrade pip \
    && pip install -r /app/requirements.txt

# 再拷贝项目代码
COPY backend/ /app/

# 非 root 用户运行；预建 media 目录并授权
RUN useradd -m -u 1000 app \
    && mkdir -p /app/media \
    && chown -R app:app /app
USER app

EXPOSE 8000

# tini 作为 PID 1 负责信号转发与僵尸回收；uvicorn 2 进程（双核并行，AI 长连接互不阻塞）
# 注意：多 worker 依赖 Redis 做跨进程事件路由（dispatcher.py），生产已配置 REDIS_URL
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--proxy-headers", \
     "--forwarded-allow-ips=*"]
