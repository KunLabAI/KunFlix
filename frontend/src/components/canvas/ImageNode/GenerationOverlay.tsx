'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  elapsedMs: number;
}

/**
 * AI 图像生成中的脚动覆盖层（蓝色发光 + 旋转图标 + 计时）
 */
export function GenerationOverlay({ elapsedMs }: Props) {
  const { t } = useTranslation();
  return (
    <>
      <div
        className="absolute inset-[-3px] rounded-xl border-blue-400 border-[3px] pointer-events-none z-[20]"
        style={{
          animation: 'nodeEffectPulse 1.5s ease-in-out infinite',
          boxShadow: '0 0 12px 2px rgba(59,130,246,0.5), inset 0 0 12px 2px rgba(59,130,246,0.5)',
        }}
      />
      <div
        className="absolute inset-0 rounded-xl pointer-events-none z-[19]"
        style={{ backgroundColor: 'rgba(59,130,246,0.08)' }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 z-[21] pointer-events-none">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <span className="text-sm font-medium text-blue-400">
          {t('canvas.node.image.generatingHint', '图像生成中…')}
        </span>
        <span className="text-xs font-mono text-blue-300/90 tabular-nums">
          {(elapsedMs / 1000).toFixed(1)}s
        </span>
      </div>
    </>
  );
}
