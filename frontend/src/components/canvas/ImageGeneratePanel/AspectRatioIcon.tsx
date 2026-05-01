import React from 'react';

/** 画面比例 SVG 图标（与 VideoGeneratePanel 一致） */
export function AspectRatioIcon({ ratio, className }: { ratio: string; className?: string }) {
  const [w, h] = ratio.split(':').map(Number);
  const isAuto = !w || !h;
  const maxDim = 14;
  const scale = maxDim / Math.max(w || 1, h || 1);
  const rw = isAuto ? 10 : Math.round(w * scale);
  const rh = isAuto ? 10 : Math.round(h * scale);
  const ox = (16 - rw) / 2;
  const oy = (16 - rh) / 2;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      {isAuto ? (
        <text x="8" y="11" textAnchor="middle" fontSize="9" fontWeight="600" fill="currentColor">A</text>
      ) : (
        <rect x={ox} y={oy} width={rw} height={rh} rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      )}
    </svg>
  );
}
