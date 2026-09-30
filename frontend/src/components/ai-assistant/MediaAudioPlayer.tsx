'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface MediaAudioPlayerProps {
  audioUrl: string;
  /** 下载文件名（缺省时从 URL 推断） */
  downloadName?: string;
  /** 额外操作按钮（如音乐卡的歌词开关），渲染在下载按钮左侧 */
  extraActions?: React.ReactNode;
  className?: string;
}

/** 秒数 → m:ss */
function formatTime(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * 极简音频播放器（AI 助手媒体任务卡共用）。
 *
 * 单色主题：primary 播放键 + muted 进度轨 + foreground 进度填充，随深浅主题自适应。
 * 一行式布局：[播放] [进度条] [时间] [extraActions] [下载]。
 * 控制区统一 onMouseDown 阻断冒泡，使外层可拖拽容器仍能空白处拖拽到画布。
 */
export function MediaAudioPlayer({ audioUrl, downloadName, extraActions, className }: MediaAudioPlayerProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  // 音频事件绑定
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setIsPlaying(false);
    const onTime = () => { !isSeeking && setCurrentTime(audio.currentTime); };
    const onMeta = () => setDuration(audio.duration || 0);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    return () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
    };
  }, [isSeeking]);

  const togglePlay = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    const playing = audio.paused;
    playing ? await audio.play().catch(() => {}) : audio.pause();
    setIsPlaying(playing);
  }, []);

  const seekTo = useCallback((clientX: number) => {
    const bar = progressRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  }, [duration]);

  const onProgressDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsSeeking(true);
    seekTo(e.clientX);
  }, [seekTo]);

  const onProgressMove = useCallback((e: React.PointerEvent) => {
    isSeeking && seekTo(e.clientX);
  }, [isSeeking, seekTo]);

  const onProgressUp = useCallback((e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsSeeking(false);
  }, []);

  const onDownload = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = audioUrl;
    link.download = downloadName || audioUrl.split('/').pop() || 'audio';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [audioUrl, downloadName]);

  const fillPct = duration ? `${(currentTime / duration) * 100}%` : '0%';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* 播放 / 暂停 */}
      <button
        type="button"
        onClick={togglePlay}
        onMouseDown={(e) => e.stopPropagation()}
        title={isPlaying ? t('ai.mediaTask.pause', '暂停') : t('ai.mediaTask.play', '播放')}
        className="shrink-0 size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 active:scale-95 transition-all"
      >
        {isPlaying
          ? <Pause className="size-3.5" fill="currentColor" />
          : <Play className="size-3.5 ml-0.5" fill="currentColor" />}
      </button>

      {/* 进度条 */}
      <div
        ref={progressRef}
        className="group flex-1 h-4 flex items-center cursor-pointer"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={onProgressDown}
        onPointerMove={onProgressMove}
        onPointerUp={onProgressUp}
      >
        <div className="w-full h-1 rounded-full bg-muted relative">
          <div className="absolute left-0 top-0 h-full rounded-full bg-foreground/70" style={{ width: fillPct }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 size-2 rounded-full bg-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${fillPct} - 4px)` }}
          />
        </div>
      </div>

      {/* 时间 */}
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {extraActions && (
        <span className="flex items-center" onMouseDown={(e) => e.stopPropagation()}>{extraActions}</span>
      )}

      {/* 下载 */}
      <button
        type="button"
        onClick={onDownload}
        onMouseDown={(e) => e.stopPropagation()}
        title={t('ai.mediaTask.download', '下载')}
        className="shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Download className="size-3.5" />
      </button>
    </div>
  );
}

export default MediaAudioPlayer;
