'use client';

import React, { useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useDropdownOutside } from '@/hooks/useDropdownOutside';
import type { VirtualHumanPreset } from '@/hooks/useVideoGeneration';

interface Props {
  presets: VirtualHumanPreset[];
  imageRefCount: number;
  maxRefImages: number;
  taskActive: boolean;
  /** 返回 true 表示选择后应关闭下拉 */
  onSelect: (preset: VirtualHumanPreset) => boolean;
}

/** 虚拟人预设选择器（Seedance 系列模型专用） */
export function VirtualHumanPicker({
  presets,
  imageRefCount,
  maxRefImages,
  taskActive,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useDropdownOutside([[open, ref, setOpen]]);

  const disabled = taskActive || presets.length === 0 || imageRefCount >= maxRefImages;

  const handleClick = (p: VirtualHumanPreset) => {
    const shouldClose = onSelect(p);
    shouldClose && setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center',
          'text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          open && 'bg-accent text-foreground',
        )}
        title={t('canvas.node.video.selectVirtualHuman')}
      >
        <UserRound className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground border-b border-border/50">
            {t('canvas.node.video.selectVirtualHuman')}
          </div>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleClick(preset)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent transition-colors cursor-pointer"
            >
              <div className="h-9 w-9 shrink-0 relative">
                <img
                  src={preset.preview_url}
                  alt={preset.name}
                  className="h-9 w-9 rounded-lg object-cover border border-border/30"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <div className="hidden h-9 w-9 rounded-lg border border-border/30 bg-muted flex items-center justify-center absolute inset-0">
                  <UserRound className="w-4 h-4 text-muted-foreground/50" />
                </div>
              </div>
              <div className="flex flex-col min-w-0 flex-1 text-left">
                <span className="font-medium truncate text-foreground">{preset.name}</span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {preset.gender === 'female' ? '女' : '男'} · {preset.style}
                </span>
              </div>
              <UserRound className="w-3 h-3 shrink-0 text-purple-400" />
            </button>
          ))}
          {presets.length === 0 && (
            <div className="p-3 text-[10px] text-muted-foreground text-center">
              {t('canvas.node.video.noVirtualHumans')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
