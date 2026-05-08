# ============================================================================
# KunFlix Backend (FastAPI + uvicorn) - Production Image
# ----------------------------------------------------------------------------
# Build context: project root (.)
#   docker build -f deploy/backend.Dockerfile -t kunflix-backend ..
# ============================================================================
# 使用 python:3.12-slim-bookworm（Debian 12）以规避 python:3.11-slim 镜像层的已知 CVE
FROM python:3.12-slim-bookworm AS base

ENV PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TZ=Asia/Shanghai

# 系统依赖：libpq-dev 供 psycopg2 编译；build-essential 为可选 C 扩展兜底
# 同步执行 apt-get upgrade 拉取上游已发布的安全补丁，降低基础镜像 CVE 告警
RUN apt-get update \
    && apt-get -y upgrade \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
        tini \
    && apt-get -y autoremove \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app

# 先拷依赖清单以充分利用构建缓存
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --upgrade pip \
    && pip install -r /app/requirements.txt

# 再拷贝项目代码
COPY backend/ /app/

# 非 root 用户运行；预建 media 目录并授权
RUN useradd -m -u 1000 app \
    && mkdir -p /app/media \
    && chown -R app:app /app
USER app

EXPOSE 8000

# tini 作为 PID 1 负责信号转发与僵尸回收；uvicorn 单进程（2C4G 推荐）
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--proxy-headers", \
     "--forwarded-allow-ips=*"]
