'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import api, { tokenRefresher } from '@/lib/axios';
import {
  ADMIN_TOKEN_KEY,
  ADMIN_REFRESH_KEY,
  ADMIN_USER_KEY,
  clearAdminSession,
  migrateLegacyAdminKeys,
} from '@/lib/authStorage';

// 管理员类型定义
interface Admin {
  id: string;
  email: string;
  nickname: string;
  permission_level: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface AuthContextType {
  user: Admin | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (accessToken: string, refreshToken: string, admin: Admin) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  loading: true,
  login: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

const isProtectedRoute = (path: string) => path.startsWith('/admin') && path !== '/admin/login';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Admin | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const validated = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  // Validate token once on mount
  useEffect(() => {
    if (validated.current) return;
    validated.current = true;

    // 一次性迁移：旧 access_token/refresh_token/user → admin_* 独立 key
    migrateLegacyAdminKeys();

    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) {
      setLoading(false);
      isProtectedRoute(pathname) && router.push('/admin/login');
      return;
    }

    // 注意：/admin/auth/me 若返回 401，会被 axios 响应拦截器自动 refresh + retry
    // 只有刷新也失败时才会进入 .catch，此时清理会话并跳登录
    api.get<Admin>('/admin/auth/me')
      .then(({ data }) => {
        setUser(data);
        setIsAuthenticated(true);
        localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(data));
      })
      .catch(() => {
        clearAdminSession();
        setUser(null);
        setIsAuthenticated(false);
        isProtectedRoute(pathname) && router.push('/admin/login');
      })
      .finally(() => setLoading(false));
  }, [pathname, router]);

  // Guard protected routes on navigation
  useEffect(() => {
    if (loading) return;
    !isAuthenticated && isProtectedRoute(pathname) && router.push('/admin/login');
  }, [pathname, loading, isAuthenticated, router]);

  // 主动续期：已登录时启动定时检查（<5min 自动刷新）
  useEffect(() => {
    if (!isAuthenticated) return;
    tokenRefresher.startAutoRefresh();
    return () => tokenRefresher.stopAutoRefresh();
  }, [isAuthenticated]);

  const login = useCallback(
    (accessToken: string, refreshToken: string, adminData: Admin) => {
      localStorage.setItem(ADMIN_TOKEN_KEY, accessToken);
      localStorage.setItem(ADMIN_REFRESH_KEY, refreshToken);
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(adminData));
      setUser(adminData);
      setIsAuthenticated(true);
      router.push('/admin');
    },
    [router],
  );

  const logout = useCallback(() => {
    clearAdminSession();
    setUser(null);
    setIsAuthenticated(false);
    router.push('/admin/login');
  }, [router]);

  // Show nothing while validating to prevent flash of protected content
  if (loading && isProtectedRoute(pathname)) {
    return null;
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
