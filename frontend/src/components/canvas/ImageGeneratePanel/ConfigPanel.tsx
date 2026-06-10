'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MoreHorizontal, ChevronsUpDown } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import {
  ASPECT_RATIO_LABELS,
  QUALITY_LABELS,
  IMAGE_MODE_LABELS,
  type ImageMode,
} from '@/hooks/useImageGeneration';
import { AspectRatioIcon } from './AspectRatioIcon';
import { cn } from '@/lib/utils';

// 特殊比例（默认折叠）
const SPECIAL_RATIOS = new Set(['1:4', '4:1', '1:8', '8:1', '2:3', '3:2', '4:5', '5:4', '19.5:9', '9:19.5', '9:20', '1:2', '2:1']);

interface Visibility {
  aspectRatioOptions: string[];
  qualityOptions: string[];
  outputFormatOptions: string[];
  batchMin: number;
  batchMax: number;
  showOutputFormat: boolean;
  supportedModes: string[];
  // P2
  backgroundOptions: string[];
  moderationOptions: string[];
  supportsMask: boolean;
  supportsOutputCompression: boolean;
  // Seedream
  supportsWebSearch: boolean;
}

interface Props {
  visibility: Visibility;
  mode: ImageMode;
  setMode: (m: ImageMode) => void;
  aspectRatio: string;
  setAspectRatio: (v: string) => void;
  quality: string;
  setQuality: (v: string) => void;
  batchCount: number;
  setBatchCount: (v: number) => void;
  outputFormat: string;
  setOutputFormat: (v: string) => void;
  // P2
  background: string;
  setBackground: (v: string) => void;
  moderation: string;
  setModeration: (v: string) => void;
  outputCompression: number | null;
  setOutputCompression: (v: number | null) => void;
  // Seedream
  webSearch: boolean;
  setWebSearch: (v: boolean) => void;
}

/* ─── 通用 SegmentedControl：水平按钮组 + framer-motion 滑动指示器 ─── */
/* 采用 index 百分比驱动而非 layoutId（避免父层 transform 拖拽时 DOM 位置测量偏移） */
interface SegmentOption {
  value: string;
  label?: React.ReactNode;
  leading?: React.ReactNode;
  title?: string;
}

