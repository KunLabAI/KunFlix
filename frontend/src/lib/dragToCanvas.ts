/**
 * AI助手面板内容拖拽到画布的工具函数
 * 与 useCanvasDragDrop 兼容，使用相同的 dataTransfer 格式
 */

// 内联 SVG 图标（createDragPreview 默认图标）
const ICON_SVG_FILE = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>';

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
      ${icon || ICON_SVG_FILE}
    </div>
    <span class="text-sm font-medium max-w-[200px] truncate">${label}</span>
  `;
  document.body.appendChild(preview);
  return preview;
}

// ── 统一卡片风格预览基础样式 ──
function applyCardBase(el: HTMLElement): void {
  el.style.position = 'absolute';
  el.style.top = '-1000px';
  el.style.opacity = '0.8';
  el.style.pointerEvents = 'none';
  el.style.borderRadius = '10px';
  el.style.overflow = 'hidden';
  el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
}

/**
 * 创建图片拖拽预览元素（使用图片本身）
 */
export function createImageDragPreview(imageUrl: string, maxSize = 200): HTMLElement {
  const preview = document.createElement('div');
  applyCardBase(preview);

  const img = document.createElement('img');
  img.src = imageUrl;
  img.style.maxWidth = `${maxSize}px`;
  img.style.maxHeight = `${maxSize}px`;
  img.style.display = 'block';
  img.style.objectFit = 'contain';
  img.draggable = false;

  preview.appendChild(img);
  document.body.appendChild(preview);
  return preview;
}

/**
 * 创建视频拖拽预览元素（暗色缩略图 + 播放按钮）
 */
export function createVideoDragPreview(videoUrl: string, maxWidth = 160): HTMLElement {
  const preview = document.createElement('div');
  applyCardBase(preview);
  preview.style.width = `${maxWidth}px`;
  preview.style.height = `${Math.round(maxWidth * 0.625)}px`;
  preview.style.background = '#111';
  preview.style.display = 'flex';
  preview.style.alignItems = 'center';
  preview.style.justifyContent = 'center';
  preview.style.position = 'absolute';

  // 视频帧背景
  const video = document.createElement('video');
  video.src = videoUrl;
  video.preload = 'metadata';
  video.muted = true;
  Object.assign(video.style, {
    width: '100%', height: '100%', objectFit: 'cover',
    opacity: '0.55', position: 'absolute', top: '0', left: '0',
  });
  preview.appendChild(video);

  // 播放按钮遮罩
  const btn = document.createElement('div');
  Object.assign(btn.style, {
    width: '32px', height: '32px', borderRadius: '50%',
    background: 'rgba(255,255,255,0.9)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative', zIndex: '1',
  });
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#111"><path d="M8 5v14l11-7z"/></svg>';
  preview.appendChild(btn);

  document.body.appendChild(preview);
  return preview;
}

/**
 * 创建音频拖拽预览元素（渐变卡片 + 音符图标 + 名称）
 */
export function createAudioDragPreview(name: string, maxWidth = 160): HTMLElement {
  const preview = document.createElement('div');
  applyCardBase(preview);
  Object.assign(preview.style, {
    width: `${maxWidth}px`, padding: '12px',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    display: 'flex', alignItems: 'center', gap: '10px',
  });

  preview.innerHTML = `
    <div style="width:28px;height:28px;border-radius:50%;background:rgba(245,158,11,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
    </div>
    <span style="color:#fff;font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</span>
  `;

  document.body.appendChild(preview);
  return preview;
}

/**
 * 创建文本拖拽预览元素（卡片样式 + 文本摘要）
 */
export function createTextDragPreview(text: string, maxWidth = 180): HTMLElement {
  const preview = document.createElement('div');
  applyCardBase(preview);
  Object.assign(preview.style, {
    width: `${maxWidth}px`, padding: '10px 12px',
    background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.08)',
  });

  const displayText = text.length > 60 ? text.slice(0, 60) + '...' : text;
  preview.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:8px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
      <span style="color:#e2e8f0;font-size:11px;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${displayText}</span>
    </div>
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

  const preview = createVideoDragPreview(videoUrl);
  event.dataTransfer.setDragImage(preview, preview.offsetWidth / 2, preview.offsetHeight / 2);

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

  const preview = createAudioDragPreview(name || '音频');
  event.dataTransfer.setDragImage(preview, preview.offsetWidth / 2, preview.offsetHeight / 2);

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

  const preview = createTextDragPreview(displayTitle);
  event.dataTransfer.setDragImage(preview, preview.offsetWidth / 2, preview.offsetHeight / 2);

  return preview;
}

/**
 * 图片拖拽开始处理器（使用图片作为预览）
 */
export function handleImageDragStart(
  event: React.DragEvent,
  imageUrl: string,
  name?: string
): HTMLElement | null {
  // 使用 alt 文本作为节点名称，避免使用图像ID
  const nodeName = name || '图片';
  
  setDragData(event, 'image', {
    name: nodeName,
    imageUrl,
    description: '',
  });

  // 使用图片本身作为拖拽预览
  const preview = createImageDragPreview(imageUrl);
  event.dataTransfer.setDragImage(preview, preview.offsetWidth / 2, preview.offsetHeight / 2);

  return preview;
}
