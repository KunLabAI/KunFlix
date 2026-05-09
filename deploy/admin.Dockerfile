# ============================================================================
# KunFlix Admin Dashboard (Next.js standalone) - Production Image
# ----------------------------------------------------------------------------
# Build context: project root (.)
#   docker build -f deploy/admin.Dockerfile -t kunflix-admin ..
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
COPY backend/admin/package.json backend/admin/package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- Stage 2: 构建 ----------
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=4096
COPY --from=deps /app/node_modules ./node_modules
COPY backend/admin/ ./
RUN npm run build

# ---------- Stage 3: 运行 ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3888 \
    HOSTNAME=0.0.0.0

# 运行阶段同样主动升级系统包，消除基础镜像 CVE
RUN apk upgrade --no-cache

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3888

CMD ["node", "server.js"]
