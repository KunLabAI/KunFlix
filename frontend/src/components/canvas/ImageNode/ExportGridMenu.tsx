'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  menuRef: React.RefObject<HTMLDivElement | null>;
  onExport: (pixelRatio: number) => void;
}

/**
 * 导出多宫格级联按钮：3X / 4X
 */
export function ExportGridMenu({ menuRef, onExport }: Props) {
  const { t } = useTranslation();
  return (
    <div
      ref={menuRef}
      className="absolute left-1/2 -translate-x-1/2 -top-[108px] flex items-center bg-background/95 backdrop-blur-md border border-border/60 rounded-full px-1 py-1 shadow-lg pointer-events-auto nodrag animate-in fade-in zoom-in-95 duration-150 z-30"
    >
      <button
        className="px-3 py-1 text-xs font-bold rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
        onClick={(e) => { e.stopPropagation(); onExport(3); }}
        title={t('canvas.node.upload.exportRatioHigh')}
      >
        3X
      </button>
      <div className="w-px h-4 bg-border/50" />
      <button
        className="px-3 py-1 text-xs font-bold rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
        onClick={(e) => { e.stopPropagation(); onExport(4); }}
        title={t('canvas.node.upload.exportRatioMax')}
      >
        4X
      </button>
    </div>
  );
}
