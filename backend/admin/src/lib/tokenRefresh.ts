/**
 * 跨页签 Token 刷新协调器（Admin 端）
 *
 * 与主前端 frontend/src/lib/tokenRefresh.ts 逻辑一致，但使用 admin 专属的
 * localStorage key、锁 key 与 BroadcastChannel 名，避免与主站混淆。
 */

export type RefreshResult =
  | { ok: true; accessToken: string }
  | { ok: false };

export interface TokenRefreshConfig {
  tokenKey: string;
  refreshKey: string;
  lockKey: string;
  channelName: string;
  doRefresh: (
    refreshToken: string
  ) => Promise<{ access_token: string; refresh_token?: string } | null>;
  onRefreshFailure?: () => void;
}

const LOCK_TTL_MS = 10_000;
const PEER_WAIT_MS = LOCK_TTL_MS + 2_000;
const PROACTIVE_WINDOW_MS = 5 * 60 * 1000;
const PROACTIVE_INTERVAL_MS = 60_000;

export interface TokenRefreshApi {
  refresh: () => Promise<RefreshResult>;
  startAutoRefresh: () => void;
  stopAutoRefresh: () => void;
}

export function createTokenRefresh(config: TokenRefreshConfig): TokenRefreshApi {
  let pending: Promise<RefreshResult> | null = null;
  let channel: BroadcastChannel | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const getChannel = (): BroadcastChannel | null => {
    if (typeof window === "undefined") return null;
    if (typeof BroadcastChannel === "undefined") return null;
    channel || (channel = new BroadcastChannel(config.channelName));
    return channel;
  };

  const now = () => Date.now();

  const acquireLock = (): boolean => {
    const stamp = `${now()}:${Math.random().toString(36).slice(2, 10)}`;
    const existing = localStorage.getItem(config.lockKey);
    const existingTs = existing ? parseInt(existing.split(":")[0], 10) : 0;
    const stale = !existing || !Number.isFinite(existingTs) || now() - existingTs > LOCK_TTL_MS;
    if (!stale) return false;
    localStorage.setItem(config.lockKey, stamp);
    return localStorage.getItem(config.lockKey) === stamp;
  };

  const releaseLock = () => {
    localStorage.removeItem(config.lockKey);
  };

  const broadcast = (msg: Record<string, unknown>) => {
    try {
      getChannel()?.postMessage(msg);
    } catch {
      /* no-op */
    }
  };

  const waitForPeer = (): Promise<RefreshResult> => {
    return new Promise((resolve) => {
      const ch = getChannel();
      let done = false;
      let fallbackPollId: ReturnType<typeof setInterval> | null = null;

      const finish = (r: RefreshResult) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        ch?.removeEventListener("message", onMessage);
        fallbackPollId !== null && clearInterval(fallbackPollId);
        resolve(r);
      };

      const timer = setTimeout(() => {
        const token = localStorage.getItem(config.tokenKey);
        finish(token ? { ok: true, accessToken: token } : { ok: false });
      }, PEER_WAIT_MS);

      const onMessage = (e: MessageEvent) => {
        const data = e.data as { type?: string; accessToken?: string } | null;
        if (!data || typeof data !== "object") return;
        const handlers: Record<string, () => void> = {
          "refresh:success": () => {
            const token = data.accessToken || localStorage.getItem(config.tokenKey) || "";
            finish(token ? { ok: true, accessToken: token } : { ok: false });
          },
          "refresh:fail": () => finish({ ok: false }),
        };
        handlers[data.type || ""]?.();
      };

      ch?.addEventListener("message", onMessage);

      if (!ch) {
        const originalToken = localStorage.getItem(config.tokenKey);
        fallbackPollId = setInterval(() => {
          const lock = localStorage.getItem(config.lockKey);
          const token = localStorage.getItem(config.tokenKey);
          if (!lock && token && token !== originalToken) {
            finish({ ok: true, accessToken: token });
          }
        }, 200);
      }
    });
  };

  const runRefresh = async (): Promise<RefreshResult> => {
    if (typeof window === "undefined") return { ok: false };
    if (pending) return pending;

    pending = (async () => {
      const refreshToken = localStorage.getItem(config.refreshKey);
      if (!refreshToken) {
        config.onRefreshFailure?.();
        return { ok: false } as RefreshResult;
      }

      const isLeader = acquireLock();
      if (!isLeader) {
        const peer = await waitForPeer();
        if (peer.ok) return peer;
      }

      try {
        const data = await config.doRefresh(refreshToken);
        if (!data || !data.access_token) {
          broadcast({ type: "refresh:fail" });
          config.onRefreshFailure?.();
          return { ok: false } as RefreshResult;
        }
        localStorage.setItem(config.tokenKey, data.access_token);
        data.refresh_token && localStorage.setItem(config.refreshKey, data.refresh_token);
        broadcast({ type: "refresh:success", accessToken: data.access_token });
        return { ok: true, accessToken: data.access_token } as RefreshResult;
      } catch {
        broadcast({ type: "refresh:fail" });
        config.onRefreshFailure?.();
        return { ok: false } as RefreshResult;
      } finally {
        releaseLock();
      }
    })();

    try {
      return await pending;
    } finally {
      pending = null;
    }
  };

  const parseExpMs = (token: string): number => {
    try {
      const parts = token.split(".");
      if (parts.length < 2) return 0;
      const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const decoded = JSON.parse(
        typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("utf-8")
      ) as { exp?: number };
      return typeof decoded.exp === "number" ? decoded.exp * 1000 : 0;
    } catch {
      return 0;
    }
  };

  const maybeProactiveRefresh = async () => {
    const token = localStorage.getItem(config.tokenKey);
    if (!token) return;
    const expMs = parseExpMs(token);
    if (!expMs) return;
    const remaining = expMs - now();
    remaining > 0 && remaining < PROACTIVE_WINDOW_MS && (await runRefresh());
  };

  const startAutoRefresh = () => {
    if (typeof window === "undefined" || intervalId !== null) return;
    intervalId = setInterval(() => {
      void maybeProactiveRefresh();
    }, PROACTIVE_INTERVAL_MS);
  };

  const stopAutoRefresh = () => {
    intervalId !== null && clearInterval(intervalId);
    intervalId = null;
  };

  return { refresh: runRefresh, startAutoRefresh, stopAutoRefresh };
}
