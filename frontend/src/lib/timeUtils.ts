import { TheaterResponse } from "./theaterApi";

/**
 * 获取剧本的有效时间：优先使用 updated_at，若为空则使用 created_at
 */
export function getEffectiveTime(theater: Pick<TheaterResponse, 'created_at' | 'updated_at'>): string {
  return theater.updated_at || theater.created_at;
}

/**
 * 将时间转换为“刚刚”、“X分钟前”等标签
 */
export function formatTimeAgo(dateString: string, now: Date = new Date()): string {
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return "刚刚";
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}分钟前`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}小时前`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays}天前`;
  }
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths}个月前`;
  }
  
  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears}年前`;
}

/**
 * 按“最后编辑时间倒序”对剧场列表进行排序
 * 注意：实际业务中前端不再做二次排序，与后端分页保持一致。
 * 此函数主要用于验证排序逻辑是否正确。
 */
export function sortTheatersByEffectiveTime(theaters: Pick<TheaterResponse, 'id' | 'created_at' | 'updated_at'>[]): Pick<TheaterResponse, 'id' | 'created_at' | 'updated_at'>[] {
  return [...theaters].sort((a, b) => {
    const timeA = new Date(getEffectiveTime(a)).getTime();
    const timeB = new Date(getEffectiveTime(b)).getTime();
    return timeB - timeA; // 倒序
  });
}
