'use client';

/**
 * 画布连线的载荷构建与注入分发器。
 *
 * 规范来源：`frontend/src/lib/canvas/edgeRules.md` 第 5、7 节。
 * 调用方：
 * - `useCanvasStore.connectAndInject`（QuickAddMenu 立即注入 / 已存在节点确认后注入）
 * - 生成面板（ImageGeneratePanel / VideoGeneratePanel）订阅 panelEvents
 *
 * 设计：
 * - buildPayload：只抽取语义内容，文本 trim+slice(0,50000)，媒体用 URL 引用（不拷贝二进制）。
 * - injectPayload：按"下游节点类型 + 载荷 kind"派发；返回 { dataPatch, panelEvents, toasts }。
 *   调用方根据返回值决定是否 updateNodeData / emitPanelInject / edgeToast.xxx。
 */
import type {
  CanvasNode,
  ScriptNodeData,
  CharacterNodeData,
  VideoNodeData,
  AudioNodeData,
  StoryboardNodeData,
} from '@/store/useCanvasStore';
import { extractPlainTextFromTiptap } from '@/lib/nodeAttachmentUtils';
import type { PanelInjectEvent } from './panelEvents';

// ── 常量 ──
export const TEXT_PROMPT_MAX = 50000;
export const DESCRIPTION_COL_KEY = 'description';

// ── EdgePayload（与 edgeRules.md 第 7 节对齐） ──

export type ColumnDef = { key: string; label: string; type?: 'text' | 'number' | 'image' | 'video' | 'audio' };

export type EdgePayload =
  | { kind: 'text'; content: string; format: 'plain' | 'markdown'; doc?: TiptapDoc | null }
  | { kind: 'image'; url: string; urls: string[]; width?: number; height?: number; mime?: string }
  | { kind: 'video'; url: string; poster?: string; duration?: number }
  | { kind: 'audio'; url: string; duration?: number; lyrics?: string }
  | { kind: 'table'; rows: Record<string, unknown>[]; columns: ColumnDef[] };

// Tiptap JSON 最小类型（保留 mark 和 block 全量元数据）
export type TiptapDoc = { type: 'doc'; content?: TiptapNode[] };
export type TiptapNode = { type: string; content?: TiptapNode[]; marks?: unknown[]; text?: string; attrs?: Record<string, unknown> };

// ── 注入结果 ──

export type InjectionResult = {
  /** 直接应用到下游节点 data 的增量 */
  dataPatch?: Record<string, unknown>;
  /** 要发送给目标节点面板的事件（由调用方 emitPanelInject 实际派发） */
  panelEvents?: PanelInjectEvent[];
  /** 文案提示（warn 级别，非致命） */
  warnings?: string[];
  /** 是否需要调用方弹确认（当前仅 storyboard 新建媒体列用） */
  pendingConfirm?: { message: string; apply: () => InjectionResult };
};

// ── 辅助函数 ──

const emptyResult: InjectionResult = {};

/**
 * 收集图像节点的所有 URL（用于智能注入 urls[]）。
 * 优先 images 数组；空数组时回落 imageUrl；最后去重。
 */
function getImageUrls(node: CanvasNode): string[] {
  const data = node.data as CharacterNodeData;
  const arr = Array.isArray(data.images) ? data.images.filter((u): u is string => typeof u === 'string' && u.length > 0) : [];
  const fallback = arr.length === 0 && data.imageUrl ? [data.imageUrl] : [];
  return Array.from(new Set([...arr, ...fallback]));
}

function getVideoUrl(node: CanvasNode): string | null {
  const data = node.data as VideoNodeData;
  return data.videoUrl || null;
}

function getAudioUrl(node: CanvasNode): string | null {
  const data = node.data as AudioNodeData;
  return data.audioUrl || null;
}

function getAudioLyrics(node: CanvasNode): string | undefined {
  const data = node.data as AudioNodeData;
  return data.lyrics;
}

function getTextContent(node: CanvasNode): string {
  const data = node.data as ScriptNodeData;
  const raw = data.content;
  const asString = typeof raw === 'string' ? raw : extractPlainTextFromTiptap(raw, Infinity);
  return asString.trim().slice(0, TEXT_PROMPT_MAX);
}

