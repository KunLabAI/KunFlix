'use client';

import React, { useRef, useState } from 'react';
import { Check, Sparkles, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Slider } from '@/components/ui/slider';
import {
  VIDEO_MODE_LABELS,
  RESOLUTION_LABELS,
  ASPECT_RATIO_LABELS,
  type VideoModelCapabilities,
} from '@/hooks/useVideoGeneration';
import { useDropdownOutside } from '@/hooks/useDropdownOutside';
import { SELECT_CLS, SELECT_ARROW_STYLE } from './constants';
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
  containerRef: React.RefObject<HTMLDivElement | null>;
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
  containerRef,
}: Props) {
  const { t } = useTranslation();

  const [modeOpen, setModeOpen] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [aspectOpen, setAspectOpen] = useState(false);
  const modeRef = useRef<HTMLDivElement>(null);
  const qualityRef = useRef<HTMLDivElement>(null);
  const aspectRef = useRef<HTMLDivElement>(null);

  useDropdownOutside([
    [modeOpen, modeRef, setModeOpen],
    [qualityOpen, qualityRef, setQualityOpen],
    [aspectOpen, aspectRef, setAspectOpen],
  ]);

  const durationMin = visibility.durationOptions.length > 0 ? Math.min(...visibility.durationOptions) : 1;
  const durationMax = visibility.durationOptions.length > 0 ? Math.max(...visibility.durationOptions) : 10;

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-border/50 bg-card p-2.5 space-y-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-150"
    >
      {/* Mode */}
      {visibility.showModeSelect && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.video.mode')}</label>
          <div className="relative" ref={modeRef}>
            <button
              type="button"
              onClick={() => setModeOpen((v) => !v)}
              className={cn(SELECT_CLS, 'flex items-center justify-between')}
              style={SELECT_ARROW_STYLE}
            >
              {VIDEO_MODE_LABELS[videoMode] || videoMode}
            </button>
            {modeOpen && (
              <div className="absolute top-full left-0 mt-1 w-full rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                {capabilities?.modes.map((mode) => {
                  const isSelected = mode === videoMode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => { setVideoMode(mode); setModeOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                        isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                      )}
                    >
                      <span className="flex-1 text-left">{VIDEO_MODE_LABELS[mode] || mode}</span>
                      {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Duration */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.video.duration')}</label>
          <span className="text-[11px] font-medium">{duration === -1 ? 'Auto' : `${duration}s`}</span>
        </div>
        {visibility.showDurationSlider ? (
          <Slider
            value={[duration]}
            onValueChange={(v) => setDuration(v[0])}
            min={durationMin}
            max={durationMax}
            step={1}
          />
        ) : (
          <div className="flex gap-1 flex-wrap">
            {visibility.durationOptions.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] font-medium border transition-colors',
                  duration === d
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border/50 hover:bg-secondary',
                )}
              >
                {d === -1 ? 'Auto' : `${d}s`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quality + Aspect Ratio */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.video.quality')}</label>
          <div className="relative" ref={qualityRef}>
            <button
              type="button"
              onClick={() => setQualityOpen((v) => !v)}
              className={cn(SELECT_CLS, 'flex items-center justify-between')}
              style={SELECT_ARROW_STYLE}
            >
              {RESOLUTION_LABELS[quality] || quality}
            </button>
            {qualityOpen && (
              <div className="absolute top-full left-0 mt-1 w-full rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                {visibility.resolutionOptions.map((r) => {
                  const isSelected = r === quality;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => { setQuality(r); setQualityOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                        isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                      )}
                    >
                      <span className="flex-1 text-left">{RESOLUTION_LABELS[r] || r}</span>
                      {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">{t('canvas.node.video.aspectRatio')}</label>
          <div className="relative" ref={aspectRef}>
            <button
              type="button"
              onClick={() => setAspectOpen((v) => !v)}
              className={cn(SELECT_CLS, 'flex items-center gap-1.5')}
              style={SELECT_ARROW_STYLE}
            >
              <AspectRatioIcon ratio={aspectRatio} className="w-4 h-4 text-muted-foreground shrink-0" />
              {ASPECT_RATIO_LABELS[aspectRatio] || aspectRatio}
            </button>
            {aspectOpen && (
              <div className="absolute top-full left-0 mt-1 w-full rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
                {visibility.aspectRatioOptions.map((ar) => {
                  const isSelected = ar === aspectRatio;
                  return (
                    <button
                      key={ar}
                      type="button"
                      onClick={() => { setAspectRatio(ar); setAspectOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                        isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                      )}
                    >
                      <AspectRatioIcon ratio={ar} className={cn('w-4 h-4 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="flex-1 text-left">{ASPECT_RATIO_LABELS[ar] || ar}</span>
                      {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

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
