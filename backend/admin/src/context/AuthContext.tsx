'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import api from '@/lib/axios';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (accessToken: string, refreshToken: string, user: User) => void;
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
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const validated = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  // Validate token once on mount
  useEffect(() => {
    if (validated.current) return;
    validated.current = true;

    const token = localStorage.getItem('access_token');

    if (!token) {
      setLoading(false);
      if (isProtectedRoute(pathname)) router.push('/admin/login');
      return;
    }

    api.get<User>('/auth/me')
      .then(({ data }) => {
        setUser(data);
        setIsAuthenticated(true);
        localStorage.setItem('user', JSON.stringify(data));
      })
      .catch(() => {
        // Token invalid / expired — clear stale session
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        if (isProtectedRoute(pathname)) router.push('/admin/login');
      })
      .finally(() => setLoading(false));
  }, [pathname, router]);

  // Guard protected routes on navigation
  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated && isProtectedRoute(pathname)) {
      router.push('/admin/login');
    }
  }, [pathname, loading, isAuthenticated, router]);

  const login = useCallback(
    (accessToken: string, refreshToken: string, userData: User) => {
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      setIsAuthenticated(true);
      router.push('/admin');
    },
    [router],
  );

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
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
