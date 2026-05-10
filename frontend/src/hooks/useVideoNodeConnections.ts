'use client';

import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '@/store/useCanvasStore';

/**
 * 视频节点的连线维护（link/unlink）。
 * - link: source (right-source) → target (left-target)
 * - unlink: 查找已存在的同向边并删除
 */
export function useVideoNodeConnections(targetId: string) {
  const { getEdges } = useReactFlow();

  const linkNode = useCallback((sourceNodeId: string) => {
    const edges = getEdges();
    const alreadyLinked = edges.some((e) => e.source === sourceNodeId && e.target === targetId);
    // 面板内选取已隐含用户同意且已有 ref 挂载，不重复弹注入确认。
    // suppressPanelInject：调用侧（useVideoPanelReferences 的 handleSelectNode / applySmartInject）已手动更新 UI，
    // 跳过 smart-image-inject 等面板事件，避免「UI 写一次 + 事件再写一次」的双添加。
    alreadyLinked || useCanvasStore.getState().connectAndInject({
      source: sourceNodeId,
      sourceHandle: 'right-source',
      target: targetId,
      targetHandle: 'left-target',
    }, { fromQuickAdd: true, silent: true, suppressPanelInject: true });
  }, [targetId, getEdges]);

  const unlinkNode = useCallback((sourceNodeId: string) => {
    const edges = getEdges();
    const edge = edges.find((e) => e.source === sourceNodeId && e.target === targetId);
    edge && useCanvasStore.getState().deleteEdge(edge.id);
  }, [targetId, getEdges]);

  return { linkNode, unlinkNode };
}
