'use client';

import React from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AuthProvider } from '@/context/AuthContext';
import AdminLayout from '@/components/admin/AdminLayout';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#1677ff',
          },
        }}
      >
        <AuthProvider>
          <AdminLayout>
            {children}
          </AdminLayout>
        </AuthProvider>
      </ConfigProvider>
    </AntdRegistry>
  );
}
