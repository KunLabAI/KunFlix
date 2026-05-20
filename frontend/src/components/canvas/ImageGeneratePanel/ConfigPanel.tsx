'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Slider } from '@/components/ui/slider';
import {
  ASPECT_RATIO_LABELS,
  QUALITY_LABELS,
  IMAGE_MODE_LABELS,
  type ImageMode,
} from '@/hooks/useImageGeneration';
import { Dropdown, type DropdownOption } from './Dropdown';
import { AspectRatioIcon } from './AspectRatioIcon';
import { cn } from '@/lib/utils';

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
}: Props) {
  const { t } = useTranslation();

  const modeOptions: DropdownOption<ImageMode>[] = visibility.supportedModes.map((md) => ({
    value: md as ImageMode,
    label: t(`canvas.node.image.mode.${md}`, IMAGE_MODE_LABELS[md]),
  }));

  const aspectOptions: DropdownOption<string>[] = visibility.aspectRatioOptions.map((ar) => ({
    value: ar,
    leading: <AspectRatioIcon ratio={ar} className={cn('w-4 h-4 shrink-0', ar === aspectRatio ? 'text-primary' : 'text-muted-foreground')} />,
    label: ASPECT_RATIO_LABELS[ar] || ar,
  }));

  const qualityOptions: DropdownOption<string>[] = visibility.qualityOptions.map((q) => ({
    value: q,
    label: QUALITY_LABELS[q] || q,
  }));

  const formatOptions: DropdownOption<string>[] = visibility.outputFormatOptions.map((f) => ({
    value: f,
    label: f.toUpperCase(),
  }));

  // P2 下拉选项：空值 '' 代表 「由供应商默认」，不透传给后端
  const BG_LABELS: Record<string, string> = { auto: '默认', transparent: '透明', opaque: '不透明' };
  const MOD_LABELS: Record<string, string> = { auto: '默认', low: '宽松' };
  const backgroundOptions: DropdownOption<string>[] = [
    { value: '', label: '默认' },
    ...visibility.backgroundOptions.filter((b) => b !== 'auto').map((b) => ({ value: b, label: BG_LABELS[b] || b })),
  ];
  const moderationOptions: DropdownOption<string>[] = [
    { value: '', label: '默认' },
    ...visibility.moderationOptions.filter((m) => m !== 'auto').map((m) => ({ value: m, label: MOD_LABELS[m] || m })),
  ];

  // output_compression 仅在 webp / jpeg 下有意义
  const showCompression = visibility.supportsOutputCompression && (outputFormat === 'webp' || outputFormat === 'jpeg');

  return (
    <div className="rounded-lg border border-border/50 bg-card p-2.5 space-y-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
      {/* Mode */}
      {visibility.supportedModes.length > 1 && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.modeTitle', '生成模式')}</label>
          <Dropdown<ImageMode>
            value={mode}
            options={modeOptions}
            onChange={setMode}
            triggerContent={
              <span className="flex-1 text-left">
                {t(`canvas.node.image.mode.${mode}`, IMAGE_MODE_LABELS[mode])}
              </span>
            }
            buttonClassName="justify-between"
          />
        </div>
      )}

      {/* Aspect Ratio + Quality */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.aspectRatio', '画面比例')}</label>
          <Dropdown
            value={aspectRatio}
            options={aspectOptions}
            onChange={setAspectRatio}
            triggerContent={
              <>
                <AspectRatioIcon ratio={aspectRatio} className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{ASPECT_RATIO_LABELS[aspectRatio] || aspectRatio}</span>
              </>
            }
            maxHeightClass="max-h-56"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.quality', '画质')}</label>
          <Dropdown
            value={quality}
            options={qualityOptions}
            onChange={setQuality}
            triggerContent={<span className="flex-1 text-left">{QUALITY_LABELS[quality] || quality}</span>}
            buttonClassName="justify-between"
          />
        </div>
      </div>

      {/* Batch Count */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.batchCount', '生成数量')}</label>
          <span className="text-[11px] font-medium">{batchCount}</span>
        </div>
        <Slider
          value={[batchCount]}
          onValueChange={(v) => setBatchCount(v[0])}
          min={visibility.batchMin}
          max={visibility.batchMax}
          step={1}
        />
      </div>

      {/* Output Format */}
      {visibility.showOutputFormat && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.outputFormat', '输出格式')}</label>
          <Dropdown
            value={outputFormat}
            options={formatOptions}
            onChange={setOutputFormat}
            triggerContent={
              <span className="flex-1 text-left">
                {(outputFormat || visibility.outputFormatOptions[0] || '').toUpperCase()}
              </span>
            }
            buttonClassName="justify-between"
          />
        </div>
      )}

      {/* P2: Background / Moderation 双列 */}
      {(visibility.backgroundOptions.length > 0 || visibility.moderationOptions.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {visibility.backgroundOptions.length > 0 && (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.background', '背景')}</label>
              <Dropdown
                value={background}
                options={backgroundOptions}
                onChange={setBackground}
                triggerContent={
                  <span className="flex-1 text-left">{(BG_LABELS[background] || '默认')}</span>
                }
                buttonClassName="justify-between"
              />
            </div>
          )}
          {visibility.moderationOptions.length > 0 && (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.image.moderation', '安全等级')}</label>
              <Dropdown
                value={moderation}
                options={moderationOptions}
                onChange={setModeration}
                triggerContent={
                  <span className="flex-1 text-left">{(MOD_LABELS[moderation] || '默认')}</span>
                }
                buttonClassName="justify-between"
              />
            </div>
          )}
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
