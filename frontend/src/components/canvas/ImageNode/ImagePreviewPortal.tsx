'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, X } from 'lucide-react';

interface Props {
  open: boolean;
  url: string;
  name: string;
  scale: number;
  position: { x: number; y: number };
  isDragging: boolean;
  onClose: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}

/**
 * 全屏图像预览 Portal（缩放 / 拖拽 / 关闭按钮）
 */
export function ImagePreviewPortal({
  open,
  url,
  name,
  scale,
  position,
  isDragging,
  onClose,
  onZoomIn,
  onZoomOut,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: Props) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
        <div className="bg-black/50 text-white px-3 py-1.5 rounded-md text-sm font-medium backdrop-blur-md" onClick={e => e.stopPropagation()}>
          {Math.round(scale * 100)}%
        </div>
        <Button
          variant="secondary"
          size="icon"
          className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
          onClick={(e) => { e.stopPropagation(); onZoomIn(); }}
        >
          <ZoomIn className="h-5 w-5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
          onClick={(e) => { e.stopPropagation(); onZoomOut(); }}
        >
          <ZoomOut className="h-5 w-5" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

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
    </div>,
    document.body,
  );
}
