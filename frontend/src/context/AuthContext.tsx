"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import api, { tokenRefresher } from "@/lib/api";

export interface User {
  id: string;
  email: string;
  nickname: string;
  role: "user" | "admin";
  is_active: boolean;
  credits: number;
  total_input_tokens: number;
  total_output_tokens: number;
  // 存储空间
  storage_used_bytes: number;
  storage_quota_bytes: number;
  // 订阅信息
  subscription_status: 'inactive' | 'active' | 'expired';
  subscription_plan_id?: string | null;
  subscription_plan_name?: string | null;        // 后端 join 出的套餐名，前端展示优先级最高
  subscription_tier_type?: 'free_tier' | 'paid' | null;  // 标签着色依据
  // 用户偏好
  preferred_theme?: string;
  preferred_language?: string;
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
  // 标识客户端是否已完成首次挂载与 localStorage 同步。
  // SSR 阶段为 false；客户端首帧同步去一次 storage 后置 true。
  // 需要 “SSR/CSR 严格一致” 的消费方（将来可自选等到 hydrate 后再条件渲染）。
  isHydrated: boolean;
  login: (accessToken: string, refreshToken: string, user: User, redirect?: string) => void;
  logout: () => void;
  updateCredits: (credits: number) => void;
  refreshToken: () => Promise<boolean>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isHydrated: false,
  login: () => {},
  logout: () => {},
  updateCredits: () => {},
  refreshToken: async () => false,
  refreshUser: async () => null,
});

export const useAuth = () => useContext(AuthContext);

// 同步读取 localStorage 中的登录态；SSR 环境返回默认值（避免 ReferenceError）。
// 用于 useState 的惰性初始化：让客户端首次渲染即携带真实登录态，
// 消除 “未登录 → 已登录” 的二次渲染闪烁。
function readStoredAuth(): { user: User | null; isAuthenticated: boolean } {
  if (typeof window === "undefined") return { user: null, isAuthenticated: false };
  const token = localStorage.getItem("access_token");
  const stored = localStorage.getItem("user");
  if (!token || !stored) return { user: null, isAuthenticated: false };
  try {
    return { user: JSON.parse(stored) as User, isAuthenticated: true };
  } catch {
    return { user: null, isAuthenticated: false };
  }
}

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
// "/" 对游客开放首页（社区剧场未开放状态 + 近期剧场登录占位）
const PUBLIC_ROUTES = ["/", "/login"];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // 初始状态保持与 SSR 一致（null/false），避免惰性初始化产生 SSR↔CSR 节点差异。
  // 真实登录态在 useEffect 中同步读取并点亮 isHydrated；
  // 身份敏感的消费组件（如 TopBar / RecentTheaters）需依据 isHydrated 调整首帧渲染，
  // 以及“默认按已登录视图”的策略来消除闪烁。
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // 客户端首次挂载：同步读取 localStorage，点亮 isHydrated，走路由守卫。
    const { user: u, isAuthenticated: auth } = readStoredAuth();
    setUser(u);
    setIsAuthenticated(auth);
    setIsHydrated(true);

    const isPublic = PUBLIC_ROUTES.includes(pathname);
    !auth && !isPublic && router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
  }, [pathname, router]);

  // 从后端拉取最新用户信息并同步到 state + localStorage，
  // 避免后台管理员改了积分/订阅后前端因缓存不更新。
  const refreshUser = useCallback(async (): Promise<User | null> => {
    const token = typeof window !== "undefined" && localStorage.getItem("access_token");
    if (!token) return null;
    try {
      const { data } = await api.get<User>("/auth/me");
      localStorage.setItem("user", JSON.stringify(data));
      setUser(data);
      setIsAuthenticated(true);
      return data;
    } catch {
      return null;
    }
  }, []);

  // 挂载后若已登录，静默拉一次 /auth/me，保证积分、订阅等字段与服务端一致。
  useEffect(() => {
    if (!isAuthenticated) return;
    refreshUser();
  }, [isAuthenticated, refreshUser]);

  // 主动续期：access_token 剩余 < 5 分钟时触发刷新（与跨页签锁共用）
  useEffect(() => {
    if (!isAuthenticated) return;
    tokenRefresher.startAutoRefresh();
    return () => tokenRefresher.stopAutoRefresh();
  }, [isAuthenticated]);

  const login = useCallback(
    (accessToken: string, refreshToken: string, userData: User, redirect?: string) => {
      localStorage.setItem("access_token", accessToken);
      localStorage.setItem("refresh_token", refreshToken);
      localStorage.setItem("user", JSON.stringify(userData));
      setUser(userData);
      setIsAuthenticated(true);
      router.push(redirect || "/");
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

  // Token刷新方法：统一走跨页签协调器，避免多 tab 并发刷新互相拉黑
  const refreshToken = useCallback(async (): Promise<boolean> => {
    const result = await tokenRefresher.refresh();
    if (!result.ok) {
      logout();
      return false;
    }
    return true;
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isHydrated, login, logout, updateCredits, refreshToken, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
