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

// 注意：access_token / refresh_token / user 这三个 key 也是【主前端】在用的活跃 key。
// 所以迁移函数绝对不能删除它们，否则会把主前端的会话清掉。
const LEGACY_KEYS = ["access_token", "refresh_token", "user"] as const;
const NEW_KEYS = [ADMIN_TOKEN_KEY, ADMIN_REFRESH_KEY, ADMIN_USER_KEY] as const;
const MIGRATION_FLAG_KEY = "admin_legacy_migrated";

/**
 * 一次性迁移：仅当新 admin_* key 为空且旧 key 存在时，把值复制一份到新 key。
 * - 绝不删除旧 key（主前端仍在使用）
 * - 通过 MIGRATION_FLAG_KEY 确保只运行一次，避免反复覆盖
 * - 对非 admin 用户：即使复制过去，/admin/auth/me 会判定 token 无效并跳登录，无副作用
 */
export function migrateLegacyAdminKeys(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATION_FLAG_KEY) === "1") return;

  LEGACY_KEYS.forEach((legacy, idx) => {
    const legacyVal = localStorage.getItem(legacy);
    const newKey = NEW_KEYS[idx];
    const newVal = localStorage.getItem(newKey);
    legacyVal && !newVal && localStorage.setItem(newKey, legacyVal);
  });

  localStorage.setItem(MIGRATION_FLAG_KEY, "1");
}

export function clearAdminSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_REFRESH_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
}
