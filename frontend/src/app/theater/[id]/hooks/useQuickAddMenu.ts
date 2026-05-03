import { useState, useCallback, useEffect } from 'react';
import { useReactFlow, FinalConnectionState } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { useCanvasStore, CanvasNode } from '@/store/useCanvasStore';

// Node type default data registry (avoids switch/case)
const nodeDefaultData: Record<string, Record<string, unknown>> = {
  text: { title: '新文本卡', content: null, tags: [] },
  image: { name: '新图片卡', description: '', imageUrl: '', images: [] },
  storyboard: { shotNumber: '001', description: '', duration: 5 },
  video: { name: '新视频卡', description: '', videoUrl: '', fitMode: 'cover' },
  audio: { name: '新音频卡', description: '', audioUrl: '' },
};

// Default dimensions by node type
const nodeDefaultDimensions: Record<string, { width: number; height: number }> = {
  text: { width: 400, height: 300 },
  image: { width: 512, height: 384 },
  video: { width: 512, height: 384 },
  audio: { width: 360, height: 200 },
  storyboard: { width: 398, height: 256 },
};

export interface QuickAddMenuState {
  show: boolean;
  x: number;
  y: number;
  sourceNodeId: string | null;
  sourceHandleId: string | null;
}

export function useQuickAddMenu() {
  const { screenToFlowPosition } = useReactFlow();
  const { addNode, connectAndInject } = useCanvasStore();

  const [menuState, setMenuState] = useState<QuickAddMenuState>({
    show: false,
    x: 0,
    y: 0,
    sourceNodeId: null,
    sourceHandleId: null,
  });

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (connectionState.isValid) return;
      if (!connectionState.fromNode) return;

      const target = event.target as Element;
      const isPane = target.classList.contains('react-flow__pane') || 
                     target.classList.contains('react-flow__background') || 
                     !!target.closest('.react-flow__pane') ||
                     !!target.closest('.react-flow__background');
                     
      if (!isPane) return;

      let clientX: number | undefined;
      let clientY: number | undefined;
      
      if ('clientX' in event) {
        clientX = event.clientX;
        clientY = event.clientY;
      } else if (event.changedTouches && event.changedTouches.length > 0) {
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
      }

      if (clientX !== undefined && clientY !== undefined) {
        setTimeout(() => {
          setMenuState({
            show: true,
            x: clientX as number,
            y: clientY as number,
            sourceNodeId: connectionState.fromNode?.id || null,
            sourceHandleId: connectionState.fromHandle?.id || null,
          });
        }, 50);
      }
    },
    []
  );

  const handleAddNodeFromMenu = useCallback((type: string) => {
    if (!menuState.sourceNodeId) return;

    const position = screenToFlowPosition({
      x: menuState.x,
      y: menuState.y,
    });

    const newNodeId = uuidv4();
    const data = nodeDefaultData[type] || { label: `${type} node` };
    const dimensions = nodeDefaultDimensions[type];

    const newNode = {
      id: newNodeId,
      type,
      position,
      width: dimensions?.width,
      height: dimensions?.height,
      data,
    } as CanvasNode;

    addNode(newNode);

    // 根据拖拽起点 handle 的几何侧边决定连线方向：
    // - 右侧拖出：原节点 = source，新节点 = target（正向，将原节点内容注入到新节点）
    // - 左侧拖出：新节点 = source，原节点 = target（反向，新节点为空不会注入，符合几何语义）
    // Loose 模式下拖拽起点 handle 始终是 `*-source`，因此只看前缀方向。
    const srcHandle = menuState.sourceHandleId || '';
    const isLeftEdge = srcHandle.startsWith('left-');
    const connectionSource = isLeftEdge ? newNodeId : menuState.sourceNodeId;
    const connectionTarget = isLeftEdge ? menuState.sourceNodeId : newNodeId;
    const sourceHandle = 'right-source';
    const targetHandle = 'left-target';

    // 建连线；若源节点有可注入内容，`connectAndInject` 内部会弹 confirm Toast
    // 让用户选择是否注入。用户选“取消”：线已建立但不注入 = 空节点；
    // 用户选“注入”：执行 doInject。源节点无内容时内部会提前 return，不弹。
    connectAndInject({
      source: connectionSource,
      sourceHandle: sourceHandle,
      target: connectionTarget,
      targetHandle: targetHandle,
    });

    setMenuState((prev) => ({ ...prev, show: false }));
  }, [menuState, screenToFlowPosition, addNode, connectAndInject]);

  // Close menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest('.quick-add-menu')) return;
      
      menuState.show && setMenuState((prev) => ({ ...prev, show: false }));
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [menuState.show]);

  return { menuState, onConnectEnd, handleAddNodeFromMenu };
}
