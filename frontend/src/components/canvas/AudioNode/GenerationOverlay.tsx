'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * AI 音乐生成中的覆盖层（紫色发光边框 + 旋转图标 + 文案）
 */
export function GenerationOverlay() {
  const { t } = useTranslation();
  return (
    <>
      <div
        className="absolute inset-[-3px] rounded-xl border-purple-400 border-[3px] pointer-events-none z-[20]"
        style={{
          animation: 'nodeEffectPulse 1.5s ease-in-out infinite',
          boxShadow: '0 0 12px 2px rgba(168,85,247,0.5), inset 0 0 12px 2px rgba(168,85,247,0.5)',
        }}
      />
      <div
        className="absolute inset-0 rounded-xl pointer-events-none z-[19]"
        style={{ backgroundColor: 'rgba(168,85,247,0.08)' }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center z-[21] pointer-events-none">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400 mb-2" />
        <span className="text-sm font-medium text-purple-400">
          {t('canvas.node.audio.generatingHint', '音乐生成中...')}
        </span>
      </div>
    </>
  );
}
