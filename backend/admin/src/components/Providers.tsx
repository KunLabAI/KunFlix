'use client';

import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import I18nProvider from '@/i18n/I18nProvider';

// AdminLayout 仅包裹 src/app/admin/* 路由（见 src/app/admin/layout.tsx），
// 避免根 / 重定向页面与 not-found 也错误地渲染侧边栏。
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>{children}</AuthProvider>
    </I18nProvider>
  );
}
