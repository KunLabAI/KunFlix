import type { NextConfig } from "next";
import path from "node:path";

// 容器化部署时通过 BACKEND_INTERNAL_URL 指向后端服务名（例如 http://backend:8000）
// 本地开发保持默认 127.0.0.1:8000
const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // 生产容器镜像使用 standalone 产物，显著减小体积与内存占用
  output: "standalone",
  // 显式指定 Turbopack 工作区根目录，避免 Next.js 向上查找时误把用户主目录下的 pnpm-lock.yaml 当作 monorepo 根
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
    proxyClientMaxBodySize: "500mb",
    // 图像编辑/视频生成等长耗时接口：代理超时提高到 10 分钟，防止前端 socket hang up
    proxyTimeout: 600000,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_INTERNAL_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
