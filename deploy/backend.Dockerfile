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

# Debian 多镜像源 fallback：依次尝试，命中即用
# 默认顺序：火山引擎(http) → 清华(https) → 阿里云(http) → 官方 deb.debian.org(http)
# 可通过 --build-arg DEBIAN_MIRRORS="host1:proto1 host2:proto2 ..." 自定义全局列表
# 或 --build-arg DEBIAN_MIRROR=xxx 强制单源（向后兼容，会覆盖多源列表）
ARG DEBIAN_MIRRORS="mirrors.volces.com:http mirrors.tuna.tsinghua.edu.cn:https mirrors.aliyun.com:http deb.debian.org:http"
ARG DEBIAN_MIRROR=
ARG DEBIAN_MIRROR_PROTO=https

# apt 高鲁棒安装：单 RUN 内完成「写源 + apt update + install」
#   外层遍历镜像源，内层每源 3 次重试，任一源装上即 break
#   全部失败才 exit 1，避免被 BuildKit 缓存为"假成功"层
#   另加 command -v 校验关键工具真的装上，防御 --fix-missing 静默跳包
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
                    curl ca-certificates build-essential libpq-dev; then \
                ok=1; break; \
            fi; \
            echo ">>> [apt] install failed on ${host} (${i}/3), retry in 5s..."; \
            sleep 5; \
        done; \
        [ "$ok" = "1" ] && break; \
        echo ">>> [apt] mirror ${host} unusable, switching to next..."; \
    done; \
    [ "$ok" = "1" ] || { echo "FATAL: all debian mirrors failed"; exit 1; }; \
    command -v curl >/dev/null && command -v gcc >/dev/null \
        || { echo "FATAL: required tools missing after install"; exit 1; }; \
    apt-get clean; \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 安装 Rust stable —— 多镜像源 fallback：rsproxy → 清华 → 中科大 → 官方
# AgentScope 2.0 → ripgrep 15.x 要求 Rust >=1.85（edition2024），这里固定 stable 即可
# 可通过 --build-arg RUSTUP_MIRRORS="rsproxy tuna ustc official" 自定义顺序
# 或 --build-arg RUSTUP_DIST_SERVER=xxx RUSTUP_UPDATE_ROOT=xxx 强制单源（向后兼容）
ARG RUSTUP_MIRRORS="rsproxy tuna ustc official"
ARG RUSTUP_DIST_SERVER=
ARG RUSTUP_UPDATE_ROOT=

# 多源 fallback 安装：任一源装上即 break；全部失败才 exit 1
# 每次尝试前清理 /root/.rustup 残留，防 settings.toml 锁住上次镜像路径
# curl 加 --connect-timeout / --max-time，避免单源卡死无限挂起
RUN set -eux; \
    set_rustup_mirror() { \
        case "$1" in \
            rsproxy) \
                D="https://rsproxy.cn"; U="https://rsproxy.cn/rustup" ;; \
            tuna) \
                D="https://mirrors.tuna.tsinghua.edu.cn/rustup"; \
                U="https://mirrors.tuna.tsinghua.edu.cn/rustup" ;; \
            ustc) \
                D="https://mirrors.ustc.edu.cn/rust-static"; \
                U="https://mirrors.ustc.edu.cn/rust-static/rustup" ;; \
            bfsu) \
                D="https://mirrors.bfsu.edu.cn/rustup"; \
                U="https://mirrors.bfsu.edu.cn/rustup" ;; \
            official) \
                D="https://static.rust-lang.org"; \
                U="https://static.rust-lang.org/rustup" ;; \
            *) \
                echo "FATAL: unknown rustup mirror name: $1"; return 1 ;; \
        esac; \
        export RUSTUP_DIST_SERVER="$D"; \
        export RUSTUP_UPDATE_ROOT="$U"; \
        echo ">>> [rustup] mirror=$1 DIST=${RUSTUP_DIST_SERVER}"; \
    }; \
    if [ -n "$RUSTUP_DIST_SERVER" ] && [ -n "$RUSTUP_UPDATE_ROOT" ]; then \
        export RUSTUP_DIST_SERVER RUSTUP_UPDATE_ROOT; \
        MIRRORS="custom"; \
    else \
        MIRRORS="$RUSTUP_MIRRORS"; \
    fi; \
    ok=0; \
    for mirror in $MIRRORS; do \
        echo ">>> [rustup] trying mirror: ${mirror}"; \
        [ "$mirror" != "custom" ] && { set_rustup_mirror "$mirror" || continue; }; \
        rm -rf /root/.rustup /root/.cargo /tmp/rustup-init.sh; \
        if curl --proto '=https' --tlsv1.2 -sSf \
                --connect-timeout 30 --max-time 240 \
                "${RUSTUP_UPDATE_ROOT}/rustup-init.sh" -o /tmp/rustup-init.sh \
            && sh /tmp/rustup-init.sh -y --default-toolchain stable \
                --profile minimal --no-modify-path; then \
            ok=1; break; \
        fi; \
        echo ">>> [rustup] mirror ${mirror} failed, switching to next..."; \
    done; \
    [ "$ok" = "1" ] || { echo "FATAL: all rustup mirrors failed"; exit 1; }; \
    rm -f /tmp/rustup-init.sh; \
    /root/.cargo/bin/rustup --version; \
    /root/.cargo/bin/rustc --version

ENV PATH="/root/.cargo/bin:${PATH}"

# 配置 cargo 国内镜像源（sparse 协议），避免 crates.io 默认源国内拉取超时
# 默认字节 rsproxy-sparse；若 rsproxy 不可用可走 --build-arg CARGO_REGISTRY_URL=xxx 切换
# 备选：
#   sparse+https://mirrors.ustc.edu.cn/crates.io-index/
#   sparse+https://mirrors.tuna.tsinghua.edu.cn/crates.io-index/
#   sparse+https://index.crates.io/        （官方）
ARG CARGO_REGISTRY_URL=sparse+https://rsproxy.cn/index/
RUN mkdir -p /root/.cargo \
    && printf '%s\n' \
        '[source.crates-io]' \
        'replace-with = "mirror"' \
        '' \
        '[source.mirror]' \
        "registry = \"${CARGO_REGISTRY_URL}\"" \
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

# Debian 多镜像源 fallback（与 rust-builder 一致）。默认顺序：火山 → 清华 → 阿里 → 官方
ARG DEBIAN_MIRRORS="mirrors.volces.com:http mirrors.tuna.tsinghua.edu.cn:https mirrors.aliyun.com:http deb.debian.org:http"
ARG DEBIAN_MIRROR=
ARG DEBIAN_MIRROR_PROTO=https

# 系统依赖：libpq-dev 供 psycopg2 运行时；build-essential 仅在装无 wheel 的小依赖时兜底
# 说明：不在镜像内跑 apt-get upgrade。CVE 修复交由上游 python:3.14-slim-bookworm
# 镜像定期 bump tag 处理，避免不可重复构建与额外跨网依赖
# 多源 fallback：任一源装上即 break；全部失败才 exit 1，避免缓存"假成功"层
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