function SegmentedControl({
  options,
  value,
  onChange,
  label,
  vertical,
}: {
  options: SegmentOption[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
  vertical?: boolean;
}) {
  const activeIndex = options.findIndex((o) => o.value === value);
  const count = options.length;

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      )}
      <div className="relative flex items-center gap-0.5 p-[3px] rounded-lg bg-muted/50">
        {/* 滑动指示器：基于活动索引计算百分比位置，不依赖 DOM 测量 */}
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
              title={opt.title}
              onClick={() => onChange(opt.value)}
              className={cn(
                'relative z-[1] flex-1 flex items-center justify-center rounded-md font-medium whitespace-nowrap',
                'cursor-pointer select-none',
                vertical ? 'flex-col gap-0.5 px-1.5 py-1' : 'gap-1 px-2.5 py-1 text-[11px]',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70',
              )}
            >
              <span className={cn('relative z-[1] flex items-center', vertical ? 'flex-col gap-0.5' : 'gap-1')}>
                {opt.leading}
                {opt.label && <span className={vertical ? 'text-[9px] leading-none' : ''}>{opt.label}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ConfigPanel({
  visibility,
  mode,
  setMode,
  aspectRatio,
  setAspectRatio,
  quality,
  setQuality,
  batchCount,
  setBatchCount,
  outputFormat,
  setOutputFormat,
  background,
  setBackground,
  moderation,
  setModeration,
  outputCompression,
  setOutputCompression,
  webSearch,
  setWebSearch,
}: Props) {
  const { t } = useTranslation();
  const [showMoreRatios, setShowMoreRatios] = useState(false);
  const [showExtra, setShowExtra] = useState(false);

  const BG_LABELS: Record<string, string> = { '': '默认', transparent: '透明', opaque: '不透明' };
  const MOD_LABELS: Record<string, string> = { '': '默认', low: '宽松' };

  // 画面比例分组：常用 vs 特殊
  const commonRatios = visibility.aspectRatioOptions.filter((r) => !SPECIAL_RATIOS.has(r));
  const specialRatios = visibility.aspectRatioOptions.filter((r) => SPECIAL_RATIOS.has(r));

  // output_compression 仅在 webp / jpeg 下有意义
  const showCompression = visibility.supportsOutputCompression && (outputFormat === 'webp' || outputFormat === 'jpeg');

  return (
    <div className="rounded-xl bg-card p-2.5 space-y-2.5 text-xs cursor-default animate-in fade-in slide-in-from-top-1 border duration-150">
      {/* Mode */}
      {visibility.supportedModes.length > 1 && (
        <SegmentedControl
          label={t('canvas.node.image.modeTitle', '生成模式')}
          options={visibility.supportedModes.map((md) => ({
            value: md,
            label: t(`canvas.node.image.mode.${md}`, IMAGE_MODE_LABELS[md]),
          }))}
          value={mode}
          onChange={(v) => setMode(v as ImageMode)}
        />
      )}

      {/* Aspect Ratio — 图标 + 下方文字 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-muted-foreground">
            {t('canvas.node.image.aspectRatio', '画面比例')}
          </label>
          {specialRatios.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMoreRatios((v) => !v)}
              className={cn(
                'flex items-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none',
                showMoreRatios && 'text-foreground',
              )}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <SegmentedControl
          vertical
          options={commonRatios.map((ar) => ({
            value: ar,
            leading: <AspectRatioIcon ratio={ar} className={cn('w-4 h-4 shrink-0', ar === aspectRatio ? 'text-foreground' : 'text-muted-foreground')} />,
            label: ASPECT_RATIO_LABELS[ar] || ar,
          }))}
          value={aspectRatio}
          onChange={setAspectRatio}
        />
        {/* 特殊比例（折叠）— 纯 CSS Grid 过渡，无拖动 */}
        <div
          className="grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ gridTemplateRows: showMoreRatios && specialRatios.length > 0 ? '1fr' : '0fr', opacity: showMoreRatios ? 1 : 0 }}
        >
          <div className="overflow-hidden">
            <div className="pt-1">
              <SegmentedControl
                vertical
                options={specialRatios.map((ar) => ({
                  value: ar,
                  leading: <AspectRatioIcon ratio={ar} className={cn('w-4 h-4 shrink-0', ar === aspectRatio ? 'text-foreground' : 'text-muted-foreground')} />,
                  label: ASPECT_RATIO_LABELS[ar] || ar,
                }))}
                value={aspectRatio}
                onChange={setAspectRatio}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quality */}
      <SegmentedControl
        label={t('canvas.node.image.quality', '画质')}
        options={visibility.qualityOptions.map((q) => ({
          value: q,
          label: QUALITY_LABELS[q] || q,
        }))}
        value={quality}
        onChange={setQuality}
      />

      {/* Batch Count + Output Format — 折叠区 */}
      <div className="space-y-1">
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowExtra((v) => !v)}
            className={cn(
              'flex items-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none',
              showExtra && 'text-foreground',
            )}
          >
            <ChevronsUpDown className={cn('w-3.5 h-3.5 transition-transform duration-200', showExtra && 'rotate-180')} />
          </button>
        </div>
        {/* 折叠内容 — 纯 CSS Grid 过渡 */}
        <div
          className="grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ gridTemplateRows: showExtra ? '1fr' : '0fr', opacity: showExtra ? 1 : 0 }}
        >
          <div className="overflow-hidden">
            <div className="pt-1 space-y-2">
              {/* Batch Count */}
              <SegmentedControl
                label={t('canvas.node.image.batchCount', '生成数量')}
                options={Array.from({ length: visibility.batchMax - visibility.batchMin + 1 }, (_, i) => {
                  const v = visibility.batchMin + i;
                  return { value: String(v), label: String(v) };
                })}
                value={String(batchCount)}
                onChange={(v) => setBatchCount(Number(v))}
              />

              {/* Output Format */}
              {visibility.showOutputFormat && (
                <SegmentedControl
                  label={t('canvas.node.image.outputFormat', '输出格式')}
                  options={visibility.outputFormatOptions.map((f) => ({
                    value: f,
                    label: f.toUpperCase(),
                  }))}
                  value={outputFormat}
                  onChange={setOutputFormat}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Background */}
      {visibility.backgroundOptions.length > 0 && (
        <SegmentedControl
          label={t('canvas.node.image.background', '背景')}
          options={[
            { value: '', label: '默认' },
            ...visibility.backgroundOptions.filter((b) => b !== 'auto').map((b) => ({ value: b, label: BG_LABELS[b] || b })),
          ]}
          value={background}
          onChange={setBackground}
        />
      )}

      {/* Moderation */}
      {visibility.moderationOptions.length > 0 && (
        <SegmentedControl
          label={t('canvas.node.image.moderation', '安全等级')}
          options={[
            { value: '', label: '默认' },
            ...visibility.moderationOptions.filter((m) => m !== 'auto').map((m) => ({ value: m, label: MOD_LABELS[m] || m })),
          ]}
          value={moderation}
          onChange={setModeration}
        />
      )}

      {/* Seedream: 联网搜索开关 */}
      {visibility.supportsWebSearch && (
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.webSearch', '联网搜索')}</label>
          <button
            type="button"
            role="switch"
            aria-checked={webSearch}
            onClick={() => setWebSearch(!webSearch)}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
              webSearch ? 'bg-primary' : 'bg-muted-foreground/30',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform',
                webSearch ? 'translate-x-4' : 'translate-x-0',
              )}
            />
          </button>
        </div>
      )}

      {/* P2: Output Compression 滑块（仅 webp/jpeg） */}
      {showCompression && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.compression', '压缩率 (%)')}</label>
            <span className="text-[11px] font-medium">{outputCompression ?? '默认'}</span>
          </div>
          <Slider
            value={[outputCompression ?? 80]}
            onValueChange={(v) => setOutputCompression(v[0])}
            min={0}
            max={100}
            step={5}
          />
        </div>
      )}
    </div>
  );
}
