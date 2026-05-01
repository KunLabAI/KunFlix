import type { VideoCreateParams, VideoModel } from '@/hooks/useVideoGeneration';
import type { CanvasNode, VideoGenHistoryEntry } from '@/store/useCanvasStore';

/** 节点选择器当前模式，由 video_mode 推导 */
export type PickerMode = 'none' | 'single_image' | 'first_last_frame' | 'multi_image' | 'video';

/** 扁平化模型列表项（含 provider 元信息以渲染 logo） */
export interface FlatVideoModelItem {
  key: string;
  model: VideoModel;
  providerType: string;
  providerName: string;
}

/** 对外 Props — 与原实现保持完全一致 */
export interface VideoGeneratePanelProps {
  onSubmit: (params: VideoCreateParams) => void;
  onStop: () => void;
  isSubmitting: boolean;
  taskActive: boolean;
  taskDone: boolean;
  taskFailed: boolean;
  taskError?: string | null;
  submitError?: string | null;
  hasExistingVideo: boolean;
  onApplyToNode: () => void;
  onApplyToNextNode: () => void;
  canvasNodes?: CanvasNode[];
  /** Pre-fill form from history entry (e.g. drag from history) */
  initialConfig?: Partial<VideoGenHistoryEntry> | null;
  /** Current video node ID — used for auto-linking source nodes */
  nodeId?: string;
  /** Called when a source node is selected as material — parent should create edge */
  onLinkNode?: (sourceNodeId: string) => void;
  /** Called when a source node material is removed — parent should remove edge */
  onUnlinkNode?: (sourceNodeId: string) => void;
}