/** 读取节点 `data.content` 中的 Tiptap JSON；字符串或非合法 doc 返回 null。*/
function getTextDoc(node: CanvasNode): TiptapDoc | null {
  const data = node.data as ScriptNodeData;
  const raw = data.content;
  const isDoc = raw !== null && typeof raw === 'object' && (raw as TiptapDoc).type === 'doc';
  return isDoc ? (raw as TiptapDoc) : null;
}

/**
 * 合并两个 Tiptap doc：源 doc 的 content 追加到目标 doc 末尾，
 * 两段均非空时插入空段落做视觉分隔。任一侧缺失时返回另一侧。
 */
function mergeTiptapDocs(targetDoc: TiptapDoc | null, sourceDoc: TiptapDoc | null): TiptapDoc | null {
  if (!sourceDoc) return targetDoc;
  if (!targetDoc) return sourceDoc;
  const targetContent = Array.isArray(targetDoc.content) ? targetDoc.content : [];
  const sourceContent = Array.isArray(sourceDoc.content) ? sourceDoc.content : [];
  const targetHasText = extractPlainTextFromTiptap(targetDoc, Infinity).trim().length > 0;
  const separator: TiptapNode[] = targetHasText ? [{ type: 'paragraph' }] : [];
  return { type: 'doc', content: [...targetContent, ...separator, ...sourceContent] };
}

// ── buildPayload ──

/**
 * 从源节点构建 EdgePayload。返回 null 表示该节点无可用内容（例如图像节点尚未上传）。
 */
export function buildPayload(sourceNode: CanvasNode): EdgePayload | null {
  const builders: Record<string, () => EdgePayload | null> = {
    text: () => {
      const content = getTextContent(sourceNode);
      const doc = getTextDoc(sourceNode);
      // 无任何字符内容时视为空节点，不触发注入
      return content.length > 0 ? { kind: 'text', content, format: 'plain', doc } : null;
    },
    image: () => {
      const urls = getImageUrls(sourceNode);
      return urls.length > 0 ? { kind: 'image', url: urls[0], urls } : null;
    },
    video: () => {
      const url = getVideoUrl(sourceNode);
      return url ? { kind: 'video', url } : null;
    },
    audio: () => {
      const url = getAudioUrl(sourceNode);
      return url ? { kind: 'audio', url, lyrics: getAudioLyrics(sourceNode) } : null;
    },
    storyboard: () => {
      const data = sourceNode.data as StoryboardNodeData;
      const rows = data.tableData ?? [];
      const columns: ColumnDef[] = (data.tableColumns ?? []) as ColumnDef[];
      return { kind: 'table', rows, columns };
    },
  };
  const build = sourceNode.type ? builders[sourceNode.type] : null;
  return build ? build() : null;
}

// ── 下游派发器 ──

/** 下游 text：接受 text / table，其余由矩阵拦截 */
function injectToText(targetNode: CanvasNode, payload: EdgePayload): InjectionResult {
  const data = targetNode.data as ScriptNodeData;
  const existingDoc = getTextDoc(targetNode);
  const existingStr = typeof data.content === 'string' ? data.content : extractPlainTextFromTiptap(data.content, Infinity);

  const handlers: Partial<Record<EdgePayload['kind'], () => InjectionResult>> = {
    text: () => {
      const p = payload as Extract<EdgePayload, { kind: 'text' }>;
      // 优先走 Tiptap JSON 合并以保留格式（源或目标任一侧为纯字符串时降级为字符拼接）
      const canMergeDoc = !!p.doc && typeof data.content !== 'string';
      if (canMergeDoc) {
        const merged = mergeTiptapDocs(existingDoc, p.doc ?? null);
        return { dataPatch: { content: merged } };
      }
      const next = existingStr.trim().length > 0 ? `${existingStr}\n\n${p.content}` : p.content;
      return { dataPatch: { content: next.slice(0, TEXT_PROMPT_MAX) } };
    },
    table: () => {
      const p = payload as Extract<EdgePayload, { kind: 'table' }>;
      const lines = p.rows
        .map((r) => {
          const descVal = r[DESCRIPTION_COL_KEY];
          return typeof descVal === 'string' && descVal.trim().length > 0 ? `- ${descVal}` : '';
        })
        .filter(Boolean);
      const appended = lines.length > 0 ? lines.join('\n') : '';
      const next = existingStr.trim().length > 0 ? `${existingStr}\n\n${appended}` : appended;
      return appended.length > 0 ? { dataPatch: { content: next.slice(0, TEXT_PROMPT_MAX) } } : emptyResult;
    },
  };
  const handler = handlers[payload.kind];
  return handler ? handler() : emptyResult;
}

