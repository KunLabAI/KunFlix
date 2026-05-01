'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_INPUT_MAX_H } from '@/components/canvas/ImageGeneratePanel/constants';

/**
 * 输入框底部拖拽缩放 + textarea auto-resize（Panel 专用）。
 * - 未拖拽时：textarea 随内容在 [44, DEFAULT_INPUT_MAX_H] 自适应
 * - 拖拽后：强制 = inputMaxHeight
 */
export function usePanelResize(prompt: string) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputMaxHeight, setInputMaxHeight] = useState<number | null>(null);
  const effectiveMaxH = inputMaxHeight ?? DEFAULT_INPUT_MAX_H;

  const resizingRef = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartH = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = true;
    resizeStartY.current = e.clientY;
    resizeStartH.current = textareaRef.current?.offsetHeight ?? 44;
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

  useEffect(() => {
    const el = textareaRef.current;
    el && (() => {
      el.style.height = 'auto';
      el.style.height = `${inputMaxHeight ?? Math.min(el.scrollHeight, DEFAULT_INPUT_MAX_H)}px`;
    })();
  }, [prompt, inputMaxHeight]);

  return {
    textareaRef,
    effectiveMaxH,
    resizeHandlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}
