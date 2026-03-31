import type { CanvasNode, ScriptNodeData, CharacterNodeData, VideoNodeData, StoryboardNodeData } from '@/store/useCanvasStore';
import type { NodeAttachment } from '@/store/useAIAssistantStore';

/**
 * 递归提取 Tiptap JSON 中的纯文本内容
 */
export function extractPlainTextFromTiptap(json: unknown, maxLength = 150): string {
  const parts: string[] = [];

  const walk = (node: unknown) => {
    const n = node as Record<string, unknown> | null;
    n?.type === 'text' && typeof n.text === 'string' && parts.push(n.text);
    Array.isArray(n?.content) && (n!.content as unknown[]).forEach(walk);
  };

  walk(json);
  const text = parts.join('').trim();
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

/**
 * 节点 → 附件数据映射表（按节点类型提取）
 */
const NODE_ATTACHMENT_EXTRACTORS: Record<string, (node: CanvasNode) => NodeAttachment> = {
  text: (node) => {
    const data = node.data as ScriptNodeData;
    return {
      nodeId: node.id,
      nodeType: 'text',
      label: data.title || '未命名文本',
      excerpt: extractPlainTextFromTiptap(data.content, 150),
      thumbnailUrl: null,
      meta: { tags: data.tags },
    };
  },
  image: (node) => {
    const data = node.data as CharacterNodeData;
    return {
      nodeId: node.id,
      nodeType: 'image',
      label: data.name || '未命名图片',
      excerpt: data.description || '',
      thumbnailUrl: data.imageUrl || null,
      meta: { fitMode: data.fitMode, uploading: data.uploading },
    };
  },
  video: (node) => {
    const data = node.data as VideoNodeData;
    return {
      nodeId: node.id,
      nodeType: 'video',
      label: data.name || '未命名视频',
      excerpt: data.description || '',
      thumbnailUrl: data.videoUrl || null,
      meta: { fitMode: data.fitMode, uploading: data.uploading },
    };
  },
  storyboard: (node) => {
    const data = node.data as StoryboardNodeData;
    return {
      nodeId: node.id,
      nodeType: 'storyboard',
      label: `分镜 #${data.shotNumber}`,
      excerpt: data.description || '',
      thumbnailUrl: null,
      meta: { duration: data.duration, shotNumber: data.shotNumber },
    };
  },
};

/**
 * 从 CanvasNode 提取 NodeAttachment 数据
 */
export function extractNodeAttachment(node: CanvasNode): NodeAttachment {
  const extractor = NODE_ATTACHMENT_EXTRACTORS[node.type || ''];
  return extractor?.(node) ?? {
    nodeId: node.id,
    nodeType: node.type || 'unknown',
    label: '未知节点',
    excerpt: '',
    thumbnailUrl: null,
    meta: {},
  };
}
