"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";

export interface User {
  id: string;
  email: string;
  nickname: string;
  role: "user" | "admin";
  is_active: boolean;
  credits: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
  updateCredits: (credits: number) => void;
  refreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
  updateCredits: () => {},
  refreshToken: async () => false,
});

export const useAuth = () => useContext(AuthContext);

// 创建一个带有认证和自动刷新的fetch包装器
export function createAuthFetch(refreshToken: () => Promise<boolean>, logout: () => void) {
  let isRefreshing = false;
  let failedQueue: Array<{
    input: RequestInfo | URL;
    init?: RequestInit;
    resolve: (value: Response) => void;
    reject: (reason?: unknown) => void;
  }> = [];

  const processQueue = (success: boolean, newToken: string | null) => {
    failedQueue.forEach((p) => {
      if (success && newToken) {
        const retryHeaders = new Headers(p.init?.headers);
        retryHeaders.set("Authorization", `Bearer ${newToken}`);
        fetch(p.input, { ...p.init, headers: retryHeaders }).then(p.resolve).catch(p.reject);
      } else {
        p.reject(new Error("Token refresh failed"));
      }
    });
    failedQueue = [];
  };

  return async function authFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const token = localStorage.getItem("access_token");
    const headers = new Headers(init?.headers);
    token && headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(input, { ...init, headers });

    // 非401错误或已经是认证相关请求，直接返回
    if (response.status !== 401) return response;

    // 检查是否是认证端点
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/auth/")) return response;

    // 正在刷新中，加入队列等待
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ input, init, resolve, reject });
      });
    }

    isRefreshing = true;
    const success = await refreshToken();
    const newToken = success ? localStorage.getItem("access_token") : null;
    isRefreshing = false;
    processQueue(success, newToken);

    // 刷新成功，重试请求
    if (success && newToken) {
      const retryHeaders = new Headers(init?.headers);
      retryHeaders.set("Authorization", `Bearer ${newToken}`);
      return fetch(input, { ...init, headers: retryHeaders });
    }

    // 刷新失败，返回原始401响应
    return response;
  };
}

// Public routes that don't require authentication
const PUBLIC_ROUTES = ["/login"];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const stored = localStorage.getItem("user");
    const hasSession = token && stored;

    setIsAuthenticated(!!hasSession);
    setUser(hasSession ? JSON.parse(stored) : null);

    // Redirect unauthenticated users from protected routes
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    if (!hasSession && !isPublic) {
      router.push("/login");
    }
  }, [pathname, router]);

  const login = useCallback(
    (accessToken: string, refreshToken: string, userData: User) => {
      localStorage.setItem("access_token", accessToken);
      localStorage.setItem("refresh_token", refreshToken);
      localStorage.setItem("user", JSON.stringify(userData));
      setUser(userData);
      setIsAuthenticated(true);
      router.push("/");
    },
    [router]
  );

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    setUser(null);
    setIsAuthenticated(false);
    router.push("/login");
  }, [router]);

  const updateCredits = useCallback((credits: number) => {
    setUser((prev) => {
      const updated = prev ? { ...prev, credits } : prev;
      updated && localStorage.setItem("user", JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Token刷新方法：供fetch请求使用
  const refreshToken = useCallback(async (): Promise<boolean> => {
    const storedRefreshToken = localStorage.getItem("refresh_token");
    if (!storedRefreshToken) {
      logout();
      return false;
    }

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
      const response = await fetch(`${apiBase}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: storedRefreshToken }),
      });

      if (!response.ok) {
        logout();
        return false;
      }

      const data = await response.json();
      localStorage.setItem("access_token", data.access_token);
      return true;
    } catch {
      logout();
      return false;
    }
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, logout, updateCredits, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
};
