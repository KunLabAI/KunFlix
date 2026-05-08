# ============================================================================
# KunFlix Frontend (Next.js standalone) - Production Image
# ----------------------------------------------------------------------------
# Build context: project root (.)
#   docker build -f deploy/frontend.Dockerfile -t kunflix-frontend ..
# ============================================================================

# ---------- Stage 1: 安装依赖 ----------
# 使用 node:22-alpine（当前 Active LTS）以规避 node:20-alpine 镜像层的已知 CVE
FROM node:22-alpine AS deps
WORKDIR /app
# 主动升级 alpine 包以吸纳上游已发布的安全补丁
RUN apk upgrade --no-cache \
    && apk add --no-cache libc6-compat
# npm 镜像源（国内服务器默认用 npmmirror，外网环境可 --build-arg NPM_REGISTRY=https://registry.npmjs.org 覆盖）
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm config set registry ${NPM_REGISTRY} \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000
COPY frontend/package.json frontend/package-lock.json ./
# Workaround npm#4828: Windows 生成的 package-lock.json 只记录 win32 平台的 optional
# native 依赖 (@tailwindcss/oxide/lightningcss/@next/swc/sharp...),Alpine 下 npm ci
# 无法补齐 linux-x64-musl 对应二进制导致 build 崩溃。按 npm 官方提示删除 lock 后改用
# npm install,让当前平台按 package.json 重新 resolve 出对应的 optional native 依赖。
RUN rm -f package-lock.json \
    && npm install --no-audit --no-fund

# ---------- Stage 2: 构建 ----------
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./
RUN npm run build

# ---------- Stage 3: 运行 ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3666 \
    HOSTNAME=0.0.0.0

# 运行阶段同样主动升级系统包，消除基础镜像 CVE
RUN apk upgrade --no-cache

# 非 root 运行
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3666

CMD ["node", "server.js"]
