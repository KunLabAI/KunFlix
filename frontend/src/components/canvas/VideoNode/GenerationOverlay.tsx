'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * AI 视频生成中的覆盖层（蓝色发光边框 + 旋转图标 + 文案）
 */
export function GenerationOverlay() {
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
      <div className="absolute inset-0 flex flex-col items-center justify-center z-[21] pointer-events-none">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-2" />
        <span className="text-sm font-medium text-blue-400">{t('canvas.node.video.generatingHint')}</span>
      </div>
    </>
  );
}
