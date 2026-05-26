/** @type {import('next').NextConfig} */

// 容器化部署时通过 BACKEND_INTERNAL_URL 指向后端服务名（例如 http://backend:8000）
const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8000';

const nextConfig = {
  // 生产容器镜像使用 standalone 产物，显著减小体积与内存占用
  output: 'standalone',
  // Admin 挂在 /admin 子路径下对外暴露
  basePath: '/admin',
  assetPrefix: '/admin',
  async rewrites() {
    // basePath: false 避免 /admin 前缀被自动应用到 source，
    // 使浏览器对 http://localhost:3888/api/* 的请求能正确代理到后端。
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_INTERNAL_URL}/api/:path*`, // Proxy to Backend
        basePath: false,
      },
    ]
  },
  // basePath=/admin 下，根路径 / 不在 Next.js 路由表内，直接 404。
  // 通过 redirects + basePath: false 让 / 跳到 /admin，由 src/app/page.tsx 接力跳到仪表盘。
  async redirects() {
    return [
      {
        source: '/',
        destination: '/admin',
        basePath: false,
        permanent: false,
      },
    ]
  },
};

module.exports = nextConfig;
