'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Music2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  audioUrl: string;
  lyrics?: string;
}

/**
 * 音频播放区域：居中播放按钮 + 频谱波形动画（RGB颜色）+ 底部折叠歌词
 */
export function AudioDisplay({ audioUrl, lyrics }: Props) {
  const { t } = useTranslation();

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const colorsRef = useRef<string[]>([]);
  const timeRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [userScrolling, setUserScrolling] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const userScrollTimerRef = useRef<number>(0);

  // 解析 LRC 歌词（支持 [mm:ss.xx] 和 [ss.xx] 格式）
  const parsedLyrics = useMemo(() => {
    if (!lyrics?.trim()) return null;
    const lines: { time: number; text: string }[] = [];
    const regex = /\[(\d{1,2}):?(\d{2})\.(\d{2,3})\]/g;
    for (const line of lyrics.split('\n')) {
      const matches = [...line.matchAll(regex)];
      const text = line.replace(/\[\d{1,2}:?\d{2}\.\d{2,3}\]/g, '').trim();
      if (!text) continue;
      for (const m of matches) {
        const min = parseInt(m[1], 10);
        const sec = parseInt(m[2], 10);
        const ms = parseInt(m[3].padEnd(3, '0'), 10);
        lines.push({ time: min * 60 + sec + ms / 1000, text });
      }
      // 无时间戳的行也保留（作为纯文本歌词）
      matches.length === 0 && text && lines.push({ time: -1, text });
    }
    // 按时间排序（无时间戳的保持原始顺序）
    const hasTimestamps = lines.some((l) => l.time >= 0);
    hasTimestamps && lines.sort((a, b) => a.time - b.time);
    return lines.length > 0 ? { lines, hasTimestamps } : null;
  }, [lyrics]);

  // 当前活跃歌词行索引
  const activeLyricIdx = useMemo(() => {
    if (!parsedLyrics) return -1;
    const { lines, hasTimestamps } = parsedLyrics;
    // 有时间戳：精确匹配
    if (hasTimestamps) {
      let idx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].time >= 0 && lines[i].time <= currentTime) idx = i;
      }
      return idx;
    }
    // 无时间戳：按播放进度均匀分配
    if (duration > 0 && lines.length > 0) {
      const progress = currentTime / duration;
      return Math.min(Math.floor(progress * lines.length), lines.length - 1);
    }
    return -1;
  }, [parsedLyrics, currentTime, duration]);

  // 歌词自动滚动
  useEffect(() => {
    if (!showLyrics || userScrolling || activeLyricIdx < 0) return;
    const container = lyricsContainerRef.current;
    if (!container) return;
    const activeEl = container.querySelector(`[data-lyric-idx="${activeLyricIdx}"]`) as HTMLElement;
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeLyricIdx, showLyrics, userScrolling]);

  // 用户手动滚动时暂停自动滚动 3s
  const handleLyricsScroll = useCallback(() => {
    setUserScrolling(true);
    window.clearTimeout(userScrollTimerRef.current);
    userScrollTimerRef.current = window.setTimeout(() => setUserScrolling(false), 3000);
  }, []);

  // 点击歌词行跳转
  const handleLyricClick = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || time < 0) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  // 基于渐变色板生成颜色数组
  const PALETTE = ['#cffafe', '#a5f3fc', '#bae6fd', '#e0f2fe', '#dbeafe', '#c7d2fe'];
  const generateColors = useCallback((count: number) => {
    return Array.from({ length: count }, (_, i) => {
      const t = count > 1 ? i / (count - 1) : 0;
      const idx = t * (PALETTE.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.min(lo + 1, PALETTE.length - 1);
      const frac = idx - lo;
      const parse = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      const [r1, g1, b1] = parse(PALETTE[lo]);
      const [r2, g2, b2] = parse(PALETTE[hi]);
      const r = Math.round(r1 + (r2 - r1) * frac);
      const g = Math.round(g1 + (g2 - g1) * frac);
      const b = Math.round(b1 + (b2 - b1) * frac);
      return `rgb(${r},${g},${b})`;
    });
  }, []);

  // 初始化 Web Audio API
  const initAudioContext = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audioCtxRef.current) return;

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.8;

    const source = ctx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(ctx.destination);

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;

    colorsRef.current = generateColors(analyser.frequencyBinCount);
  }, [generateColors]);

  // 柱状条数量
  const BAR_COUNT = 48;
  const NEON_PALETTE = ['#ff00ff', '#ff2d95', '#00f0ff', '#7b2dff', '#00ff88', '#ff6b00'];
  const parseHex = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

  // 绘制环形频谱（中心圆 + 周围射线柱状）
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const centerX = width / 2;
    const centerY = height / 2;

    // 获取频谱数据
    const analyser = analyserRef.current;
    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);
    analyser?.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, width, height);

    timeRef.current += 0.015;
    const time = timeRef.current;

    // 尺寸计算
    const innerRadius = Math.min(width, height) * 0.16;
    const maxBarLength = Math.min(width, height) * 0.26;
    const barWidth = 3.5;

    // 将频谱数据分组平均到 BAR_COUNT 根柱条
    const binsPerBar = Math.floor(bufferLength / BAR_COUNT);
    const barValues: number[] = [];
    let avgVolume = 0;
    for (let i = 0; i < BAR_COUNT; i++) {
      let sum = 0;
      for (let j = 0; j < binsPerBar; j++) {
        sum += dataArray[i * binsPerBar + j];
      }
      const val = sum / binsPerBar / 255;
      barValues.push(val);
      avgVolume += val;
    }
    avgVolume /= BAR_COUNT;

    // 绘制柱状线条
    for (let i = 0; i < BAR_COUNT; i++) {
      const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;

      // 音频驱动高度 或 静默态脉动
      const audioVal = barValues[i];
      const idlePulse = 0.08 + Math.sin(time * 1.5 + i * 0.8) * 0.04;
      const value = analyser ? Math.max(audioVal, idlePulse) : idlePulse;
      const barLength = value * maxBarLength * (0.7 + avgVolume * 0.5);

      // 赛博朋克颜色插值（随节奏流动变化）
      const colorShift = time * 0.3 + avgVolume * 2;
      const t = ((i / BAR_COUNT) + colorShift) % 1;
      const colorIdx = t * (NEON_PALETTE.length - 1);
      const lo = Math.floor(colorIdx);
      const hi = Math.min(lo + 1, NEON_PALETTE.length - 1);
      const frac = colorIdx - lo;
      const [r1, g1, b1] = parseHex(NEON_PALETTE[lo]);
      const [r2, g2, b2] = parseHex(NEON_PALETTE[hi]);
      const r = Math.round(r1 + (r2 - r1) * frac);
      const g = Math.round(g1 + (g2 - g1) * frac);
      const b = Math.round(b1 + (b2 - b1) * frac);

      const x1 = centerX + Math.cos(angle) * (innerRadius + 4);
      const y1 = centerY + Math.sin(angle) * (innerRadius + 4);
      const x2 = centerX + Math.cos(angle) * (innerRadius + 4 + barLength);
      const y2 = centerY + Math.sin(angle) * (innerRadius + 4 + barLength);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.65 + value * 0.35})`;
      ctx.lineWidth = barWidth;
      ctx.lineCap = 'round';
      ctx.shadowColor = `rgba(${r},${g},${b},${0.4 + value * 0.4})`;
      ctx.shadowBlur = 5 + value * 8;
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    // 中心圆环（固定大小，紧贴柱条底部）
    const circleRadius = innerRadius + 2;

    // 圆环填充
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, circleRadius);
    grad.addColorStop(0, `rgba(100, 40, 180, ${0.12 + avgVolume * 0.15})`);
    grad.addColorStop(0.6, `rgba(0, 200, 255, ${0.06 + avgVolume * 0.08})`);
    grad.addColorStop(1, 'rgba(0, 200, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // 圆环描边 + 发光
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 220, 255, ${0.4 + avgVolume * 0.45})`;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(0, 220, 255, 0.5)';
    ctx.shadowBlur = 6 + avgVolume * 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    animFrameRef.current = requestAnimationFrame(draw);
  }, []);

  // 组件挂载后启动动画循环（静默态也有脉动）
  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  // 播放/暂停 切换
  const togglePlay = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    initAudioContext();

    const ctx = audioCtxRef.current;
    if (ctx?.state === 'suspended') {
      await ctx.resume();
    }

    if (audio.paused) {
      await audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [initAudioContext, draw]);

  // 监听音频结束事件
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => setIsPlaying(false);
    const handleTimeUpdate = () => { !isSeeking && setCurrentTime(audio.currentTime); };
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [isSeeking]);

  // 进度拖动
  const seekTo = useCallback((clientX: number) => {
    const bar = progressRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  }, [duration]);

  const handleProgressPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsSeeking(true);
    seekTo(e.clientX);
  }, [seekTo]);

  const handleProgressPointerMove = useCallback((e: React.PointerEvent) => {
    isSeeking && seekTo(e.clientX);
  }, [isSeeking, seekTo]);

  const handleProgressPointerUp = useCallback((e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsSeeking(false);
  }, []);

  // 音量控制
  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleVolumeChange = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const bar = volumeRef.current;
    const audio = audioRef.current;
    if (!bar || !audio) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    audio.volume = ratio;
    setVolume(ratio);
    setIsMuted(ratio === 0);
    audio.muted = ratio === 0;
  }, []);

  const handleVolumePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    handleVolumeChange(e);
  }, [handleVolumeChange]);

  const handleVolumePointerMove = useCallback((e: React.PointerEvent) => {
    e.buttons > 0 && handleVolumeChange(e);
  }, [handleVolumeChange]);

  const handleVolumePointerUp = useCallback((e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  // 格式化时间
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // canvas 自适应尺寸
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        const ctx = canvas.getContext('2d');
        ctx?.scale(window.devicePixelRatio, window.devicePixelRatio);
        // 更新 canvas CSS 尺寸与实际尺寸一致
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
    });

    ro.observe(canvas.parentElement || canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="w-full h-full flex flex-col relative">
      {/* 隐藏原生 audio */}
      <audio ref={audioRef} src={audioUrl} preload="metadata" crossOrigin="anonymous" />

      {/* 主区域：波形 + 播放按钮 */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden rounded-sm">
        {/* 频谱波形 Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* 居中播放/暂停按钮 */}
        <button
          onClick={togglePlay}
          className="nodrag relative z-10 w-14 h-14 rounded-full flex items-center justify-center bg-white/15 backdrop-blur-md border border-white/20 hover:bg-white/25 hover:scale-105 active:scale-95 transition-all duration-200 shadow-lg"
          title={isPlaying ? t('canvas.node.audio.pause', '暂停') : t('canvas.node.audio.play', '播放')}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 text-white" fill="white" />
          ) : (
            <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
          )}
        </button>

        {/* 拖拽区域 */}
        <div className="absolute inset-0 z-[5] pointer-events-none" />

        {/* 歌词覆盖层（同步滚动） */}
        {showLyrics && (
          <div
            className="absolute inset-0 z-20 bg-black/75 backdrop-blur-sm nodrag"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {parsedLyrics ? (
              <div
                ref={lyricsContainerRef}
                className="w-full h-full overflow-y-auto custom-scrollbar py-8 px-3"
                onScroll={handleLyricsScroll}
              >
                <div className="flex flex-col items-center gap-1 min-h-full justify-center">
                  {parsedLyrics.lines.map((line, idx) => (
                    <div
                      key={idx}
                      data-lyric-idx={idx}
                      onClick={() => handleLyricClick(line.time)}
                      className={`text-center px-2 py-1 rounded transition-all duration-300 max-w-full ${
                        idx === activeLyricIdx
                          ? 'text-white text-sm font-medium scale-105'
                          : idx < activeLyricIdx
                            ? 'text-white/40 text-xs cursor-pointer hover:text-white/60'
                            : 'text-white/30 text-xs cursor-pointer hover:text-white/50'
                      } ${parsedLyrics.hasTimestamps ? 'cursor-pointer' : ''}`}
                    >
                      {line.text}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-xs text-white/50">{t('canvas.node.audio.noLyrics', '暂无歌词')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部控制栏：进度条 + 歌词 + 音量（同一行） */}
      <div className="nodrag flex items-center gap-1.5 px-2 pb-1.5 pt-1" onPointerDown={(e) => e.stopPropagation()}>
        <span className="text-[9px] text-muted-foreground tabular-nums w-7 text-right">
          {formatTime(currentTime)}
        </span>
        <div
          ref={progressRef}
          className="flex-1 h-3 flex items-center cursor-pointer group"
          onPointerDown={handleProgressPointerDown}
          onPointerMove={handleProgressPointerMove}
          onPointerUp={handleProgressPointerUp}
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
        <span className="text-[9px] text-muted-foreground tabular-nums w-7">
          {formatTime(duration)}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); setShowLyrics((v) => !v); }}
          className={`p-1 rounded hover:bg-white/10 transition-colors ${
            showLyrics ? 'text-cyan-400' : 'text-muted-foreground hover:text-foreground'
          }`}
          title={t('canvas.node.audio.lyrics', '歌词')}
        >
          <Music2 className="w-3 h-3" />
        </button>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowVolumeSlider((v) => !v); }}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            title={isMuted ? t('canvas.node.audio.unmute', '取消静音') : t('canvas.node.audio.mute', '静音')}
          >
            {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>
          {/* 音量滑块 */}
          {showVolumeSlider && (
            <div
              className="absolute bottom-full right-0 mb-1 p-2 bg-popover/95 backdrop-blur-md border border-border/50 rounded-md shadow-lg z-30"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div
                ref={volumeRef}
                className="w-3 h-20 bg-muted rounded-full relative cursor-pointer"
                onPointerDown={handleVolumePointerDown}
                onPointerMove={handleVolumePointerMove}
                onPointerUp={handleVolumePointerUp}
              >
                <div
                  className="absolute bottom-0 left-0 w-full bg-foreground/40 rounded-full transition-[height] duration-75"
                  style={{ height: `${volume * 100}%` }}
                />
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-foreground/70 shadow-sm"
                  style={{ top: `clamp(0px, calc(${(1 - volume) * 100}% - 5px), calc(100% - 10px))` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
