'use client';

import React, { useRef, useState } from 'react';
import { ChevronDown, Check, Ban, Feather } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useDropdownOutside } from '@/hooks/useDropdownOutside';
import { TRIGGER_CLS, DROPDOWN_CLS, OPTION_CLS, OPTION_SELECTED_CLS, OPTION_IDLE_CLS, STYLE_PRESETS } from './constants';

interface Props {
  value: string;                 // '' = 默认（不下发 style）；否则为英文 style 描述
  onChange: (v: string) => void;
  disabled?: boolean;
  compact?: boolean;             // 多说话人角色行内使用时更紧凑
}

/**
 * 语气风格下拉选择器（speech_metadata.style，作用于整段/整个说话人 turn）。
 * 20 种预设 + 「默认」；历史遗留的自由文本值以「自定义」条目回显。
 * 提交值始终为英文描述（模型语义），标签中英本地化展示。
 */
export function StyleSelector({ value, onChange, disabled, compact }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDropdownOutside([[open, ref, setOpen]]);

  const isZh = (i18n.language || 'en').toLowerCase().startsWith('zh');
  const localize = (labelKey: string, labelEn: string) => t(labelKey, labelEn);

  const preset = STYLE_PRESETS.find((p) => p.value === value);
  const label = !value
    ? t('canvas.node.tts.styleDefault', '默认风格')
    : preset
      ? localize(preset.labelKey, preset.labelEn)
      : value;

  const selectAndClose = (v: string) => { onChange(v); setOpen(false); };

  return (
    <div className={cn('relative', compact ? 'w-full' : 'w-full')} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={cn(TRIGGER_CLS, 'flex items-center justify-between gap-1', disabled && 'opacity-50 cursor-not-allowed')}
        title={t('canvas.node.tts.style', '语气风格')}
      >
        <span className="flex items-center gap-1 min-w-0">
          <Feather className={cn('w-3 h-3 shrink-0', value ? 'text-primary/70' : 'text-muted-foreground/60')} />
          <span className={cn('truncate', !value && 'text-muted-foreground/80')}>{label}</span>
          {!preset && !!value && (
            <span className="shrink-0 text-[9px] px-1 rounded bg-muted text-muted-foreground/70">
              {t('canvas.node.tts.styleCustom', '自定义')}
            </span>
          )}
        </span>
        <ChevronDown className={cn('w-3 h-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className={cn(DROPDOWN_CLS, 'w-56')}>
          {/* 默认（不下发 style，由音色固有语气演绎） */}
          <button
            type="button"
            onClick={() => selectAndClose('')}
            className={cn(OPTION_CLS, !value ? OPTION_SELECTED_CLS : OPTION_IDLE_CLS)}
          >
            <Ban className="w-3 h-3 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left">{t('canvas.node.tts.styleDefault', '默认风格')}</span>
            {!value && <Check className="w-3 h-3 shrink-0 text-primary" />}
          </button>

          <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-medium text-muted-foreground/70">
            {t('canvas.node.tts.stylePresets', '预设风格')}
          </div>
          {STYLE_PRESETS.map((p) => {
            const isSelected = p.value === value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => selectAndClose(p.value)}
                className={cn(OPTION_CLS, isSelected ? OPTION_SELECTED_CLS : OPTION_IDLE_CLS)}
              >
                <span className="flex-1 text-left truncate">
                  {localize(p.labelKey, p.labelEn)}
                  {isZh && <span className="text-muted-foreground/60 text-[10px] ml-1.5">{p.labelEn}</span>}
                </span>
                {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
