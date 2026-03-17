/**
 * 日期时间格式化工具
 * 
 * 后端返回的时间是 UTC 时间，需要转换为本地时间显示
 */

/**
 * 将 UTC 时间字符串转换为本地 Date 对象
 * 后端返回格式: "2024-01-15T10:30:00" 或 "2024-01-15T10:30:00.123456"
 */
export function parseUTCDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  
  // 如果已经包含时区信息，直接解析
  if (dateStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr);
  }
  
  // 否则假设是 UTC 时间，添加 Z 后缀
  return new Date(`${dateStr}Z`);
}

/**
 * 格式化为本地日期时间字符串
 * 输出格式: "2024/1/15 18:30:00"
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  const date = parseUTCDate(dateStr);
  if (!date || isNaN(date.getTime())) return '-';
  
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\//g, '/');
}

/**
 * 格式化为相对时间
 * 输出格式: "5分钟前"、"2小时前"、"3天前"
 */
export function formatRelativeTime(dateStr: string | null | undefined): string {
  const date = parseUTCDate(dateStr);
  if (!date || isNaN(date.getTime())) return '-';
  
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  
  // 超过30天显示具体日期
  return formatDateTime(dateStr);
}

/**
 * 格式化为简短日期时间
 * 输出格式: "1/15 18:30"
 */
export function formatShortDateTime(dateStr: string | null | undefined): string {
  const date = parseUTCDate(dateStr);
  if (!date || isNaN(date.getTime())) return '-';
  
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * 计算任务耗时
 * 输出格式: "2分30秒"、"1小时15分"
 */
export function formatDuration(startStr: string | null | undefined, endStr: string | null | undefined): string {
  const start = parseUTCDate(startStr);
  const end = parseUTCDate(endStr);
  
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return '-';
  
  const diff = Math.abs(end.getTime() - start.getTime());
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}小时${minutes % 60}分`;
  }
  if (minutes > 0) {
    return `${minutes}分${seconds % 60}秒`;
  }
  return `${seconds}秒`;
}
