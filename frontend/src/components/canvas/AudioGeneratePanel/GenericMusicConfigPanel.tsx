'use client';

import React, { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useDropdownOutside } from '@/hooks/useDropdownOutside';
import {
  MUSIC_OUTPUT_FORMAT_LABELS,
  type MusicModelCapabilities,
} from '@/hooks/useMusicGeneration';
import { SELECT_CLS, SELECT_ARROW_STYLE } from './constants';

interface Props {
  capabilities: MusicModelCapabilities | null;
  outputFormat: 'mp3' | 'wav';
  setOutputFormat: (v: 'mp3' | 'wav') => void;
  negativePrompt: string;
  setNegativePrompt: (v: string) => void;
}

/**
 * 通用音乐模型配置面板 —— 仅包含不依赖 Lyria 特有字段的最小集合：
 * - 输出格式（若 capabilities 声明支持）
 * - 反向提示（通用）
 */
export function GenericMusicConfigPanel({
  capabilities,
  outputFormat,
  setOutputFormat,
  negativePrompt,
  setNegativePrompt,
}: Props) {
  const { t } = useTranslation();
  const [fmtOpen, setFmtOpen] = useState(false);
  const fmtRef = useRef<HTMLDivElement>(null);

  useDropdownOutside([[fmtOpen, fmtRef, setFmtOpen]]);

  const formats = capabilities?.formats || ['mp3'];

  return (
    <div className="rounded-lg border border-border/50 bg-card p-2.5 space-y-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          {t('canvas.node.audio.outputFormat', '输出格式')}
        </label>
        <div className="relative" ref={fmtRef}>
          <button
            type="button"
            onClick={() => setFmtOpen((v) => !v)}
            className={cn(SELECT_CLS, 'flex items-center justify-between')}
            style={SELECT_ARROW_STYLE}
          >
            {MUSIC_OUTPUT_FORMAT_LABELS[outputFormat] || outputFormat}
          </button>
          {fmtOpen && (
            <div className="absolute top-full left-0 mt-1 w-full rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
              {formats.map((f) => {
                const v = f as 'mp3' | 'wav';
                const isSelected = v === outputFormat;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => { setOutputFormat(v); setFmtOpen(false); }}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                      isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                    )}
                  >
                    <span className="flex-1 text-left">{MUSIC_OUTPUT_FORMAT_LABELS[f] || f}</span>
                    {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          {t('canvas.node.audio.negativePrompt', '反向提示（可选）')}
        </label>
        <textarea
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          placeholder={t('canvas.node.audio.negativePromptPlaceholder', '不希望出现的元素...')}
          rows={2}
          className="w-full resize-none rounded-md border border-border/50 bg-background px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  );
}
