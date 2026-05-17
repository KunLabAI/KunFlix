import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Admin 挂在 /admin 子路径下（与 next.config.js 的 basePath/assetPrefix 保持一致）。
// Next.js 对 <Image>/<Link> 会自动拼接前缀，但裸字符串路径（如 <img src> 、Avatar src）
// 不会自动处理，需手动调用 withBasePath() 拼接。
export const BASE_PATH = '/admin';
export const withBasePath = (path: string) => `${BASE_PATH}${path}`;
