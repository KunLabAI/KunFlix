'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  acquireVideoSlot,
  isVideoMetadataLoaded,
  markVideoMetadataLoaded,
} from '@/lib/canvas/videoLoadQueue';

interface Props {
  videoUrl: string;
  /**
   * 可选 poster（首帧封面）。视频未加载 metadata 前显示，避免黑屏空等。
   * 通常由父组件根据 videoUrl 派生（例如 `/api/media/<uuid>.mp4` →
   * `/api/media/poster/<uuid>.jpg`）。
   */
  posterUrl?: string;
  fitMode: 'cover' | 'contain';
  quality?: string;
  onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
}

/**
 * 视频播放区域：video 元素 + 拖拽遮罩 + 右上分辨率徽章。
 *
 * 性能优化：
 *   1. IntersectionObserver 视口懒加载 — 视口外不挂载 <video>，避免占用浏览器
 *      同源连接池（HTTP/1.1 默认 6 个），不阻塞 AI 面板等其他请求。
 *   2. 全局并发队列（acquireVideoSlot）— 即使多个节点同时进入视口，也限制最多
 *      3 个并发加载 metadata，错峰排队。
 *   3. metadata 加载后通过 markVideoMetadataLoaded 缓存 URL；同一视频再次进入
 *      视口时直接放行，无需排队。
 */
export function VideoDisplay({ videoUrl, posterUrl, fitMode, quality, onLoadedMetadata }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const releaseRef = useRef<(() => void) | null>(null);

  // 是否进入视口（IntersectionObserver 控制）
  const [isInView, setIsInView] = useState(false);
  // 是否已获得队列槽位、可以挂载真实 <video src>
  const [canLoad, setCanLoad] = useState<boolean>(() => isVideoMetadataLoaded(videoUrl));

  // 切换 videoUrl 时重置加载状态：已知 url 直接放行，未知则等待视口+队列
  useEffect(() => {
    setCanLoad(isVideoMetadataLoaded(videoUrl));
  }, [videoUrl]);

  // 视口检测：进入视口（含 200px 预热边界）后置 isInView=true，永久保持
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && setIsInView(true)),
      { rootMargin: '200px 200px 200px 200px', threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 进入视口后通过全局队列获取加载槽位
  useEffect(() => {
    const need = isInView && !canLoad && !!videoUrl;
    if (!need) return;
    let cancelled = false;
    acquireVideoSlot().then((release) => {
      cancelled
        ? release()
        : ((releaseRef.current = release), setCanLoad(true));
    });
    return () => {
      cancelled = true;
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, [isInView, canLoad, videoUrl]);

  // 卸载时释放槽位（兜底，正常应在 onLoadedMetadata 中释放）
  useEffect(() => {
    return () => {
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, []);

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    markVideoMetadataLoaded(videoUrl);
    releaseRef.current?.();
    releaseRef.current = null;
    // 自动 seek 到 0.1 秒，触发浏览器渲染该帧（解决 preload="metadata" 黑屏问题）。
    // 仅在暂停 + 未 seek 过时执行，避免打断正在播放或用户已手动 seek 的视频。
    // 视频不足 0.1 秒时浏览器会自动 clamp 到末帧，不会报错。
    video.paused && !video.currentTime && (video.currentTime = 0.1);
    onLoadedMetadata(e);
  };

  // 加载失败兜底释放（避免一个坏 URL 永久占据槽位）
  const handleError = () => {
    releaseRef.current?.();
    releaseRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center relative group/video"
    >
      {/* video 元素：仅在获得槽位后才设置 src，避免占用连接池 */}
      <video
        src={canLoad ? videoUrl : undefined}
        poster={posterUrl || undefined}
        controls
        preload="metadata"
        className={`w-full h-full rounded-sm nodrag ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
        onPointerDown={(e) => e.stopPropagation()}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleError}
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
