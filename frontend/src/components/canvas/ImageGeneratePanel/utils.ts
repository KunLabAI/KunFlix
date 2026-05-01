import type { CanvasNode, CharacterNodeData } from '@/store/useCanvasStore';

/** URL 规范化：相对路径自动包装 /api/media/ 前缀 */
export function normalizeImageUrl(raw: string): string {
  const needsPrefix = !!raw && !raw.startsWith('http') && !raw.startsWith('/api/media/') && !raw.startsWith('data:');
  return needsPrefix ? `/api/media/${raw}` : raw;
}

/** 从画布图像节点提取图片 URL（已规范化） */
export function getImageNodeUrl(node: CanvasNode): string | null {
  const data = node.data as CharacterNodeData;
  const raw: string | null = (data.images && data.images[0]) || data.imageUrl || null;
  return raw ? normalizeImageUrl(raw) : null;
}
