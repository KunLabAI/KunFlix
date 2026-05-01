'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * 视频面板输入区底部拖拽缩放（针对 RefTagInput 内 [role="textbox"] 的 contenteditable）。
 * - 不能复用 usePanelResize：后者直接读 textareaRef.offsetHeight。
 */
export function useVideoPanelResize() {
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [inputMaxHeight, setInputMaxHeight] = useState<number | null>(null);

  const resizingRef = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartH = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = true;
    resizeStartY.current = e.clientY;
    const edEl = inputContainerRef.current?.querySelector('[role="textbox"]') as HTMLElement | null;
    resizeStartH.current = edEl?.offsetHeight ?? 44;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    resizingRef.current && (() => {
      const delta = e.clientY - resizeStartY.current;
      const newH = Math.max(44, Math.min(400, resizeStartH.current + delta));
      setInputMaxHeight(newH);
    })();
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    resizingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return {
    inputContainerRef,
    inputMaxHeight,
    resizeHandlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}
