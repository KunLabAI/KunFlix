'use client';

import React, { type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ImageGenHistoryEntry } from '@/store/useCanvasStore';

interface Props {
  historyImages: ImageGenHistoryEntry[];
  showHistory: boolean;
  imageList: string[];
  onToggle: () => void;
  onClick: (url: string) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, entry: ImageGenHistoryEntry) => void;
  onDragEnd: (e: DragEvent<HTMLDivElement>, entry: ImageGenHistoryEntry) => void;
}

/**
 * 生成历史侧栏（节点左侧）+ 切换按钮
 */
export function HistorySidebar({
  historyImages,
  showHistory,
  imageList,
  onToggle,
  onClick,
  onDragStart,
  onDragEnd,
}: Props) {
  const { t } = useTranslation();
  if (historyImages.length === 0) return null;

  return (
    <>
      <div
        className={cn(
          'absolute right-full top-0 bottom-0 mr-3 flex flex-col nodrag nopan z-10 transition-all duration-200',
          showHistory ? 'w-[72px] opacity-100' : 'w-0 opacity-0 pointer-events-none',
        )}
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col gap-1.5 py-1">
          {historyImages.map((entry, i) => (
            <div
              key={`${entry.url}-${i}`}
              draggable
              onDragStart={(e) => onDragStart(e, entry)}
              onDragEnd={(e) => onDragEnd(e, entry)}
              onClick={() => onClick(entry.url)}
              className={cn(
                'w-[68px] h-[68px] rounded-md border overflow-hidden cursor-grab active:cursor-grabbing shrink-0 relative group/hist transition-all',
                imageList.includes(entry.url)
                  ? 'border-primary ring-1 ring-primary/30'
                  : 'border-border/50 hover:border-primary/50',
              )}
              title={entry.prompt || entry.quality || t('canvas.node.image.aiGenerated', 'AI 生成图像')}
            >
              <img
                src={entry.url}
                alt=""
                className="w-full h-full object-cover pointer-events-none"
                draggable={false}
              />
              {entry.quality && (
                <span className="absolute bottom-0 right-0 px-1 py-px text-[8px] font-medium bg-black/70 text-white rounded-tl">
                  {entry.quality}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'absolute right-full top-1/2 -translate-y-1/2 w-5 h-10 flex items-center justify-center rounded-l-md border border-r-0 bg-background/90 backdrop-blur-sm text-muted-foreground hover:text-foreground transition-all nodrag z-10',
          showHistory ? 'mr-[76px]' : 'mr-1',
        )}
        title={t('canvas.node.image.historyToggle', '生成历史')}
      >
        <span className="text-[10px] font-bold">{historyImages.length}</span>
      </button>
    </>
  );
}
