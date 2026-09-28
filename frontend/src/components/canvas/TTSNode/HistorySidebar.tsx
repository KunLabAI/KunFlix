'use client';

import React, { type DragEvent } from 'react';
import { Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { TtsGenHistoryEntry } from '@/store/useCanvasStore';

interface Props {
  historyAudios: TtsGenHistoryEntry[];
  showHistory: boolean;
  currentAudioUrl: string | null;
  onToggle: () => void;
  onClick: (entry: TtsGenHistoryEntry) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, entry: TtsGenHistoryEntry) => void;
  onDragEnd: (e: DragEvent<HTMLDivElement>, entry: TtsGenHistoryEntry) => void;
}

/**
 * TTS 生成历史侧栏（节点左侧）+ 切换按钮。
 * 布局与 AudioNode/HistorySidebar 完全对齐：right-full 绝对定位、80px 宽、
 * 居中悬浮计数切换钮；卡片以麦克风图标 + 玫瑰青渐变体现 TTS 节点主题色。
 */
export function HistorySidebar({
  historyAudios,
  showHistory,
  currentAudioUrl,
  onToggle,
  onClick,
  onDragStart,
  onDragEnd,
}: Props) {
  const { t } = useTranslation();
  if (historyAudios.length === 0) return null;

  return (
    <>
      <div
        className={cn(
          'absolute right-full top-0 bottom-0 flex flex-col nodrag nopan z-10 transition-all duration-200',
          showHistory ? 'w-[80px] opacity-100' : 'w-0 opacity-0 pointer-events-none',
        )}
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col gap-1.5 py-1">
          {historyAudios.map((v, i) => (
            <div
              key={`${v.url}-${i}`}
              draggable
              onDragStart={(e) => onDragStart(e, v)}
              onDragEnd={(e) => onDragEnd(e, v)}
              onClick={() => onClick(v)}
              className={cn(
                'w-[72px] h-[56px] rounded-md border overflow-hidden cursor-grab active:cursor-grabbing shrink-0 relative group/hist transition-all flex flex-col items-center justify-center bg-gradient-to-br from-rose-500/10 to-cyan-500/10',
                currentAudioUrl === v.url
                  ? 'border-primary ring-1 ring-primary/50'
                  : 'border-border/50 hover:border-primary/50',
              )}
              title={v.text || v.voice || t('canvas.node.tts.aiGenerated', 'AI 语音')}
            >
              <Mic className="w-5 h-5 text-rose-400/80" />
              {v.voice && (
                <span className="absolute top-0 left-0 max-w-[68px] truncate px-1 py-px text-[8px] font-medium bg-black/70 text-white rounded-br">
                  {v.voice}
                </span>
              )}
              {v.model && (
                <span className="absolute bottom-0 right-0 max-w-[68px] truncate px-1 py-px text-[8px] font-medium bg-black/70 text-white rounded-tl">
                  {v.model.replace(/^gemini-/, '')}
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
        title={t('canvas.node.tts.historyToggle', '切换历史')}
      >
        <span className="text-[10px] font-bold">{historyAudios.length}</span>
      </button>
    </>
  );
}
