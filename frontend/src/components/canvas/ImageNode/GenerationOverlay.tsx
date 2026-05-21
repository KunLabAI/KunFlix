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
 * AI 图像生成中的覆盖层（MeshGradient 着色器动画 + 淡入淡出过渡）
 */
export function GenerationOverlay({ active, elapsedMs }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 320, height: 320 });
  // 控制 DOM 是否挂载（fade-out 完成后卸载）
  const [mounted, setMounted] = useState(false);
  // 控制 opacity 过渡
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setMounted(true);
      // 下一帧触发 fade-in
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      // fade-out 结束后卸载 DOM
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
      {/* MeshGradient 背景层 备选的水晶色号 ['#a8d8ea', '#c9b1ff', '#e8d5f5', '#b8e4f0', '#d4c4fb', '#f0e6ff'] */}
      <div
        ref={containerRef}
        className="absolute inset-0 rounded-xl overflow-hidden"
      >
        <MeshGradient
          width={dimensions.width}
          height={dimensions.height}
          colors={['#cffafe', '#a5f3fc', '#bae6fd', '#e0f2fe', '#dbeafe', '#c7d2fe']}
          distortion={0.4}
          swirl={0.6}
          speed={0.8}
          offsetX={0.08}
          grainMixer={0}
          grainOverlay={0}
        />
        {/* 半透明遮罩保证文字可读性 */}
        <div className="absolute inset-0 bg-black/20 dark:bg-black/20" />
      </div>

      {/* 内容层：文字 + 计时 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 z-[21]">
        <span className="text-sm font-medium text-white/90">
          {t('canvas.node.image.generatingHint', '图像生成中…')}
        </span>
        <span className="text-xs font-mono text-white/70 tabular-nums">
          {(elapsedMs / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  );
}
