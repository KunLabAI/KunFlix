'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  MUSIC_OUTPUT_FORMAT_LABELS,
  type MusicModelCapabilities,
} from '@/hooks/useMusicGeneration';

interface Props {
  capabilities: MusicModelCapabilities | null;
  outputFormat: 'mp3' | 'wav';
  setOutputFormat: (v: 'mp3' | 'wav') => void;
  negativePrompt: string;
  setNegativePrompt: (v: string) => void;
}

/* ─── SegmentedControl（对齐 ImageGeneratePanel） ─── */
interface SegmentOption {
  value: string;
  label?: React.ReactNode;
}

function SegmentedControl({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const activeIndex = options.findIndex((o) => o.value === value);
  const count = options.length;

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      )}
      <div className="relative flex items-center gap-0.5 p-[3px] rounded-lg bg-muted/50">
        {activeIndex >= 0 && (
          <motion.span
            className="absolute top-[3px] bottom-[3px] rounded-md bg-background shadow-sm"
            animate={{
              left: `calc(${(activeIndex / count) * 100}% + 3px)`,
              width: `calc(${100 / count}% - ${count > 1 ? '3' : '0'}px)`,
            }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                'relative z-[1] flex-1 flex items-center justify-center rounded-md font-medium whitespace-nowrap',
                'cursor-pointer select-none gap-1 px-2.5 py-1 text-[11px]',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70',
              )}
            >
              <span className="relative z-[1]">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 通用音乐模型配置面板 —— 输出格式 + 反向提示
 */
export function GenericMusicConfigPanel({
  capabilities,
  outputFormat,
  setOutputFormat,
  negativePrompt,
  setNegativePrompt,
}: Props) {
  const { t } = useTranslation();
  const formats = capabilities?.formats || ['mp3'];

  return (
    <div className="rounded-xl bg-card p-2.5 space-y-2.5 text-xs cursor-default animate-in fade-in slide-in-from-top-1 border duration-150">
      {/* Output Format */}
      <SegmentedControl
        label={t('canvas.node.audio.outputFormat', '输出格式')}
        options={formats.map((f) => ({
          value: f,
          label: MUSIC_OUTPUT_FORMAT_LABELS[f] || f.toUpperCase(),
        }))}
        value={outputFormat}
        onChange={(v) => setOutputFormat(v as 'mp3' | 'wav')}
      />

      {/* Negative Prompt */}
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