/** 下游 image：text→prompt-prefix；image/video→add-reference-image */
function injectToImage(targetNode: CanvasNode, payload: EdgePayload, sourceNodeId: string): InjectionResult {
  const handlers: Partial<Record<EdgePayload['kind'], () => InjectionResult>> = {
    text: () => {
      const p = payload as Extract<EdgePayload, { kind: 'text' }>;
      return { panelEvents: [{ type: 'prompt-prefix', text: p.content }] };
    },
    image: () => {
      const p = payload as Extract<EdgePayload, { kind: 'image' }>;
      // 改派 smart-image-inject：面板根据 urls.length 自选目标模式（edit / reference_images）
      return {
        panelEvents: [{
          type: 'smart-image-inject',
          sourceNodeId,
          urls: p.urls,
        }],
      };
    },
    video: () => {
      const p = payload as Extract<EdgePayload, { kind: 'video' }>;
      // 视频 → 图像：一期仅支持首帧/封面作为参考图
      const url = p.poster || p.url;
      return {
        panelEvents: [{
          type: 'add-reference-image',
          sourceNodeId,
          url,
          tag: 'first-frame',
        }],
      };
    },
  };
  const handler = handlers[payload.kind];
  return handler ? handler() : emptyResult;
}

/** 下游 video：text→prompt-prefix；image→智能注入（image_to_video/reference_images）；video→参考视频；audio→参考音频 */
function injectToVideo(_targetNode: CanvasNode, payload: EdgePayload, sourceNodeId: string): InjectionResult {
  const handlers: Partial<Record<EdgePayload['kind'], () => InjectionResult>> = {
    text: () => {
      const p = payload as Extract<EdgePayload, { kind: 'text' }>;
      return { panelEvents: [{ type: 'prompt-prefix', text: p.content }] };
    },
    image: () => {
      const p = payload as Extract<EdgePayload, { kind: 'image' }>;
      // 改派 smart-image-inject：面板根据 urls.length 自选目标模式（image_to_video / reference_images）
      return {
        panelEvents: [{
          type: 'smart-image-inject',
          sourceNodeId,
          urls: p.urls,
        }],
      };
    },
    video: () => {
      const p = payload as Extract<EdgePayload, { kind: 'video' }>;
      return {
        panelEvents: [{
          type: 'add-reference-video',
          sourceNodeId,
          url: p.url,
        }],
      };
    },
    audio: () => {
      const p = payload as Extract<EdgePayload, { kind: 'audio' }>;
      return {
        panelEvents: [{
          type: 'add-reference-audio',
          sourceNodeId,
          url: p.url,
        }],
      };
    },
  };
  const handler = handlers[payload.kind];
  return handler ? handler() : emptyResult;
}

/** 下游 audio：text→lyrics 追加；image 由矩阵拦截；video/audio 为 deferred */
function injectToAudio(targetNode: CanvasNode, payload: EdgePayload): InjectionResult {
  const data = targetNode.data as AudioNodeData;
  const handlers: Partial<Record<EdgePayload['kind'], () => InjectionResult>> = {
    text: () => {
      const p = payload as Extract<EdgePayload, { kind: 'text' }>;
      const existing = data.lyrics || '';
      const next = existing.trim().length > 0 ? `${existing}\n\n${p.content}` : p.content;
      return { dataPatch: { lyrics: next.slice(0, TEXT_PROMPT_MAX) } };
    },
  };
  const handler = handlers[payload.kind];
  return handler ? handler() : emptyResult;
}

