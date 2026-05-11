'use client';

import React from 'react';
import { Music } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  audioUrl: string;
  lyrics?: string;
}

/**
 * 音频播放区域：原生 audio 元素 + 可选歌词区（折叠展示）
 */
export function AudioDisplay({ audioUrl, lyrics }: Props) {
  const { t } = useTranslation();
  return (
    <div className="w-full h-full flex flex-col relative group/audio">
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-sm relative overflow-hidden">
        <Music className="w-12 h-12 text-purple-400/60" />
      </div>

      <audio
        src={audioUrl}
        controls
        className="w-full nodrag mt-1"
        onPointerDown={(e) => e.stopPropagation()}
        preload="metadata"
      />

      {/* 拖拽遮罩 — 覆盖图标区域但避开音频控制条 */}
      <div
        className="absolute top-0 left-0 right-0 h-[calc(100%-40px)] cursor-grab active:cursor-grabbing z-10"
        title={t('canvas.node.audio.dragToMove', '拖动音频')}
      />

      {/* 歌词折叠展示 */}
      {lyrics && (
        <details className="mt-1 nodrag" onPointerDown={(e) => e.stopPropagation()}>
          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground select-none">
            {t('canvas.node.audio.lyrics', '歌词')}
          </summary>
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap max-h-[120px] overflow-y-auto custom-scrollbar mt-1 p-1 bg-secondary/30 rounded">
            {lyrics}
          </pre>
        </details>
      )}
    </div>
  );
}
