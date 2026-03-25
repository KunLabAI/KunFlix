import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { useCanvasStore, CanvasNode } from '@/store/useCanvasStore';

export function useCanvasDragDrop(snapToGrid: boolean) {
  const { screenToFlowPosition } = useReactFlow();
  const { addNode } = useCanvasStore();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const dataStr = event.dataTransfer.getData('application/reactflow-data');
      const dimensionsStr = event.dataTransfer.getData('application/reactflow-dimensions');
      
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Snap to grid for dropped nodes if enabled
      if (snapToGrid) {
        position.x = Math.round(position.x / 20) * 20;
        position.y = Math.round(position.y / 20) * 20;
      }

      // Dimension defaults by type (avoids if-else chain)
      const defaultDimensions: Record<string, { width: number; height: number }> = {
        text: { width: 420, height: 320 },
        image: { width: 512, height: 384 },
        character: { width: 512, height: 384 },
        video: { width: 512, height: 384 },
        storyboard: { width: 398, height: 256 },
      };

      let width: number | undefined;
      let height: number | undefined;

      if (dimensionsStr) {
        const dims = JSON.parse(dimensionsStr);
        width = dims.width;
        height = dims.height;
      } else {
        const defaults = defaultDimensions[type];
        width = defaults?.width;
        height = defaults?.height;
      }

      const newNode: CanvasNode = {
        id: uuidv4(),
        type,
        position,
        data: dataStr ? JSON.parse(dataStr) : { label: `${type} node` },
        width,
        height,
      };

      addNode(newNode);
    },
    [screenToFlowPosition, addNode, snapToGrid]
  );

  return { onDragOver, onDrop };
}
