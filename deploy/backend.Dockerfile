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

# Debian 镜像源（国内服务器默认用清华，外网环境可通过 --build-arg DEBIAN_MIRROR= 清空覆盖）
ARG DEBIAN_MIRROR=mirrors.tuna.tsinghua.edu.cn
RUN if [ -n "$DEBIAN_MIRROR" ]; then \
      sed -i "s@deb.debian.org@${DEBIAN_MIRROR}@g; s@security.debian.org@${DEBIAN_MIRROR}@g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
    fi

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

# pip 镜像源（主：清华；备：阿里云；兜底：PyPI 官方）
# 清华单源抖动时通过 extra-index 自动回退，避免 "from versions: none" 假象
# 外网环境可通过 --build-arg PIP_INDEX_URL=https://pypi.org/simple 覆盖
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
ARG PIP_EXTRA_INDEX_URL="https://mirrors.aliyun.com/pypi/simple https://pypi.org/simple"
ARG PIP_TRUSTED_HOST="pypi.tuna.tsinghua.edu.cn mirrors.aliyun.com pypi.org files.pythonhosted.org"
ENV PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_EXTRA_INDEX_URL=${PIP_EXTRA_INDEX_URL} \
    PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST} \
    PIP_DEFAULT_TIMEOUT=120 \
    PIP_RETRIES=10

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
