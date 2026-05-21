'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MeshGradient } from '@paper-design/shaders-react';
import { useTranslation } from 'react-i18next';

interface Props {
  active: boolean;
  elapsedMs: number;
}

const FADE_DURATION = 400; // ms

/**
 * AI 音乐生成中的覆盖层（MeshGradient 着色器动画 + 淡入淡出过渡）
 */
export function GenerationOverlay({ active, elapsedMs }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 320, height: 320 });
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), FADE_DURATION);
      return () => clearTimeout(timer);
    }
  }, [active]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setDimensions({ width: el.offsetWidth, height: el.offsetHeight });
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div
      className="absolute inset-0 z-[19] pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_DURATION}ms ease-in-out`,
      }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 rounded-xl overflow-hidden"
      >
        <MeshGradient
          width={dimensions.width}
          height={dimensions.height}
          colors={['#cffafe', '#a5f3fc', '#bae6fd', '#e0f2fe', '#dbeafe', '#c7d2fe']}
          distortion={1.2}
          swirl={0.6}
          speed={0.8}
          offsetX={0.08}
          grainMixer={0}
          grainOverlay={0}
        />
        <div className="absolute inset-0 bg-black/20 dark:bg-black/20" />
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 z-[21]">
        <span className="text-sm font-medium text-white/90">
          {t('canvas.node.audio.generatingHint', '音乐生成中…')}
        </span>
        <span className="text-xs font-mono text-white/70 tabular-nums">
          {(elapsedMs / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  );
}
