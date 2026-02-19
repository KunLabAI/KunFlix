import React from 'react';
import Providers from '@/components/Providers';
import './globals.css';

export const metadata = {
  title: '无限游戏后台管理',
  description: '后台管理系统',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
