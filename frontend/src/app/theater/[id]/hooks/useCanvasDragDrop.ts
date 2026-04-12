import { useCallback, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { useCanvasStore, CanvasNode } from '@/store/useCanvasStore';
import { useFileDragDrop, type FileType } from './useFileDragDrop';

// Default dimensions by node type (for internal drag from sidebar/asset library)
const defaultDimensions: Record<string, { width: number; height: number }> = {
  text: { width: 400, height: 300 },
  image: { width: 512, height: 384 },
  video: { width: 512, height: 384 },
  audio: { width: 360, height: 200 },
  storyboard: { width: 398, height: 256 },
};

export function useCanvasDragDrop(wrapperRef: React.RefObject<HTMLDivElement | null>) {
  const { screenToFlowPosition } = useReactFlow();
  const { addNode } = useCanvasStore();

  // File drag drop (external files from OS)
  const fileDrag = useFileDragDrop(wrapperRef);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const hasReactFlowData = event.dataTransfer.types.includes('application/reactflow');
    const hasFiles = event.dataTransfer.types.includes('Files');

    // Priority: internal node drag > external file drag
    const handlers: Record<string, () => void> = {
      internal: () => {
        event.dataTransfer.dropEffect = 'move';
        fileDrag.resetDragState();
      },
      external: () => {
        event.dataTransfer.dropEffect = 'copy';
        fileDrag.onFileDragOver(event);
      },
      default: () => {
        event.dataTransfer.dropEffect = 'move';
      },
    };

    const key = hasReactFlowData ? 'internal' : hasFiles ? 'external' : 'default';
    handlers[key]();
  }, [fileDrag]);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    fileDrag.onFileDragLeave(event);
  }, [fileDrag]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      fileDrag.resetDragState();

      // Check internal drag first (sidebar/asset library)
      const type = event.dataTransfer.getData('application/reactflow');

      // No internal drag data - check for external file drop
      if (!type) {
        const files = event.dataTransfer.files;
        files.length > 0 && fileDrag.handleFileDrop(files, event.clientX, event.clientY);
        return;
      }

      // Handle internal node drag
      const dataStr = event.dataTransfer.getData('application/reactflow-data');
      const dimensionsStr = event.dataTransfer.getData('application/reactflow-dimensions');

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

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
    [screenToFlowPosition, addNode, fileDrag]
  );

  return {
    onDragOver,
    onDragLeave,
    onDrop,
    // Expose file drag state for overlay UI
    isDraggingFile: fileDrag.isDraggingFile,
    dragFileType: fileDrag.dragFileType,
    dragPosition: fileDrag.dragPosition,
  };
}
