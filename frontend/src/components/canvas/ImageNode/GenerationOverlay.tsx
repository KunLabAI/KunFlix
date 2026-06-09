'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MeshGradient } from '@paper-design/shaders-react';
import { useTranslation } from 'react-i18next';

interface Props {
  active: boolean;
  elapsedMs: number;
  /** 批量数量（1-4），大于1时显示多宫格动画 */
  batchCount?: number;
}

const FADE_DURATION = 400; // ms

// 宫格布局配置映射表
const GRID_LAYOUT: Record<number, { cols: number; rows: number }> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 2, rows: 1 },
  3: { cols: 2, rows: 2 },
  4: { cols: 2, rows: 2 },
};

/**
 * 单个宫格内的 MeshGradient 动画单元
 */
function GradientCell({ width, height }: { width: number; height: number }) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      <MeshGradient
        width={width}
        height={height}
        colors={['#cffafe', '#a5f3fc', '#bae6fd', '#e0f2fe', '#dbeafe', '#c7d2fe']}
        distortion={0.4}
        swirl={0.6}
        speed={0.8}
        offsetX={0.08}
        grainMixer={0}
        grainOverlay={0}
      />
    </div>
  );
}

/**
 * AI 图像生成中的覆盖层（MeshGradient 着色器动画 + 淡入淡出过渡）
 * - batchCount=1：单个 MeshGradient 覆盖全区域
 * - batchCount=2-4：多宫格布局，每格独立 MeshGradient
 */
export function GenerationOverlay({ active, elapsedMs, batchCount = 1 }: Props) {
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

  const gridCount = Math.min(4, Math.max(1, batchCount));
  const layout = GRID_LAYOUT[gridCount];
  // 每个宫格的尺寸
  const cellWidth = Math.floor(dimensions.width / layout.cols);
  const cellHeight = Math.floor(dimensions.height / layout.rows);

  return (
    <div
      className="absolute inset-0 z-[19] pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_DURATION}ms ease-in-out`,
      }}
    >
      {/* MeshGradient 背景层 */}
      <div
        ref={containerRef}
        className="absolute inset-0 rounded-xl overflow-hidden"
      >
        {gridCount === 1 ? (
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
        ) : (
          <div
            className="w-full h-full grid"
            style={{
              gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
              gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
            }}
          >
            {Array.from({ length: gridCount }).map((_, i) => (
              <GradientCell key={i} width={cellWidth} height={cellHeight} />
            ))}
          </div>
        )}
        {/* 半透明遮罩保证文字可读性 */}
      </div>

      {/* 内容层：文字 + 计时 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 z-[21]">
        <span className="text-sm font-medium text-foreground/80 dark:text-black/80">
          {t('canvas.node.image.generatingHint', '图像生成中…')}
          {gridCount > 1 && ` (${gridCount}张)`}
        </span>
        <span className="text-xs font-mono text-foreground/60 dark:text-black/70 tabular-nums">
          {(elapsedMs / 1000).toFixed(1)}s
        </span>
      </div>
    </div>
  );
}
