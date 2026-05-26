'use client';

import React from 'react';
import AdminLayout from '@/components/admin/AdminLayout';

// admin 段布局：仅包裹实际 URL 为 /admin/admin/* 的路由（含登录页）。
// 这样根重定向页面 (src/app/page.tsx) 与 not-found 页面不会被 AdminLayout 包裹，
// 避免 404 页面错误地渲染侧边栏。
export default function AdminSegmentLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
