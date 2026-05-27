# syntax=docker/dockerfile:1.7
# ============================================================================
# KunFlix Backend (FastAPI + uvicorn) - Production Image
# ----------------------------------------------------------------------------
# Build context: project root (.)
#   docker build -f deploy/backend.Dockerfile -t kunflix-backend ..
#
# AgentScope 2.0 升级后引入了 Rust 依赖（agentscope → ripgrep），ripgrep PyPI
# 包没有 Linux 预编译 wheel，必须本地 cargo 编译。为了让运行镜像保持纯 Python
# 体积（不带 ~1GB 的 Rust toolchain），这里采用 multi-stage：
#   1. rust-builder：装 Rust 1.85+ → cargo build → 产出所有 wheel
#   2. base：纯 Python 镜像 → pip install --find-links 把 wheel 装进去
# ============================================================================

# ============================================================================
# Stage 1: Rust + Python 编译环境，仅产出 wheel
# ============================================================================
FROM python:3.14-slim-bookworm AS rust-builder

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DEBIAN_FRONTEND=noninteractive

# Debian 镜像源（默认清华 HTTPS，相较阿里云 HTTP 抗断流能力更强；
# 外网/海外构建可通过 --build-arg DEBIAN_MIRROR= 清空回退到 deb.debian.org）
ARG DEBIAN_MIRROR=mirrors.tuna.tsinghua.edu.cn
ARG DEBIAN_MIRROR_PROTO=https
RUN set -eux; \
    if [ -n "$DEBIAN_MIRROR" ]; then \
      printf '%s\n' \
        'Types: deb' \
        "URIs: ${DEBIAN_MIRROR_PROTO}://${DEBIAN_MIRROR}/debian" \
        'Suites: bookworm bookworm-updates' \
        'Components: main' \
        'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
        '' \
        'Types: deb' \
        "URIs: ${DEBIAN_MIRROR_PROTO}://${DEBIAN_MIRROR}/debian-security" \
        'Suites: bookworm-security' \
        'Components: main' \
        'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
        > /etc/apt/sources.list.d/debian.sources; \
    fi; \
    printf '%s\n' \
        'Acquire::Retries "10";' \
        'Acquire::http::Timeout "60";' \
        'Acquire::https::Timeout "60";' \
        'Acquire::http::No-Cache "true";' \
        > /etc/apt/apt.conf.d/99-retries

# 编译 ripgrep 等 Rust 扩展所需的最小工具链
# 外层 shell 5 次重试循环：对镜像源偶发 EOF/500 抖动容错；--fix-missing 兜底
RUN set -eux; \
    for i in 1 2 3 4 5; do \
        apt-get update \
        && apt-get install -y --no-install-recommends --fix-missing \
            curl ca-certificates build-essential libpq-dev \
        && break \
        || { echo ">>> apt install failed, retry $i/5 in 10s..."; sleep 10; }; \
    done; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 安装 Rust stable（rustup 走 rsproxy.cn 镜像，crate 走 rsproxy sparse）
# AgentScope 2.0 → ripgrep 15.x 要求 Rust >=1.85（edition2024），这里固定 stable 即可
ARG RUSTUP_DIST_SERVER=https://rsproxy.cn
ARG RUSTUP_UPDATE_ROOT=https://rsproxy.cn/rustup
ENV RUSTUP_DIST_SERVER=${RUSTUP_DIST_SERVER} \
    RUSTUP_UPDATE_ROOT=${RUSTUP_UPDATE_ROOT}

RUN curl --proto '=https' --tlsv1.2 -sSf "${RUSTUP_UPDATE_ROOT}/rustup-init.sh" \
        | sh -s -- -y --default-toolchain stable --profile minimal --no-modify-path \
    && /root/.cargo/bin/rustup --version \
    && /root/.cargo/bin/rustc --version

ENV PATH="/root/.cargo/bin:${PATH}"

# 配置 cargo 国内镜像（rsproxy.cn sparse），避免 crates.io 默认源国内拉取超时
RUN mkdir -p /root/.cargo \
    && printf '%s\n' \
        '[source.crates-io]' \
        'replace-with = "rsproxy-sparse"' \
        '' \
        '[source.rsproxy-sparse]' \
        'registry = "sparse+https://rsproxy.cn/index/"' \
        '' \
        '[net]' \
        'git-fetch-with-cli = true' \
      > /root/.cargo/config.toml

