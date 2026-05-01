'use client';

import React, { type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { VideoGenHistoryEntry } from '@/store/useCanvasStore';

interface Props {
  historyVideos: VideoGenHistoryEntry[];
  showHistory: boolean;
  currentVideoUrl: string | null;
  onToggle: () => void;
  onClick: (url: string) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, entry: VideoGenHistoryEntry) => void;
  onDragEnd: (e: DragEvent<HTMLDivElement>, entry: VideoGenHistoryEntry) => void;
}

/**
 * 生成历史侧栏（节点左侧）+ 切换按钮
 */
export function HistorySidebar({
  historyVideos,
  showHistory,
  currentVideoUrl,
  onToggle,
  onClick,
  onDragStart,
  onDragEnd,
}: Props) {
  const { t } = useTranslation();
  if (historyVideos.length === 0) return null;

  return (
    <>
      <div
        className={cn(
          'absolute right-full top-0 bottom-0 mr-4 flex flex-col nodrag nopan z-10 transition-all duration-200',
          showHistory ? 'w-[80px] opacity-100' : 'w-0 opacity-0 pointer-events-none',
        )}
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col gap-1.5 py-1">
          {historyVideos.map((v, i) => (
            <div
              key={`${v.url}-${i}`}
              draggable
              onDragStart={(e) => onDragStart(e, v)}
              onDragEnd={(e) => onDragEnd(e, v)}
              onClick={() => onClick(v.url)}
              className={cn(
                'w-[72px] h-[56px] rounded-md border overflow-hidden cursor-grab active:cursor-grabbing shrink-0 relative group/hist transition-all',
                currentVideoUrl === v.url
                  ? 'border-primary ring-1 ring-primary/50'
                  : 'border-border/50 hover:border-primary/50',
              )}
              title={v.prompt || v.quality || t('canvas.node.video.aiGenerated')}
            >
              <video
                src={v.url}
                className="w-full h-full object-cover pointer-events-none"
                muted
                preload="metadata"
              />
              {v.quality && (
                <span className="absolute bottom-0 right-0 px-1 py-px text-[8px] font-medium bg-black/70 text-white rounded-tl">
                  {v.quality}
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
          showHistory ? 'mr-[106px]' : 'mr-1',
        )}
        title={t('canvas.node.video.historyToggle')}
      >
        <span className="text-[10px] font-bold">{historyVideos.length}</span>
      </button>
    </>
  );
}
