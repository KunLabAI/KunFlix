import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  ADMIN_TOKEN_KEY,
  ADMIN_REFRESH_KEY,
  ADMIN_REFRESH_LOCK_KEY,
  ADMIN_REFRESH_CHANNEL,
  clearAdminSession,
} from '@/lib/authStorage';
import { createTokenRefresh } from '@/lib/tokenRefresh';

// 生产部署走同源 Nginx 反向代理：浏览器请求 /api/* 由 Nginx 转发到 backend:8000
// 开发环境可通过 NEXT_PUBLIC_API_URL 指向本地后端；未设置时走相对路径 /api
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 只有这三个端点不触发自动刷新；注意必须放行 /admin/auth/me，否则初始校验失败会直接登出
const NO_REFRESH_PATHS = ['/admin/auth/login', '/admin/auth/refresh', '/admin/auth/logout'];

const redirectToLogin = () => {
  if (typeof window === 'undefined') return;
  clearAdminSession();
  // 避免在 /admin/login 重复跳转造成循环
  const onLoginPage = window.location.pathname === '/admin/login';
  onLoginPage || (window.location.href = '/admin/login');
};

// 跨页签 Token 刷新协调器（admin 专属 key 与 channel）
export const tokenRefresher = createTokenRefresh({
  tokenKey: ADMIN_TOKEN_KEY,
  refreshKey: ADMIN_REFRESH_KEY,
  lockKey: ADMIN_REFRESH_LOCK_KEY,
  channelName: ADMIN_REFRESH_CHANNEL,
  doRefresh: async (refreshToken) => {
    // 使用裸 axios 避免走响应拦截器造成递归
    const { data } = await axios.post(`${API_BASE}/admin/auth/refresh`, {
      refresh_token: refreshToken,
    });
    return data;
  },
  onRefreshFailure: redirectToLogin,
});

// Request interceptor: attach Authorization header
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem(ADMIN_TOKEN_KEY);
      token && config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: handle 401 with token refresh (cross-tab coordinated)
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (typeof window === 'undefined') return Promise.reject(error);

    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    if (!originalRequest) return Promise.reject(error);

    const url = originalRequest.url || '';
    const isNoRefresh = NO_REFRESH_PATHS.some((p) => url.includes(p));
    const shouldRefresh =
      error.response?.status === 401 && !isNoRefresh && !originalRequest._retry;
    if (!shouldRefresh) return Promise.reject(error);

    originalRequest._retry = true;
    const result = await tokenRefresher.refresh();
    if (!result.ok) return Promise.reject(error);

    originalRequest.headers.set('Authorization', `Bearer ${result.accessToken}`);
    return api(originalRequest);
  },
);

export default api;
