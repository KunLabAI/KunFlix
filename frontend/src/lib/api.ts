import axios from "axios";
import { createTokenRefresh } from "./tokenRefresh";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// Attach Authorization header
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`);
    }
  }
  return config;
});

// 跨页签刷新协调器：避免多页签并发刷新导致的旧 refresh_token 入黑名单后互相踢下线
export const tokenRefresher = createTokenRefresh({
  tokenKey: "access_token",
  refreshKey: "refresh_token",
  lockKey: "auth:refresh:lock",
  channelName: "kunflix_auth_refresh",
  doRefresh: async (refreshToken) => {
    const { data } = await axios.post("/api/auth/refresh", {
      refresh_token: refreshToken,
    });
    return data;
  },
  onRefreshFailure: () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
  },
});

// 仅以下 auth 端点不走自动刷新；/auth/me 等仍需要刷新流程
const NO_REFRESH_AUTH_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout", "/auth/register"];

const isNoRefreshAuth = (url: string | undefined): boolean => {
  if (!url) return false;
  return NO_REFRESH_AUTH_PATHS.some((p) => url.includes(p));
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (typeof window === "undefined") {
      return Promise.reject(error);
    }
    const original = error.config;

    if (error.response?.status !== 401 || isNoRefreshAuth(original?.url) || original?._retry) {
      return Promise.reject(error);
    }

    original._retry = true;
    const result = await tokenRefresher.refresh();
    if (!result.ok) {
      // 最终失败：跳转登录
      window.location.href = "/login";
      return Promise.reject(error);
    }
    original.headers.set("Authorization", `Bearer ${result.accessToken}`);
    return api(original);
  }
);

export default api;