# pip 镜像源（与 base stage 一致：阿里云）
ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple
ARG PIP_EXTRA_INDEX_URL="https://pypi.org/simple"
ARG PIP_TRUSTED_HOST="mirrors.aliyun.com pypi.org files.pythonhosted.org"
ENV PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_EXTRA_INDEX_URL=${PIP_EXTRA_INDEX_URL} \
    PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST} \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=3

WORKDIR /build
COPY backend/requirements.txt /build/requirements.txt

# pip wheel：把所有依赖（含从源码编译的 ripgrep）打成 wheel 落到 /wheels
# - pip 缓存 /root/.cache/pip：跨构建复用已下载的 sdist/wheel
# - cargo registry 缓存 /root/.cargo/registry：跨构建复用 crates.io 索引与 .crate
# - cargo target 缓存 /build/target：跨构建复用 ripgrep 增量编译产物
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    --mount=type=cache,target=/root/.cargo/registry,sharing=locked \
    --mount=type=cache,target=/build/target,sharing=locked \
    pip install --upgrade pip \
    && pip wheel --wheel-dir /wheels -r /build/requirements.txt

# ============================================================================
# Stage 2: 运行镜像（纯 Python，不带 Rust，体积小）
# ============================================================================
FROM python:3.14-slim-bookworm AS base

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TZ=Asia/Shanghai

# Debian 镜像源（默认清华 HTTPS；外网环境可通过 --build-arg DEBIAN_MIRROR= 清空回退到 deb.debian.org）
ARG DEBIAN_MIRROR=mirrors.tuna.tsinghua.edu.cn
ARG DEBIAN_MIRROR_PROTO=https
RUN set -eux; \
    if [ -n "$DEBIAN_MIRROR" ]; then \
      printf '%s\n' \
        'Types: deb' \
        "URIs: ${DEBIAN_MIRROR_PROTO}://${DEBIAN_MIRROR}/debian" \
        'Suites: bookworm bookworm-updates' \
        'Components: main' \
        'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
        '' \
        'Types: deb' \
        "URIs: ${DEBIAN_MIRROR_PROTO}://${DEBIAN_MIRROR}/debian-security" \
        'Suites: bookworm-security' \
        'Components: main' \
        'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
        > /etc/apt/sources.list.d/debian.sources; \
    fi; \
    printf '%s\n' \
        'Acquire::Retries "10";' \
        'Acquire::http::Timeout "60";' \
        'Acquire::https::Timeout "60";' \
        'Acquire::http::No-Cache "true";' \
        > /etc/apt/apt.conf.d/99-retries

# 系统依赖：libpq-dev 供 psycopg2 运行时；build-essential 仅在装无 wheel 的小依赖时兜底
# 说明：不在镜像内跑 apt-get upgrade。CVE 修复交由上游 python:3.14-slim-bookworm
# 镜像定期 bump tag 处理，避免不可重复构建与额外跨网依赖
# 外层 shell 5 次重试循环 + --fix-missing：对镜像源偶发 EOF/500 抖动容错
RUN set -eux; \
    for i in 1 2 3 4 5; do \
        apt-get update \
        && apt-get install -y --no-install-recommends --fix-missing \
            build-essential \
            libpq-dev \
            curl \
            tini \
        && break \
        || { echo ">>> apt install failed, retry $i/5 in 10s..."; sleep 10; }; \
    done; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app

# pip 镜像源（与 builder 一致）
ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple
ARG PIP_EXTRA_INDEX_URL="https://pypi.org/simple"
ARG PIP_TRUSTED_HOST="mirrors.aliyun.com pypi.org files.pythonhosted.org"
ENV PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_EXTRA_INDEX_URL=${PIP_EXTRA_INDEX_URL} \
    PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST} \
    PIP_DEFAULT_TIMEOUT=30 \
    PIP_RETRIES=3

# 从 builder 拷贝预构建的 wheel；优先 --find-links 离线安装，避免网络回源
COPY --from=rust-builder /wheels /wheels
COPY backend/requirements.txt /app/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
    pip install --upgrade pip \
    && pip install --no-index --find-links /wheels -r /app/requirements.txt \
    && rm -rf /wheels

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
