import type { CanvasNode, CharacterNodeData } from '@/store/useCanvasStore';
import { LYRIA_MODEL_SET, LYRIA_PRO_MODEL_SET } from './constants';

/** URL 规范化：相对路径自动包装 /api/media/ 前缀 */
export function normalizeUrl(raw: string | null | undefined): string | null {
  const url = raw || null;
  if (!url) return null;
  const needsPrefix = !url.startsWith('http') && !url.startsWith('/api/media/') && !url.startsWith('data:');
  return needsPrefix ? `/api/media/${url}` : url;
}

/** 从图像/角色节点提取图片 URL（已规范化） */
export function getImageNodeUrl(node: CanvasNode): string | null {
  const data = node.data as CharacterNodeData;
  const raw = (data.images && data.images[0]) || data.imageUrl || null;
  return normalizeUrl(raw);
}

/** 判断模型是否 Lyria 系列（布尔即可，避免 if 分支） */
export const isLyriaModel = (name: string | null | undefined): boolean =>
  !!name && LYRIA_MODEL_SET.has(name);

/** 判断模型是否 Lyria Pro（仅 Pro 支持 WAV + timeline） */
export const isLyriaPro = (name: string | null | undefined): boolean =>
  !!name && LYRIA_PRO_MODEL_SET.has(name);

/** 将画布节点转换为 provider_type（用于 icon 映射） */
export function resolveProviderType(providerType: string | undefined): string {
  return (providerType || '').toLowerCase();
}
