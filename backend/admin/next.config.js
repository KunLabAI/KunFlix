/** @type {import('next').NextConfig} */
const path = require('node:path');

const nextConfig = {
  // 显式指定 Turbopack 工作区根目录，避免误识别用户主目录下的 pnpm-lock.yaml
  turbopack: {
    root: path.resolve(__dirname),
  },
  transpilePackages: ['@ant-design/icons', 'antd'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*', // Proxy to Backend
      },
    ]
  },
};

module.exports = nextConfig;
