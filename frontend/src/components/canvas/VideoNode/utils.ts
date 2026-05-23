/**
 * URL 规范化：相对路径自动包装 /api/media/
 */
export function normalizeVideoUrl(raw: string): string {
  const needsPrefix = !!raw && !raw.startsWith('http') && !raw.startsWith('/api/media/') && !raw.startsWith('data:');
  return needsPrefix ? `/api/media/${raw}` : raw;
}

/**
 * 由视频 URL 派生 poster（首帧封面）URL：
 *   /api/media/<uuid>.mp4  →  /api/media/poster/<uuid>.mp4
 *
 * - 仅对本地媒体（/api/media/ 前缀）生效；外部 URL / data URL / 空字符串返回 null
 * - 后端 /api/media/poster/{filename} 端点会按需生成 .jpg 缩略封面并缓存
 */
export function deriveVideoPosterUrl(videoUrl: string | undefined | null): string | undefined {
  const raw = (videoUrl || '').trim();
  const isLocalMedia = raw.startsWith('/api/media/') && !raw.startsWith('/api/media/poster/');
  return isLocalMedia ? raw.replace('/api/media/', '/api/media/poster/') : undefined;
}
