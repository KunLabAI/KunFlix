/**
 * 媒体 URL 改写工具：将本地媒体路径改写为缩略图路径，供首页/列表/资产库等小图场景使用。
 *
 * /api/media/abc.png      → /api/media/thumb/abc.png
 * /api/media/thumb/x.png  → 原样
 * https://cdn.x/y.png     → 原样
 * ""                      → 原样
 *
 * 与 backend/services/media_utils.py 的 to_thumb_url 行为保持一致。
 */
const MEDIA_URL_PREFIX = "/api/media/";
const THUMB_URL_PREFIX = "/api/media/thumb/";

// 表驱动改写器，避免 if 分支
const REWRITERS: Record<string, (u: string) => string> = {
  "true,false": (u) => THUMB_URL_PREFIX + u.slice(MEDIA_URL_PREFIX.length),
  "true,true":  (u) => u,
  "false,false": (u) => u,
};

export function toThumbUrl(url: string | null | undefined): string {
  const safe = url ?? "";
  const isMedia = safe.startsWith(MEDIA_URL_PREFIX);
  const isThumb = safe.startsWith(THUMB_URL_PREFIX);
  return REWRITERS[`${isMedia},${isThumb}`](safe);
}
