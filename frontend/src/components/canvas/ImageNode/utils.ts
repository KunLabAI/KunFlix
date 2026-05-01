/**
 * 根据图片数量计算网格布局
 * - 1 张：单宫
 * - 3 张特殊：第一张占整行，后两张各半
 */
export function getGridLayout(count: number): { cols: number; rows: number; spans?: number[][] } {
  const map: Record<number, { cols: number; rows: number; spans?: number[][] }> = {
    0: { cols: 1, rows: 1 },
    1: { cols: 1, rows: 1 },
    2: { cols: 2, rows: 1 },
    3: { cols: 2, rows: 2, spans: [[0, 2], [1, 1], [1, 1]] },
    4: { cols: 2, rows: 2 },
    5: { cols: 3, rows: 2 },
    6: { cols: 3, rows: 2 },
  };
  return map[count] ?? { cols: 3, rows: 3 };
}

/**
 * URL 规范化：相对路径自动包装 /api/media/
 */
export function normalizeImageUrl(raw: string): string {
  const needsPrefix = !!raw && !raw.startsWith('http') && !raw.startsWith('/api/media/') && !raw.startsWith('data:');
  return needsPrefix ? `/api/media/${raw}` : raw;
}
