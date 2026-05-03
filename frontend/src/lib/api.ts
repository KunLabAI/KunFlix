import axios from "axios";

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

// Handle 401 with token refresh (with request queuing)
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (v: unknown) => void;
  reject: (r?: unknown) => void;
}> = [];

const processQueue = (err: unknown, token: string | null = null) => {
  failedQueue.forEach((p) => (token ? p.resolve(token) : p.reject(err)));
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (typeof window === "undefined") {
      return Promise.reject(error);
    }
    const original = error.config;
    const isAuthRoute = original?.url?.startsWith("/auth/");

    if (error.response?.status !== 401 || isAuthRoute || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.set("Authorization", `Bearer ${token}`);
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      isRefreshing = false;
      localStorage.clear();
      window.location.href = "/login";
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post("/api/auth/refresh", {
        refresh_token: refreshToken,
      });
      localStorage.setItem("access_token", data.access_token);
      // 后端采用一次性轮换：必须同步写回新的 refresh_token，否则下次刷新必挂
      data.refresh_token && localStorage.setItem("refresh_token", data.refresh_token);
      original.headers.set("Authorization", `Bearer ${data.access_token}`);
      processQueue(null, data.access_token);
      return api(original);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      localStorage.clear();
      window.location.href = "/login";
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
