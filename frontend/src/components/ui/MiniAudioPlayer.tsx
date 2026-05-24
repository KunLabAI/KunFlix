'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

interface MiniAudioPlayerProps {
  src: string;
  autoPlay?: boolean;
  className?: string;
}

/**
 * 迷你音频播放器 — 用于资产列表/预览场景
 * 统一风格：播放按钮 + 进度条 + 时间 + 音量
 */
export function MiniAudioPlayer({ src, autoPlay = false, className = '' }: MiniAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  // 音频事件
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => { !isSeeking && setCurrentTime(audio.currentTime); };
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [isSeeking]);

  // autoPlay
  useEffect(() => {
    autoPlay && audioRef.current?.play().catch(() => {});
  }, [autoPlay]);

  // 播放/暂停
  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const audio = audioRef.current;
    if (!audio) return;
    audio.paused ? audio.play() : audio.pause();
  }, []);

  // seek
  const seekTo = useCallback((clientX: number) => {
    const bar = progressRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  }, [duration]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsSeeking(true);
    seekTo(e.clientX);
  }, [seekTo]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    isSeeking && seekTo(e.clientX);
  }, [isSeeking, seekTo]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsSeeking(false);
  }, []);

  // 静音
  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex items-center gap-2 ${className}`} onClick={(e) => e.stopPropagation()}>
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* 播放/暂停 */}
      <button
        onClick={togglePlay}
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-foreground/10 hover:bg-foreground/20 transition-colors"
      >
        {isPlaying ? (
          <Pause className="w-3 h-3 text-foreground" fill="currentColor" />
        ) : (
          <Play className="w-3 h-3 text-foreground ml-0.5" fill="currentColor" />
        )}
      </button>

      {/* 进度条 */}
      <div
        ref={progressRef}
        className="flex-1 h-4 flex items-center cursor-pointer group"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="w-full h-[2px] bg-muted rounded-full relative overflow-visible">
          <div
            className="absolute left-0 top-0 h-full bg-foreground/40 rounded-full transition-[width] duration-75"
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-foreground/70 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: duration ? `calc(${(currentTime / duration) * 100}% - 4px)` : '0' }}
          />
        </div>
      </div>

      {/* 时间 */}
      <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
        {formatTime(currentTime)}/{formatTime(duration)}
      </span>

      {/* 音量 */}
      <button
        onClick={toggleMute}
        className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
      >
        {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
      </button>
    </div>
  );
}
