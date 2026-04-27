import { useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useCanvasStore } from '@/store/useCanvasStore';

/**
 * Return true when the keyboard event originated from an editable field
 * (native <input>/<textarea> or any contenteditable host, e.g. Tiptap).
 * Used to let undo/redo fall through to the focused editor instead of
 * being hijacked by the canvas-level shortcut handler.
 */
const isEditableEventTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true);
};

export function useCanvasShortcuts() {
  const { undo, redo, saveToBackend } = useCanvasStore();
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      // Let inputs/textareas/contenteditable handle their own undo/redo natively.
      const editable = isEditableEventTarget(event.target);

      // Key-action mapping (avoids if-chain)
      const actions: Array<{ match: () => boolean; action: () => void }> = [
        // Save: Ctrl + S
        {
          match: () => mod && event.key === 's',
          action: () => saveToBackend().catch(console.error),
        },
        // Undo: Ctrl + Z (no shift) — skip when focus is inside an editable field
        {
          match: () => mod && !event.shiftKey && event.key === 'z' && !editable,
          action: () => undo(),
        },
        // Redo: Ctrl + Y or Ctrl + Shift + Z — skip when focus is inside an editable field
        {
          match: () => mod && !editable && (event.key === 'y' || (event.shiftKey && event.key === 'z')),
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
