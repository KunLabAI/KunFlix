/**
 * 画布连线合法性矩阵 + 校验函数（前端 Single Source of Truth）。
 *
 * 规范来源：`frontend/src/lib/canvas/edgeRules.md`
 * 后端对齐：`backend/services/tool_manager/providers/_canvas_edge_rules.py`
 *
 * 设计原则：
 * 1. 5x5 矩阵写死为纯常量，任何规范变更都必须同时改动前后端两个文件。
 * 2. validateEdge 只做合法性判定，不做内容注入（那属于 edgePayload.ts）。
 * 3. 所有检查走早返回，避免嵌套 if（遵循项目 style.md 规范）。
 */
import type { Edge } from '@xyflow/react';
import { hasCycle } from '@/lib/graphUtils';

export type NodeType = 'text' | 'image' | 'video' | 'audio' | 'storyboard';

export type EdgeLegality = 'allow' | 'deferred' | 'forbid';

export type EdgeRejectReason =
  | 'self_loop'
  | 'same_polarity'
  | 'duplicate_edge'
  | 'cycle'
  | 'forbidden_type_combination'
  | 'not_supported_yet'
  | 'unknown_type';

export interface EdgeValidationResult {
  ok: boolean;
  reason?: EdgeRejectReason;
  message?: string;
}

/**
 * 5x5 合法性矩阵（Source → Target）。
 * 必须与 edgeRules.md 第 4 节、SKILL.md Edge Compatibility Matrix 三方对齐。
 */
export const EDGE_LEGALITY_MATRIX: Record<NodeType, Record<NodeType, EdgeLegality>> = {
  text: {
    text: 'allow',
    image: 'allow',
    video: 'allow',
    audio: 'allow',
    storyboard: 'allow',
  },
  image: {
    text: 'deferred',
    image: 'allow',
    video: 'allow',
    audio: 'forbid',
    storyboard: 'allow',
  },
  video: {
    text: 'deferred',
    image: 'allow',
    video: 'allow',
    audio: 'deferred',
    storyboard: 'allow',
  },
  audio: {
    text: 'deferred',
    image: 'forbid',
    video: 'allow',
    audio: 'deferred',
    storyboard: 'allow',
  },
  storyboard: {
    text: 'allow',
    image: 'allow',
    video: 'allow',
    audio: 'allow',
    storyboard: 'allow',
  },
};

export const REJECT_MESSAGES: Record<EdgeRejectReason, string> = {
  self_loop: '不允许连接到自身',
  same_polarity: '连接端口方向错误：连线两端需要分别位于节点的不同侧边',
  duplicate_edge: '该连线已存在',
  cycle: '会形成循环依赖，已阻止',
  forbidden_type_combination: '此类型组合不允许连线',
  not_supported_yet: '该连线类型即将支持',
  unknown_type: '未知的节点类型',
};

const isNodeType = (x: unknown): x is NodeType =>
  typeof x === 'string' && ['text', 'image', 'video', 'audio', 'storyboard'].includes(x);

/**
 * 读取 Handle 所在的几何侧边（基于 id 前缀）。
 *
 * 注意：画布使用 `ConnectionMode.Loose`，且每个边缘同位置叠加了 `{side}-source` 与 `{side}-target`
 * 两个 Handle，DOM 后渲染的 `*-source` 覆盖在上层，导致拖拽起止两端都会命中 `*-source`。
 * 因此 role 后缀（source/target）在 loose 模式下**不具备方向语义**，极性校验只能看几何侧边。
 */
const getHandleSide = (h: string | null | undefined): 'left' | 'right' | null => {
  if (typeof h !== 'string') return null;
  if (h.startsWith('left-')) return 'left';
  if (h.startsWith('right-')) return 'right';
  return null;
};

export interface ValidateEdgeParams {
  sourceId: string;
  targetId: string;
  sourceType: string | undefined;
  targetType: string | undefined;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  /** 画布现有边集合，用于四元组去重与拓扑环检测 */
  existingEdges: Edge[];
}

/**
 * 连线合法性校验：按顺序检查硬约束与矩阵。
 * 检查顺序：self_loop → same_polarity → duplicate_edge → cycle → matrix。
 */
export function validateEdge(params: ValidateEdgeParams): EdgeValidationResult {
  const {
    sourceId, targetId, sourceType, targetType,
    sourceHandle, targetHandle, existingEdges,
  } = params;

  // 1. 自环
  const isSelfLoop = sourceId === targetId;
  const selfLoopResult: EdgeValidationResult | null = isSelfLoop
    ? { ok: false, reason: 'self_loop', message: REJECT_MESSAGES.self_loop }
    : null;
  if (selfLoopResult) return selfLoopResult;

  // 2. 极性（两端同时提供 handle 且都能识别出侧边时才校验；ReactFlow 内部有部分路径 handle 为 null）
  // Loose 模式下 role 后缀不可靠，改为判定几何侧边：两端必须位于节点**不同侧**。
  const srcSide = getHandleSide(sourceHandle);
  const tgtSide = getHandleSide(targetHandle);
  const polarityCheckable = srcSide !== null && tgtSide !== null;
  const polarityBad = polarityCheckable && srcSide === tgtSide;
  const polarityResult: EdgeValidationResult | null = polarityBad
    ? { ok: false, reason: 'same_polarity', message: REJECT_MESSAGES.same_polarity }
    : null;
  if (polarityResult) return polarityResult;

  // 3. 四元组去重
  const isDuplicate = existingEdges.some((e) =>
    e.source === sourceId &&
    e.target === targetId &&
    (e.sourceHandle ?? null) === (sourceHandle ?? null) &&
    (e.targetHandle ?? null) === (targetHandle ?? null),
  );
  const dupResult: EdgeValidationResult | null = isDuplicate
    ? { ok: false, reason: 'duplicate_edge', message: REJECT_MESSAGES.duplicate_edge }
    : null;
  if (dupResult) return dupResult;

  // 4. 拓扑环
  const cycleBad = hasCycle(existingEdges, sourceId, targetId);
  const cycleResult: EdgeValidationResult | null = cycleBad
    ? { ok: false, reason: 'cycle', message: REJECT_MESSAGES.cycle }
    : null;
  if (cycleResult) return cycleResult;

  // 5. 矩阵查表（类型未知按放行处理，以兼容 ghost / streaming 等非规范类型）
  const bothTypesKnown = isNodeType(sourceType) && isNodeType(targetType);
  const legality: EdgeLegality | undefined = bothTypesKnown
    ? EDGE_LEGALITY_MATRIX[sourceType as NodeType][targetType as NodeType]
    : undefined;

  const matrixReject: EdgeValidationResult | null =
    legality === 'forbid' ? { ok: false, reason: 'forbidden_type_combination', message: `${sourceType} → ${targetType} 不允许连线` } :
    legality === 'deferred' ? { ok: false, reason: 'not_supported_yet', message: `${sourceType} → ${targetType} 即将支持` } :
    null;
  if (matrixReject) return matrixReject;

  return { ok: true };
}

/** 获取矩阵中的合法性（未知类型返回 'allow'，用于 tooltip 展示） */
export function getEdgeLegality(sourceType: string | undefined, targetType: string | undefined): EdgeLegality {
  const bothKnown = isNodeType(sourceType) && isNodeType(targetType);
  return bothKnown ? EDGE_LEGALITY_MATRIX[sourceType as NodeType][targetType as NodeType] : 'allow';
}
