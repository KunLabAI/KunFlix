# ============================================================================
# KunFlix Admin Dashboard (Next.js standalone) - Production Image
# ----------------------------------------------------------------------------
# Build context: project root (.)
#   docker build -f deploy/admin.Dockerfile -t kunflix-admin ..
# ============================================================================

# ---------- Stage 1: 安装依赖 ----------
# 使用 node:22-alpine（当前 Active LTS）以规避 node:20-alpine 镜像层的已知 CVE
FROM node:26-alpine AS deps
WORKDIR /app
# 不在镜像内跑 apk upgrade：CVE 修复交由上游 node:26-alpine 镜像定期 bump tag 处理，
# 避免不可重复构建与额外跨网依赖
RUN apk add --no-cache libc6-compat
# npm 镜像源（国内服务器默认用 npmmirror，外网环境可 --build-arg NPM_REGISTRY=https://registry.npmjs.org 覆盖）
ARG NPM_REGISTRY=https://registry.npmmirror.com
RUN npm config set registry ${NPM_REGISTRY} \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000
COPY backend/admin/package.json backend/admin/package-lock.json ./
# --include=optional 显式保证 lightningcss 等平台依赖的 native .node 被安装
RUN npm ci --no-audit --no-fund --legacy-peer-deps --include=optional

# ---------- Stage 2: 构建 ----------
FROM node:26-alpine AS build
WORKDIR /app
# BACKEND_INTERNAL_URL 必须在构建期可用：Next.js rewrites() 在 build 时序列化到路由清单，
# standalone 产物中不会再次读取运行时环境变量来解析 rewrite destination。
ARG BACKEND_INTERNAL_URL=http://backend:8000
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=4096 \
    BACKEND_INTERNAL_URL=${BACKEND_INTERNAL_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY backend/admin/ ./
RUN npm run build

# ---------- Stage 3: 运行 ----------
FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3888 \
    HOSTNAME=0.0.0.0

# 运行阶段不跑 apk upgrade：CVE 交由上游 base 镜像 bump tag 统一处理

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3888

CMD ["node", "server.js"]
