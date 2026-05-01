import type {
  CanvasNode,
  CharacterNodeData,
  VideoNodeData,
  AudioNodeData,
} from '@/store/useCanvasStore';

/** URL 规范化：相对路径自动包装 /api/media/ 前缀 */
export function normalizeUrl(raw: string | null | undefined): string | null {
  const url = raw || null;
  if (!url) return null;
  const needsPrefix = !url.startsWith('http') && !url.startsWith('/api/media/') && !url.startsWith('data:');
  return needsPrefix ? `/api/media/${url}` : url;
}

/** 从图像节点提取图片 URL（已规范化） */
export function getImageNodeUrl(node: CanvasNode): string | null {
  const data = node.data as CharacterNodeData;
  const raw = (data.images && data.images[0]) || data.imageUrl || null;
  return normalizeUrl(raw);
}

/** 从视频节点提取视频 URL（已规范化） */
export function getVideoNodeUrl(node: CanvasNode): string | null {
  const data = node.data as VideoNodeData;
  return normalizeUrl(data.videoUrl);
}

/** 从音频节点提取音频 URL（已规范化） */
export function getAudioNodeUrl(node: CanvasNode): string | null {
  const data = node.data as AudioNodeData;
  return normalizeUrl(data.audioUrl);
}
