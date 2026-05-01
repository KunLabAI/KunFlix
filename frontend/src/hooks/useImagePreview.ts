'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ImagePreviewMode = 'view' | 'annotate';

/**
 * 全屏图像预览：开关 + 缩放（wheel + 按钮）+ 拖拽 + ESC 关闭。
 * 另提供 mode 切换 (view/annotate) 供标注画板复用同一 Portal。
 */
export function useImagePreview() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<ImagePreviewMode>('view');
  const dragStartPosRef = useRef({ x: 0, y: 0 });

  const openPreview = useCallback((u: string) => {
    setUrl(u);
    setOpen(true);
    setMode('view');
  }, []);

  const closePreview = useCallback(() => {
    setOpen(false);
    setTimeout(() => {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setMode('view');
    }, 300);
  }, []);

  const enterAnnotate = useCallback(() => {
    setMode('annotate');
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const exitAnnotate = useCallback(() => {
    setMode('view');
  }, []);

  /** 外部完成保存后切换预览为新图 */
  const setPreviewUrl = useCallback((u: string) => {
    setUrl(u);
  }, []);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setScale((prev) => {
      const delta = e.deltaY * -0.001;
      return Math.min(Math.max(0.1, prev + delta), 5);
    });
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartPosRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position.x, position.y]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    isDragging && setPosition({
      x: e.clientX - dragStartPosRef.current.x,
      y: e.clientY - dragStartPosRef.current.y,
    });
  }, [isDragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  const zoomIn = useCallback(() => setScale((p) => Math.min(5, p + 0.25)), []);
  const zoomOut = useCallback(() => setScale((p) => Math.max(0.1, p - 0.25)), []);

  // Esc 关闭：标注模式下优先退出标注而非关闭预览
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open || e.key !== 'Escape') return;
      mode === 'annotate' ? exitAnnotate() : closePreview();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, mode, exitAnnotate, closePreview]);

  // body overflow + wheel 绑定（仅在 view 模式）
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    if (mode !== 'view') return () => { document.body.style.overflow = ''; };
    const container = document.getElementById('preview-container');
    container?.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      document.body.style.overflow = '';
      container?.removeEventListener('wheel', handleWheel);
    };
  }, [open, mode, handleWheel]);

  return {
    open,
    url,
    scale,
    position,
    isDragging,
    mode,
    openPreview,
    closePreview,
    enterAnnotate,
    exitAnnotate,
    setPreviewUrl,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    zoomIn,
    zoomOut,
  };
}
