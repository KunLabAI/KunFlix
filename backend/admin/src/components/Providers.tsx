'use client';

import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import AdminLayout from '@/components/admin/AdminLayout';
import I18nProvider from '@/i18n/I18nProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <AdminLayout>
          {children}
        </AdminLayout>
      </AuthProvider>
    </I18nProvider>
  );
}
