'use client';

/**
 * 画布节点面板注入事件总线。
 *
 * 用途：当上游节点通过连线向下游生成面板（ImageGeneratePanel / VideoGeneratePanel 等）
 *       注入内容时，面板以 mount 阶段订阅事件的方式接收 prompt / 参考图等载荷。
 *
 * 为什么不直接通过 props 或 store：
 * - 面板内部状态（prompt、refs）由自身 hook 管理，避免将注入源耦合进 store。
 * - 事件总线天然支持"多个面板同时在场"场景，消费方按 nodeId 过滤即可。
 *
 * 实现：基于浏览器原生 EventTarget，无第三方依赖。SSR 兼容：typeof window 判空。
 */

/** 注入事件：向 prompt 输入框前缀插入文本 */
export interface PromptPrefixEvent {
  type: 'prompt-prefix';
  /** 要插入的文本（已 trim + 截断） */
  text: string;
}

/** 注入事件：向 reference_images 追加一项 */
export interface AddReferenceImageEvent {
  type: 'add-reference-image';
  /** 来源节点 ID，用于后续 unlink */
  sourceNodeId: string;
  /** 图像 URL（可以是 /api/media/ 或 http(s) 或 data:） */
  url: string;
  /** 展示名称 */
  name?: string;
  /** 标签：image-to-video 场景的首帧 */
  tag?: 'first-frame';
}

/** 注入事件：向视频面板参考视频追加 */
export interface AddReferenceVideoEvent {
  type: 'add-reference-video';
  sourceNodeId: string;
  url: string;
  name?: string;
}

/** 注入事件：向视频面板参考音频追加 */
export interface AddReferenceAudioEvent {
  type: 'add-reference-audio';
  sourceNodeId: string;
  url: string;
  name?: string;
}

/**
 * 注入事件：智能图像注入 —— 由图像源节点连入图像/视频面板时派发。
 *
 * 面板依据 `urls.length` 决定目标模式：
 * - 1 张 → 图像：edit；视频：image_to_video
 * - N 张 → 图像：reference_images；视频：reference_images
 *
 * 若当前模型不支持该模式，面板仅弹出警告 Toast（不自动换模型）。
 * 若超过当前模式上限 N，截断前 N 张并提示。
 */
export interface SmartImageInjectEvent {
  type: 'smart-image-inject';
  sourceNodeId: string;
  urls: string[];
  name?: string;
}

export type PanelInjectEvent =
  | PromptPrefixEvent
  | AddReferenceImageEvent
  | AddReferenceVideoEvent
  | AddReferenceAudioEvent
  | SmartImageInjectEvent;

const EVENT_NAME = 'canvas:panel:inject';

interface PanelInjectDetail {
  nodeId: string;
  event: PanelInjectEvent;
}

/** 获取事件总线：浏览器端使用 window，SSR 下返回 null（短路）。 */
function getBus(): EventTarget | null {
  return typeof window === 'undefined' ? null : window;
}

// ── smart-image-inject 的 pending 缓存 ──
//
// 场景：QuickAddMenu 创建新节点后同步派发 smart-image-inject，新面板尚未 mount
//       订阅也未建立。此外，新节点初始无模型选择（capabilities=null），
//       supportedModes 仅为 fallback，无法判断是否能执行目标模式。
// 策略：事件派发同时写入 pending；面板在 capabilities 就绪后 drain 一次。
const pendingSmartInject: Record<string, SmartImageInjectEvent> = {};

/** 写入 pending smart-image-inject（同 nodeId 的后来者覆盖）。 */
export function setPendingSmartInject(nodeId: string, ev: SmartImageInjectEvent): void {
  pendingSmartInject[nodeId] = ev;
}

/** 读出并清除 pending smart-image-inject；无则返回 null。 */
export function takePendingSmartInject(nodeId: string | undefined): SmartImageInjectEvent | null {
  if (!nodeId) return null;
  const ev = pendingSmartInject[nodeId];
  delete pendingSmartInject[nodeId];
  return ev ?? null;
}

/** 只读探测：该节点是否有 pending smart-image-inject（不消费）。 */
export function hasPendingSmartInject(nodeId: string | undefined): boolean {
  return !!nodeId && !!pendingSmartInject[nodeId];
}

/** 向目标节点 ID 的面板发送一个注入事件 */
export function emitPanelInject(nodeId: string, event: PanelInjectEvent): void {
  const bus = getBus();
  bus && bus.dispatchEvent(
    new CustomEvent<PanelInjectDetail>(EVENT_NAME, { detail: { nodeId, event } }),
  );
}

/**
 * 订阅目标节点 ID 的注入事件。
 * 返回 unsubscribe 函数；面板 useEffect 里直接用即可。
 */
export function onPanelInject(
  nodeId: string | undefined,
  handler: (event: PanelInjectEvent) => void,
): () => void {
  const bus = getBus();
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<PanelInjectDetail>).detail;
    detail && detail.nodeId === nodeId && handler(detail.event);
  };
  bus && nodeId && bus.addEventListener(EVENT_NAME, listener);
  return () => {
    bus && nodeId && bus.removeEventListener(EVENT_NAME, listener);
  };
}
