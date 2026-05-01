'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, X, PencilLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AnnotationCanvasHandle } from './AnnotationCanvas';
import { AnnotationToolbar } from './AnnotationToolbar';
import { useAnnotationState } from '@/hooks/useAnnotationState';
import type { ImagePreviewMode } from '@/hooks/useImagePreview';

// react-konva 不支持 SSR：动态导入并关闭 SSR。
const AnnotationCanvas = dynamic(() => import('./AnnotationCanvas'), { ssr: false });

interface Props {
  open: boolean;
  url: string;
  name: string;
  scale: number;
  position: { x: number; y: number };
  isDragging: boolean;
  mode: ImagePreviewMode;
  onClose: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  // 标注模式
  annotationEnabled?: boolean;
  isFull?: boolean;
  isSaving?: boolean;
  onEnterAnnotate: () => void;
  onExitAnnotate: () => void;
  onSaveAnnotation: (dataUrl: string | null) => Promise<string | null>;
}

/**
 * 全屏图像预览 Portal：默认 view（缩放/拖拽）；annotate 模式下渲染 Konva 画板与工具栏。
 */
export function ImagePreviewPortal({
  open,
  url,
  name,
  scale,
  position,
  isDragging,
  mode,
  onClose,
  onZoomIn,
  onZoomOut,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  annotationEnabled = true,
  isFull = false,
  isSaving = false,
  onEnterAnnotate,
  onExitAnnotate,
  onSaveAnnotation,
}: Props) {
  const { t } = useTranslation();
  const annotationApi = useAnnotationState();
  const canvasRef = useRef<AnnotationCanvasHandle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // 切换出标注模式或关闭时重置画板
  useEffect(() => {
    (mode !== 'annotate' || !open) && annotationApi.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, open]);

  // 计算可用画布尺寸
  useEffect(() => {
    if (mode !== 'annotate' || !open) return;
    const update = () => {
      const el = containerRef.current;
      el && setViewport({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [mode, open]);

  if (!open || typeof document === 'undefined') return null;

  const handleSave = async () => {
    const dataUrl = canvasRef.current?.getMergedDataURL(2) || null;
    const newUrl = await onSaveAnnotation(dataUrl);
    newUrl && (annotationApi.clear(), onExitAnnotate());
  };

  const handleExit = () => {
    if (annotationApi.isDirty && !window.confirm(t('canvas.node.annotation.confirmDiscard'))) return;
    annotationApi.clear();
    onExitAnnotate();
  };

  const handleClose = () => {
    if (mode === 'annotate' && annotationApi.isDirty) {
      if (!window.confirm(t('canvas.node.annotation.confirmDiscard'))) return;
    }
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={mode === 'view' ? onClose : undefined}
    >
      {/* Top-right controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-50" onClick={(e) => e.stopPropagation()}>
        {mode === 'view' && (
          <>
            <div className="bg-black/50 text-white px-3 py-1.5 rounded-md text-sm font-medium backdrop-blur-md">
              {Math.round(scale * 100)}%
            </div>
            <Button
              variant="secondary"
              size="icon"
              className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
              onClick={(e) => { e.stopPropagation(); onZoomIn(); }}
              title={t('canvas.node.preview.zoomIn', 'Zoom in')}
            >
              <ZoomIn className="h-5 w-5" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
              onClick={(e) => { e.stopPropagation(); onZoomOut(); }}
              title={t('canvas.node.preview.zoomOut', 'Zoom out')}
            >
              <ZoomOut className="h-5 w-5" />
            </Button>
            {annotationEnabled && (
              <Button
                variant="secondary"
                size="sm"
                className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
                onClick={(e) => { e.stopPropagation(); onEnterAnnotate(); }}
                title={t('canvas.node.annotation.enter')}
              >
                <PencilLine className="h-4 w-4 mr-1" />
                {t('canvas.node.annotation.enter')}
              </Button>
            )}
          </>
        )}
        <Button
          variant="secondary"
          size="icon"
          className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
          onClick={(e) => { e.stopPropagation(); handleClose(); }}
          title={t('canvas.node.preview.close', 'Close')}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Main area */}
      {mode === 'view' && (
        <div id="preview-container" className="w-full h-full flex items-center justify-center overflow-hidden p-8">
          <img
            src={url || undefined}
            alt={name}
            className="max-w-full max-h-full object-contain transition-transform duration-75 ease-out select-none"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              cursor: isDragging ? 'grabbing' : 'grab',
            }}
            draggable={false}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {mode === 'annotate' && (
        <>
          <div
            ref={containerRef}
            className="flex-1 w-full flex items-center justify-center overflow-hidden p-8 pb-28"
            onClick={(e) => e.stopPropagation()}
          >
            {viewport.w > 0 && viewport.h > 0 && (
              <AnnotationCanvas
                ref={canvasRef}
                url={url}
                api={annotationApi}
                viewportWidth={viewport.w}
                viewportHeight={viewport.h}
              />
            )}
          </div>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
            <AnnotationToolbar
              api={annotationApi}
              isSaving={isSaving}
              canSave={!isFull}
              saveDisabledReason={isFull ? t('canvas.node.upload.maxReached', { max: 9 }) : null}
              onSave={handleSave}
              onCancel={handleExit}
            />
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
