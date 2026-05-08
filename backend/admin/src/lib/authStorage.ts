/**
 * Admin 端 localStorage 键名常量。
 *
 * 使用独立前缀（admin_*）避免与主前端在同域下互相覆盖。
 * 首次挂载时会调用 migrateLegacyKeys() 把旧 key 的值迁移过来，然后清掉旧 key。
 */

export const ADMIN_TOKEN_KEY = "admin_access_token";
export const ADMIN_REFRESH_KEY = "admin_refresh_token";
export const ADMIN_USER_KEY = "admin_user";

export const ADMIN_REFRESH_LOCK_KEY = "admin_auth:refresh:lock";
export const ADMIN_REFRESH_CHANNEL = "kunflix_admin_auth_refresh";

const LEGACY_KEYS = ["access_token", "refresh_token", "user"] as const;
const NEW_KEYS = [ADMIN_TOKEN_KEY, ADMIN_REFRESH_KEY, ADMIN_USER_KEY] as const;

/** 一次性迁移：若旧 key 存在且新 key 不存在，搬过来；随后清理旧 key，防止主站覆盖。 */
export function migrateLegacyAdminKeys(): void {
  if (typeof window === "undefined") return;
  LEGACY_KEYS.forEach((legacy, idx) => {
    const legacyVal = localStorage.getItem(legacy);
    const newKey = NEW_KEYS[idx];
    const newVal = localStorage.getItem(newKey);
    legacyVal && !newVal && localStorage.setItem(newKey, legacyVal);
    // 无论是否已迁移，都清掉旧 key，避免主站登录覆盖
    legacyVal && localStorage.removeItem(legacy);
  });
}

export function clearAdminSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_REFRESH_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
}
