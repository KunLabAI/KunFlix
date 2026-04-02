import { useCallback, useRef } from 'react';
import type { Node } from '@xyflow/react';
import { useCanvasStore, type CanvasNode } from '@/store/useCanvasStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';
import { extractNodeAttachment } from '@/lib/nodeAttachmentUtils';

const AI_PANEL_SELECTOR = '[data-ai-panel-dropzone]';
const MAX_ATTACHMENTS = 5;

/**
 * 检测坐标是否在指定 rect 内
 */
function isPointInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * 画布节点拖拽到 AI 面板的检测 hook
 * 支持多选节点拖拽（最多5个图像节点）
 * 遵循 useCanvasSnapping 的 hook 模式
 */
export function useNodeDragToAI() {
  // 保存拖拽开始时的节点原始位置（支持多选）
  const originalPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // 缓存 AI 面板的 DOM rect
  const panelRectRef = useRef<DOMRect | null>(null);
  // 跟踪当前是否悬停在面板上
  const isOverPanelRef = useRef(false);
  // 当前拖拽的节点ID列表
  const draggedNodeIdsRef = useRef<string[]>([]);

  const onNodeDragStart = useCallback((event: React.MouseEvent, node: Node, nodes: Node[]) => {
    // 判断是否多选：按住 Ctrl 或节点已被选中且选中有多个节点
    const isMultiSelect = event.ctrlKey || event.metaKey || 
      (node.selected && nodes.filter(n => n.selected).length > 1);
    
    // 获取所有正在拖拽的节点
    const draggedNodes = isMultiSelect 
      ? nodes.filter(n => n.selected)
      : [node];
    
    // 保存所有拖拽节点的原始位置
    originalPositionsRef.current = new Map(
      draggedNodes.map(n => [n.id, { x: n.position.x, y: n.position.y }])
    );
    draggedNodeIdsRef.current = draggedNodes.map(n => n.id);
    
    // 缓存面板 rect
    const panelEl = document.querySelector(AI_PANEL_SELECTOR);
    panelRectRef.current = panelEl?.getBoundingClientRect() ?? null;
    isOverPanelRef.current = false;
  }, []);

  const onNodeDrag = useCallback((event: React.MouseEvent, _node: Node) => {
    const rect = panelRectRef.current;
    // 面板不存在（未打开）时，尝试检测关闭态按钮区域
    const panelEl = document.querySelector(AI_PANEL_SELECTOR);
    const currentRect = panelEl?.getBoundingClientRect() ?? rect;
    currentRect && (panelRectRef.current = currentRect);

    const isOver = !!currentRect && isPointInRect(event.clientX, event.clientY, currentRect);
    
    // 状态变化时才更新 store，减少渲染
    const prev = isOverPanelRef.current;
    isOverPanelRef.current = isOver;
    (isOver !== prev) && useAIAssistantStore.getState().setIsDragOverPanel(isOver);
  }, []);

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node, nodes: Node[]) => {
    const wasOverPanel = isOverPanelRef.current;
    
    // 重置拖拽悬停状态
    useAIAssistantStore.getState().setIsDragOverPanel(false);
    isOverPanelRef.current = false;

    // 若拖拽释放在面板上
    const originalPositions = originalPositionsRef.current;
    if (wasOverPanel && originalPositions.size > 0) {
      // 恢复所有拖拽节点的原始位置
      const { onNodesChange } = useCanvasStore.getState();
      const positionChanges = Array.from(originalPositions.entries()).map(([id, position]) => ({
        type: 'position' as const,
        id,
        position,
        dragging: false,
      }));
      onNodesChange(positionChanges);

      // 提取所有拖拽节点的附件数据（只取图像节点，最多5个）
      const store = useAIAssistantStore.getState();
      const draggedNodes = nodes.filter(n => draggedNodeIdsRef.current.includes(n.id));
      
      // 过滤出图像节点并限制数量
      const imageNodes = draggedNodes
        .filter(n => n.type === 'image')
        .slice(0, MAX_ATTACHMENTS);
      
      // 如果没有图像节点但有其他节点，取第一个
      const nodesToAttach = imageNodes.length > 0 
        ? imageNodes 
        : draggedNodes.slice(0, 1);
      
      // 提取附件并添加到 store
      nodesToAttach.forEach((n, index) => {
        const attachment = extractNodeAttachment(n as CanvasNode);
        index === 0 && store.nodeAttachments.length === 0
          ? store.setNodeAttachments([attachment])
          : store.addNodeAttachment(attachment);
      });
      
      // 面板未打开时自动打开
      !store.isOpen && store.setIsOpen(true);
    }

    // 清理 ref
    originalPositionsRef.current = new Map();
    draggedNodeIdsRef.current = [];
    panelRectRef.current = null;
  }, []);

  return { onNodeDragStart, onNodeDrag, onNodeDragStop };
}
