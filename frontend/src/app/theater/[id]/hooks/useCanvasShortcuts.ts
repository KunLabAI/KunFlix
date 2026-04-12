import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '@/store/useCanvasStore';

export function useCanvasShortcuts() {
  const { undo, redo, saveToBackend } = useCanvasStore();
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;

      // Key-action mapping (avoids if-chain)
      const actions: Array<{ match: () => boolean; action: () => void }> = [
        // Save: Ctrl + S
        {
          match: () => mod && event.key === 's',
          action: () => saveToBackend().catch(console.error),
        },
        // Undo: Ctrl + Z (no shift)
        {
          match: () => mod && !event.shiftKey && event.key === 'z',
          action: () => undo(),
        },
        // Redo: Ctrl + Y or Ctrl + Shift + Z
        {
          match: () => mod && (event.key === 'y' || (event.shiftKey && event.key === 'z')),
          action: () => redo(),
        },
        // Zoom In: Ctrl + = / +
        {
          match: () => mod && (event.key === '=' || event.key === '+'),
          action: () => zoomIn(),
        },
        // Zoom Out: Ctrl + -
        {
          match: () => mod && event.key === '-',
          action: () => zoomOut(),
        },
        // Fit View: Ctrl + 0
        {
          match: () => mod && event.key === '0',
          action: () => fitView({ padding: 0.2, maxZoom: 1 }),
        },
      ];

      const matched = actions.find((a) => a.match());
      matched && (event.preventDefault(), matched.action());
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, saveToBackend, zoomIn, zoomOut, fitView]);
}
