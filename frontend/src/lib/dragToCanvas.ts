/**
 * AI助手面板内容拖拽到画布的工具函数
 * 与 useCanvasDragDrop 兼容，使用相同的 dataTransfer 格式
 */

// 节点类型配置：定义默认数据和尺寸
const NODE_CONFIGS: Record<string, { 
  dimensions: { width: number; height: number };
  buildData: (params: Record<string, unknown>) => Record<string, unknown>;
}> = {
  video: {
    dimensions: { width: 512, height: 384 },
    buildData: ({ name, videoUrl, description }: Record<string, unknown>) => ({
      name: name || '新视频卡',
      description: description || '',
      videoUrl: videoUrl || '',
    }),
  },
  text: {
    dimensions: { width: 420, height: 320 },
    buildData: ({ title, content }: Record<string, unknown>) => ({
      title: title || '新文本卡',
      content: content || { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: String(title || '') }] }] },
      tags: [],
    }),
  },
  image: {
    dimensions: { width: 512, height: 384 },
    buildData: ({ name, imageUrl, description }: Record<string, unknown>) => ({
      name: name || '新图片卡',
      description: description || '',
      imageUrl: imageUrl || '',
    }),
  },
  audio: {
    dimensions: { width: 360, height: 200 },
    buildData: ({ name, audioUrl, description, lyrics }: Record<string, unknown>) => ({
      name: name || '新音频卡',
      description: description || '',
      audioUrl: audioUrl || '',
      lyrics: lyrics || '',
    }),
  },
};

/**
 * 设置拖拽数据（与 Sidebar.tsx 中的 onDragStart 格式一致）
 */
export function setDragData(
  event: React.DragEvent,
  nodeType: string,
  params: Record<string, unknown>
): void {
  const config = NODE_CONFIGS[nodeType];
  const data = config?.buildData(params) ?? params;
  const dimensions = config?.dimensions ?? { width: 400, height: 300 };

  event.dataTransfer.setData('application/reactflow', nodeType);
  event.dataTransfer.setData('application/reactflow-data', JSON.stringify(data));
  event.dataTransfer.setData('application/reactflow-dimensions', JSON.stringify(dimensions));
  event.dataTransfer.effectAllowed = 'move';
}

/**
 * 创建拖拽预览元素
 */
export function createDragPreview(label: string, icon?: string): HTMLElement {
  const preview = document.createElement('div');
  preview.className = 'px-4 py-2 bg-background/90 backdrop-blur border border-primary/50 text-foreground rounded-md shadow-lg flex items-center gap-2';
  preview.style.position = 'absolute';
  preview.style.top = '-1000px';
  preview.style.opacity = '0.85';
  preview.style.pointerEvents = 'none';
  preview.innerHTML = `
    <div class="w-4 h-4 rounded-sm bg-primary/20 flex items-center justify-center text-primary">
      ${icon || '📄'}
    </div>
    <span class="text-sm font-medium max-w-[200px] truncate">${label}</span>
  `;
  document.body.appendChild(preview);
  return preview;
}

/**
 * 清理拖拽预览元素
 */
export function cleanupDragPreview(preview: HTMLElement | null): void {
  preview && document.body.contains(preview) && document.body.removeChild(preview);
}

/**
 * 视频卡片拖拽开始处理器
 */
export function handleVideoDragStart(
  event: React.DragEvent,
  videoUrl: string,
  name?: string
): HTMLElement | null {
  setDragData(event, 'video', {
    name: name || '视频卡',
    videoUrl,
    description: '',
  });

  const preview = createDragPreview(name || '拖拽视频到画布', '🎬');
  event.dataTransfer.setDragImage(preview, 0, 0);

  return preview;
}

/**
 * 音频卡片拖拽开始处理器
 */
export function handleAudioDragStart(
  event: React.DragEvent,
  audioUrl: string,
  name?: string,
  lyrics?: string
): HTMLElement | null {
  setDragData(event, 'audio', {
    name: name || '音频卡',
    audioUrl,
    description: '',
    lyrics: lyrics || '',
  });

  const preview = createDragPreview(name || '拖拽音频到画布', '🎵');
  event.dataTransfer.setDragImage(preview, 0, 0);

  return preview;
}

/**
 * 文本拖拽开始处理器
 */
export function handleTextDragStart(
  event: React.DragEvent,
  text: string,
  title?: string
): HTMLElement | null {
  // 截取文本作为标题（最多 50 字符）
  const displayTitle = title || (text.length > 50 ? text.slice(0, 50) + '...' : text);
  
  setDragData(event, 'text', {
    title: displayTitle,
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
  });

  const preview = createDragPreview(displayTitle, '📝');
  event.dataTransfer.setDragImage(preview, 0, 0);

  return preview;
}
