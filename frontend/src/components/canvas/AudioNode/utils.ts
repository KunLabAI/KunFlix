/**
 * URL 规范化：相对路径自动包装 /api/media/
 */
export function normalizeAudioUrl(raw: string): string {
  const needsPrefix = !!raw && !raw.startsWith('http') && !raw.startsWith('/api/media/') && !raw.startsWith('data:') && !raw.startsWith('blob:');
  return needsPrefix ? `/api/media/${raw}` : raw;
}

/**
 * 根据 audio URL 推断输出格式。
 */
export function inferAudioFormat(url: string): 'mp3' | 'wav' {
  const lower = (url || '').toLowerCase();
  return lower.endsWith('.wav') ? 'wav' : 'mp3';
}
