/**
 * URL 规范化：相对路径自动包装 /api/media/
 */
export function normalizeVideoUrl(raw: string): string {
  const needsPrefix = !!raw && !raw.startsWith('http') && !raw.startsWith('/api/media/') && !raw.startsWith('data:');
  return needsPrefix ? `/api/media/${raw}` : raw;
}
