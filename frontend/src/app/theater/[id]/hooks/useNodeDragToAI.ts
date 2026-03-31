import { useCallback, useRef } from 'react';
import type { Node } from '@xyflow/react';
import { useCanvasStore, type CanvasNode } from '@/store/useCanvasStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';
import { extractNodeAttachment } from '@/lib/nodeAttachmentUtils';

const AI_PANEL_SELECTOR = '[data-ai-panel-dropzone]';

/**
 * 检测坐标是否在指定 rect 内
 */
function isPointInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * 画布节点拖拽到 AI 面板的检测 hook
 * 遵循 useCanvasSnapping 的 hook 模式
 */
export function useNodeDragToAI() {
  // 保存拖拽开始时的节点原始位置
  const originalPositionRef = useRef<{ x: number; y: number } | null>(null);
  // 缓存 AI 面板的 DOM rect
  const panelRectRef = useRef<DOMRect | null>(null);
  // 跟踪当前是否悬停在面板上
  const isOverPanelRef = useRef(false);

  const onNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
    // 保存节点原始位置
    originalPositionRef.current = { x: node.position.x, y: node.position.y };
    
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

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    const wasOverPanel = isOverPanelRef.current;
    
    // 重置拖拽悬停状态
    useAIAssistantStore.getState().setIsDragOverPanel(false);
    isOverPanelRef.current = false;

    // 若拖拽释放在面板上
    const originalPos = originalPositionRef.current;
    if (wasOverPanel && originalPos) {
      // 恢复节点原始位置
      const { onNodesChange } = useCanvasStore.getState();
      onNodesChange([{
        type: 'position',
        id: node.id,
        position: originalPos,
        dragging: false,
      }]);

      // 提取节点数据并设置为附件
      const attachment = extractNodeAttachment(node as CanvasNode);
      const store = useAIAssistantStore.getState();
      store.setNodeAttachment(attachment);
      
      // 面板未打开时自动打开
      !store.isOpen && store.setIsOpen(true);
    }

    // 清理 ref
    originalPositionRef.current = null;
    panelRectRef.current = null;
  }, []);

  return { onNodeDragStart, onNodeDrag, onNodeDragStop };
}
