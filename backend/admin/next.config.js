/** @type {import('next').NextConfig} */
const path = require('node:path');

// 容器化部署时通过 BACKEND_INTERNAL_URL 指向后端服务名（例如 http://backend:8000）
const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8000';

const nextConfig = {
  // 生产容器镜像使用 standalone 产物，显著减小体积与内存占用
  output: 'standalone',
  // Admin 挂在 /admin 子路径下对外暴露
  basePath: '/admin',
  assetPrefix: '/admin',
  // 显式指定 Turbopack 工作区根目录，避免误识别用户主目录下的 pnpm-lock.yaml
  turbopack: {
    root: path.resolve(__dirname),
  },
  transpilePackages: ['@ant-design/icons', 'antd'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_INTERNAL_URL}/api/:path*`, // Proxy to Backend
      },
    ]
  },
};

module.exports = nextConfig;
