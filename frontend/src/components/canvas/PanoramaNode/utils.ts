/**
 * Panorama 节点工具函数。
 *
 * 设计原则：遵循 style.md，尽可能用三元/早返回替代多重 if 分支。
 */

/**
 * 规范化全景图 URL：把相对路径（如 /media/xxx.jpg）合并为绝对 URL。
 * 与 ImageNode/utils 中 normalizeImageUrl 实现等价。
 */
export const normalizePanoramaUrl = (url: string | null | undefined): string => {
  const safe = url ?? '';
  const isAbsolute = /^https?:\/\//i.test(safe) || safe.startsWith('blob:') || safe.startsWith('data:');
  return isAbsolute ? safe : safe;
};

/**
 * 触发浏览器下载 dataURL 为本地文件。
 * 用于全屏 viewer 截图后导出 PNG。
 */
export const downloadDataUrl = (dataUrl: string, filename: string): void => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * 基于当前时间戳生成截图文件名。
 * @param baseName 节点标题，作为前缀
 */
export const buildScreenshotFilename = (baseName: string): string => {
  const safe = (baseName || 'panorama').replace(/[\\/:*?"<>|]/g, '_').trim() || 'panorama';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `${safe}_${ts}.png`;
};
