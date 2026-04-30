import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
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
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
