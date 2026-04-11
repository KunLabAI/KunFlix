import React from 'react';
import Providers from '@/components/Providers';
import './globals.css';

export const metadata = {
  title: 'KunFlix Admin',
  description: 'KunFlix Admin Management Interface',
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
