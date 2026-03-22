import { useEffect } from 'react';
import { useCanvasStore } from '@/store/useCanvasStore';

export function useCanvasShortcuts() {
  const { undo, redo } = useCanvasStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Undo: Ctrl + Z
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key === 'z') {
        event.preventDefault();
        undo();
      }
      
      // Redo: Ctrl + Y or Ctrl + Shift + Z
      if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.shiftKey && event.key === 'z'))) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);
}
