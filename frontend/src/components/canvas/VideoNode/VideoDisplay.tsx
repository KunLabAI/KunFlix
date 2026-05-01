'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  videoUrl: string;
  fitMode: 'cover' | 'contain';
  quality?: string;
  onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
}

/**
 * 视频播放区域：video 元素 + 拖拽遮罩 + 右上分辨率徽章
 */
export function VideoDisplay({ videoUrl, fitMode, quality, onLoadedMetadata }: Props) {
  const { t } = useTranslation();
  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative group/video">
      <video
        src={videoUrl}
        controls
        className={`w-full h-full rounded-sm nodrag ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
        onPointerDown={(e) => e.stopPropagation()}
        onLoadedMetadata={onLoadedMetadata}
      />

      {/* 拖拽遮罩 — 覆盖顶部播放区域但避开控制条 */}
      <div
        className="absolute top-0 left-0 w-full h-[calc(100%-50px)] cursor-grab active:cursor-grabbing z-10"
        title={t('canvas.node.video.dragToMove')}
      />

      {/* Hover 分辨率徽章 — 右上角 */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover/video:opacity-100 transition-opacity duration-200 z-[15] nodrag">
        {quality && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/60 text-white backdrop-blur-sm">
            {quality}
          </span>
        )}
      </div>
    </div>
  );
}