/** 下游 storyboard：text → 追加一行；image/video/audio → 追加到匹配媒体列；table → 行级合并 */
function injectToStoryboard(targetNode: CanvasNode, payload: EdgePayload): InjectionResult {
  const data = targetNode.data as StoryboardNodeData;
  const rows: Record<string, unknown>[] = Array.isArray(data.tableData) ? [...data.tableData] : [];
  const columns: ColumnDef[] = Array.isArray(data.tableColumns) ? [...(data.tableColumns as ColumnDef[])] : [];

  const appendTextRow = (): InjectionResult => {
    const p = payload as Extract<EdgePayload, { kind: 'text' }>;
    const hasDescCol = columns.some((c) => c.key === DESCRIPTION_COL_KEY);
    const nextColumns: ColumnDef[] = hasDescCol
      ? columns
      : [...columns, { key: DESCRIPTION_COL_KEY, label: '描述', type: 'text' }];
    const nextRows = [...rows, { [DESCRIPTION_COL_KEY]: p.content }];
    return { dataPatch: { tableData: nextRows, tableColumns: nextColumns } };
  };

  const appendMediaRow = (kind: 'image' | 'video' | 'audio', url: string): InjectionResult => {
    const matchedCol = columns.find((c) => c.type === kind);
    const doAppend = (colKey: string, extraColumns?: ColumnDef[]): InjectionResult => {
      const nextRows = [...rows, { [colKey]: url }];
      return {
        dataPatch: {
          tableData: nextRows,
          ...(extraColumns ? { tableColumns: extraColumns } : {}),
        },
      };
    };

    const colExists = !!matchedCol;
    const colExistsResult: InjectionResult | null = colExists ? doAppend(matchedCol!.key) : null;
    if (colExistsResult) return colExistsResult;

    // 无匹配媒体列 → 弹确认由调用方决定是否新建列
    const newColKey = kind;
    const newColLabel = kind === 'image' ? '图像' : kind === 'video' ? '视频' : '音频';
    const newColumns: ColumnDef[] = [...columns, { key: newColKey, label: newColLabel, type: kind }];
    return {
      pendingConfirm: {
        message: `未找到 ${newColLabel} 列，是否新建「${newColLabel}」列并追加？`,
        apply: () => doAppend(newColKey, newColumns),
      },
    };
  };

  const handlers: Partial<Record<EdgePayload['kind'], () => InjectionResult>> = {
    text: appendTextRow,
    image: () => appendMediaRow('image', (payload as Extract<EdgePayload, { kind: 'image' }>).url),
    video: () => appendMediaRow('video', (payload as Extract<EdgePayload, { kind: 'video' }>).url),
    audio: () => appendMediaRow('audio', (payload as Extract<EdgePayload, { kind: 'audio' }>).url),
    table: () => {
      const p = payload as Extract<EdgePayload, { kind: 'table' }>;
      // 列定义合并去重（按 key）
      const mergedColumns: ColumnDef[] = [...columns];
      p.columns.forEach((c) => {
        const exists = mergedColumns.some((m) => m.key === c.key);
        !exists && mergedColumns.push(c);
      });
      const nextRows = [...rows, ...p.rows];
      return { dataPatch: { tableData: nextRows, tableColumns: mergedColumns } };
    },
  };
  const handler = handlers[payload.kind];
  return handler ? handler() : emptyResult;
}

// ── 主分发器 ──

/**
 * 根据下游节点类型将 payload 派发到对应处理器。
 * 不实际执行 updateNodeData / emitPanelInject——调用方依据返回值自行处理。
 */
export function injectPayload(
  targetNode: CanvasNode,
  payload: EdgePayload,
  sourceNodeId: string,
): InjectionResult {
  const dispatch: Record<string, () => InjectionResult> = {
    text: () => injectToText(targetNode, payload),
    image: () => injectToImage(targetNode, payload, sourceNodeId),
    video: () => injectToVideo(targetNode, payload, sourceNodeId),
    audio: () => injectToAudio(targetNode, payload),
    storyboard: () => injectToStoryboard(targetNode, payload),
  };
  const handler = targetNode.type ? dispatch[targetNode.type] : null;
  return handler ? handler() : emptyResult;
}

// ── 媒体 URL 转换 ──

/**
 * 将 /api/media/... 本地路径转换为 base64 data URL。
 * - 已是 data: → 直接返回
 * - http(s) → 直接返回（不拉取外网避免 CORS/配额）
 * - 其他（含 /api/media/）→ fetch 并 FileReader 转 data URL
 */
export async function mediaUrlToDataUrl(url: string): Promise<string> {
  if (!url) return url;
  if (url.startsWith('data:')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;

  const response = await fetch(url);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * 批量把 URL 转为 data URL；失败项回退为原 URL（不中断其他项）。
 */
export async function mediaUrlsToDataUrls(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map(async (u) => {
    try { return await mediaUrlToDataUrl(u); }
    catch { return u; }
  }));
}
