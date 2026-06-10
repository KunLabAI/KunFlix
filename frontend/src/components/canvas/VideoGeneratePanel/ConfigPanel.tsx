'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  VIDEO_MODE_LABELS,
  RESOLUTION_LABELS,
  ASPECT_RATIO_LABELS,
  type VideoModelCapabilities,
} from '@/hooks/useVideoGeneration';
import { ToggleSwitch } from './ToggleSwitch';
import { AspectRatioIcon } from '../ImageGeneratePanel/AspectRatioIcon';

interface Visibility {
  showModeSelect: boolean;
  showDurationSlider: boolean;
  durationOptions: number[];
  resolutionOptions: string[];
  aspectRatioOptions: string[];
  showPromptOptimizer: boolean;
  showFastPretreatment: boolean;
}

interface Props {
  capabilities: VideoModelCapabilities | null;
  visibility: Visibility;
  videoMode: string;
  setVideoMode: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
  quality: string;
  setQuality: (v: string) => void;
  aspectRatio: string;
  setAspectRatio: (v: string) => void;
  promptOptimizer: boolean;
  setPromptOptimizer: (v: boolean) => void;
  fastPretreatment: boolean;
  setFastPretreatment: (v: boolean) => void;
}

/* ─── 通用 SegmentedControl：水平按钮组 + framer-motion 滑动指示器 + 溢出横向滚动 ─── */
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    el && setCanScrollLeft(el.scrollLeft > 1);
    el && setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // 测量指示器位置（像素级，不依赖等宽假设）
  const measureIndicator = useCallback(() => {
    const activeEl = itemRefs.current.get(value);
    activeEl && setIndicator({ left: activeEl.offsetLeft, width: activeEl.offsetWidth });
  }, [value]);

  useEffect(() => {
    const el = scrollRef.current;
    const ro = new ResizeObserver(() => { checkScroll(); measureIndicator(); });
    el && ro.observe(el);
    el?.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
    measureIndicator();
    return () => { ro.disconnect(); el?.removeEventListener('scroll', checkScroll); };
  }, [checkScroll, measureIndicator, options.length]);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -80 : 80, behavior: 'smooth' });
  };

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      )}
      <div className="relative">
        {/* 左侧滚动按钮 */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scroll('left')}
            className="absolute left-0 top-0 bottom-0 z-10 flex items-center pl-0.5 pr-1.5 rounded-l-lg bg-gradient-to-r from-muted/90 via-muted/60 to-transparent cursor-pointer"
          >
            <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          </button>
        )}

        {/* 滚动容器 */}
        <div
          ref={scrollRef}
          className="overflow-x-auto rounded-lg"
          style={{ scrollbarWidth: 'none' }}
        >
          <div ref={innerRef} className="relative flex items-center gap-0.5 p-[3px] rounded-lg bg-muted/50 min-w-full w-max">
            {/* 滑动指示器（像素级定位） */}
            {indicator && (
              <motion.span
                className="absolute top-[3px] bottom-[3px] rounded-md bg-background shadow-sm"
                animate={{ left: indicator.left, width: indicator.width }}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  ref={(el) => { el ? itemRefs.current.set(opt.value, el) : itemRefs.current.delete(opt.value); }}
                  type="button"
                  title={opt.title}
                  onClick={() => onChange(opt.value)}
                  className={cn(
                    'relative z-[1] grow shrink-0 basis-auto flex items-center justify-center rounded-md font-medium whitespace-nowrap',
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

        {/* 右侧滚动按钮 */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scroll('right')}
            className="absolute right-0 top-0 bottom-0 z-10 flex items-center pr-0.5 pl-1.5 rounded-r-lg bg-gradient-to-l from-muted/90 via-muted/60 to-transparent cursor-pointer"
          >
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

/** 展开式配置面板：mode / duration / quality / aspect / toggles */
export function ConfigPanel({
  capabilities,
  visibility,
  videoMode,
  setVideoMode,
  duration,
  setDuration,
  quality,
  setQuality,
  aspectRatio,
  setAspectRatio,
  promptOptimizer,
  setPromptOptimizer,
  fastPretreatment,
  setFastPretreatment,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl bg-card p-2.5 space-y-2.5 text-xs cursor-default animate-in fade-in slide-in-from-top-1 border duration-150">
      {/* Mode */}
      {visibility.showModeSelect && (
        <SegmentedControl
          label={t('canvas.node.video.mode')}
          options={(capabilities?.modes || []).map((mode) => ({
            value: mode,
            label: t(`canvas.node.video.mode_${mode}`, VIDEO_MODE_LABELS[mode] || mode),
          }))}
          value={videoMode}
          onChange={setVideoMode}
        />
      )}

      {/* Duration */}
      <SegmentedControl
        label={t('canvas.node.video.duration')}
        options={visibility.durationOptions.map((d) => ({
          value: String(d),
          label: d === -1 ? 'Auto' : `${d}s`,
        }))}
        value={String(duration)}
        onChange={(v) => setDuration(Number(v))}
      />

      {/* Quality */}
      <SegmentedControl
        label={t('canvas.node.video.quality')}
        options={visibility.resolutionOptions.map((r) => ({
          value: r,
          label: RESOLUTION_LABELS[r] || r,
        }))}
        value={quality}
        onChange={setQuality}
      />

      {/* Aspect Ratio */}
      <SegmentedControl
        label={t('canvas.node.video.aspectRatio')}
        vertical
        options={visibility.aspectRatioOptions.map((ar) => ({
          value: ar,
          leading: <AspectRatioIcon ratio={ar} className={cn('w-4 h-4 shrink-0', ar === aspectRatio ? 'text-foreground' : 'text-muted-foreground')} />,
          label: ASPECT_RATIO_LABELS[ar] || ar,
        }))}
        value={aspectRatio}
        onChange={setAspectRatio}
      />

      {/* Advanced toggles */}
      {(visibility.showPromptOptimizer || visibility.showFastPretreatment) && (
        <div className="space-y-1.5 pt-1.5 border-t border-border/30">
          {visibility.showPromptOptimizer && (
            <ToggleSwitch
              checked={promptOptimizer}
              onChange={setPromptOptimizer}
              label={t('canvas.node.video.promptOptimizer')}
              icon={<Sparkles className="w-3 h-3" />}
            />
          )}
          {visibility.showFastPretreatment && (
            <ToggleSwitch
              checked={fastPretreatment}
              onChange={setFastPretreatment}
              label={t('canvas.node.video.fastPretreatment')}
              icon={<Zap className="w-3 h-3" />}
            />
          )}
        </div>
      )}
    </div>
  );
}
