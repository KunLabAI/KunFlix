/** @type {import('next').NextConfig} */
const nextConfig = {
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
