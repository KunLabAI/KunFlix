import type {
  MusicCreateParams,
  MusicModelFlat,
} from '@/hooks/useMusicGeneration';
import type { CanvasNode, AudioGenHistoryEntry } from '@/store/useCanvasStore';

/** 扁平化音乐模型列表项（含 provider 元信息以渲染 logo） */
export interface FlatMusicModelItem {
  key: string;                 // `${provider_id}:${model_name}`
  model: MusicModelFlat;
  providerType: string;        // 'gemini' / 'suno' 等，用于 icon 映射
}

/** 对外 Props */
export interface AudioGeneratePanelProps {
  onSubmit: (params: MusicCreateParams) => void;
  onStop: () => void;
  isSubmitting: boolean;
  taskActive: boolean;
  taskDone: boolean;
  taskFailed: boolean;
  taskError?: string | null;
  submitError?: string | null;
  hasExistingAudio: boolean;
  onApplyToNode: () => void;
  onApplyToNextNode: () => void;
  canvasNodes?: CanvasNode[];
  /** 预填历史或来自菜单入口的初始配置 */
  initialConfig?: Partial<AudioGenHistoryEntry> | null;
  /** 当前音频节点 ID —— 用于建边 */
  nodeId?: string;
  /** 选定素材节点时，由父组件创建连线 */
  onLinkNode?: (sourceNodeId: string) => void;
  /** 取消素材节点时，由父组件删边 */
  onUnlinkNode?: (sourceNodeId: string) => void;
}
