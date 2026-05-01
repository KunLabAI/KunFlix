import type { ImageCreateParams, ImageMode } from '@/hooks/useImageGeneration';
import type { ImageGenHistoryEntry, CanvasNode } from '@/store/useCanvasStore';

// 参考图条目（与节点关联用于 unlink）
export interface ImageRef {
  url: string;
  name: string;
  sourceNodeId: string;
}

/**
 * 外部触发的模式切换请求（用于 ImageNode 工具条快捷按钮）。
 * - token 变化视为一次新的请求；相同 token 不重复应用。
 * - preselectImages 用于自动预设一或多张参考图（单图编辑传 1 张，多图参考传多张）。
 */
export interface ImagePanelModeRequest {
  mode: ImageMode;
  token: number;
  preselectImages?: ImageRef[];
}

export interface ImageGeneratePanelProps {
  onSubmit: (params: ImageCreateParams) => void;
  onStop?: () => void;
  isSubmitting: boolean;
  taskActive: boolean;
  taskDone: boolean;
  taskFailed: boolean;
  taskError?: string | null;
  submitError?: string | null;
  hasExistingImage: boolean;
  onApplyToNode: () => void;
  onApplyToNextNode: () => void;
  /** 历史拖拽生成新节点时用于预填表单 */
  initialConfig?: Partial<ImageGenHistoryEntry> | null;
  /** 当前宿主图像节点 ID，用于在选取自身作参考图时跳过连线 */
  nodeId?: string;
  /** 画布节点列表（用于 edit / reference_images 模式的参考图选择） */
  canvasNodes?: CanvasNode[];
  /** 外部触发的模式切换与自动预设参考图请求 */
  modeRequest?: ImagePanelModeRequest | null;
  /** 参考图预设后同步 link 当前节点（通常自指时跳过） */
  onLinkNode?: (sourceNodeId: string) => void;
  onUnlinkNode?: (sourceNodeId: string) => void;
}
