'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Film, Loader2, CheckCircle2, XCircle, Clock, Download, GripVertical } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { handleVideoDragStart, cleanupDragPreview } from '@/lib/dragToCanvas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VideoTaskInfo {
  taskId: string;
  videoMode?: string;
  model?: string;
  // Pre-filled when parsed from __VIDEO_DONE__
  videoUrl?: string;
  quality?: string;
  duration?: number;
  creditCost?: number;
}

interface VideoTaskStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  quality?: string;
  duration?: number;
  credit_cost?: number;
  error_message?: string;
  video_mode?: string;
  model?: string;
}

// Terminal states that stop polling
const TERMINAL_STATES = new Set(['completed', 'failed']);
const POLL_INTERVAL = 5000;

// Status display config (dispatch map)
const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: typeof Loader2 }> = {
  pending:    { label: '等待生成...',  color: 'text-[var(--color-status-pending-text)]',  Icon: Clock },
  processing: { label: '正在生成...',  color: 'text-[var(--color-status-processing-text)]',   Icon: Loader2 },
  completed:  { label: '生成完成',     color: 'text-[var(--color-status-success-text)]',  Icon: CheckCircle2 },
  failed:     { label: '生成失败',     color: 'text-[var(--color-status-error-text)]',    Icon: XCircle },
};

// Video mode labels
const MODE_LABELS: Record<string, string> = {
  text_to_video: '文生视频',
  image_to_video: '图生视频',
  edit: '视频编辑',
};

// ---------------------------------------------------------------------------
// DraggableVideoPreview - Sub-component with drag support
// ---------------------------------------------------------------------------

interface DraggableVideoPreviewProps {
  videoUrl: string;
  quality: string;
  duration: number;
  creditCost: number;
  modeLabel: string;
}

function DraggableVideoPreview({ videoUrl, quality, duration, creditCost, modeLabel }: DraggableVideoPreviewProps) {
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const onDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    dragPreviewRef.current = handleVideoDragStart(e, videoUrl, modeLabel || '视频');
  }, [videoUrl, modeLabel]);

  const onDragEnd = useCallback(() => {
    setIsDragging(false);
    cleanupDragPreview(dragPreviewRef.current);
    dragPreviewRef.current = null;
  }, []);

  return (
    <div className="px-3 pb-3">
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className={cn(
          'relative group cursor-grab active:cursor-grabbing transition-all',
          isDragging && 'opacity-50'
        )}
      >
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="h-3 w-3" />
          <span>拖动到画布</span>
        </div>
        <video
          src={videoUrl}
          controls
          preload="metadata"
          className="w-full rounded-lg bg-[var(--color-bg-primary)]"
          style={{ maxHeight: '360px' }}
          // Prevent video controls from interfering with drag
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
        {quality && <span>画质: {quality}</span>}
        {duration > 0 && <span>时长: {duration}s</span>}
        {creditCost > 0 && <span>消耗: {creditCost} 积分</span>}
        <a
          href={videoUrl}
          download
          className="ml-auto flex items-center gap-1 text-primary hover:underline"
        >
          <Download className="h-3 w-3" />
          下载
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface VideoTaskCardProps {
  task: VideoTaskInfo;
  className?: string;
}

export function VideoTaskCard({ task, className }: VideoTaskCardProps) {
  // If __VIDEO_DONE__ already provides videoUrl, skip polling entirely
  const isDone = !!task.videoUrl;

  const [status, setStatus] = useState<string>(isDone ? 'completed' : 'pending');
  const [videoUrl, setVideoUrl] = useState<string>(task.videoUrl || '');
  const [quality, setQuality] = useState<string>(task.quality || '');
  const [duration, setDuration] = useState<number>(task.duration || 0);
  const [creditCost, setCreditCost] = useState<number>(task.creditCost || 0);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [videoMode, setVideoMode] = useState<string>(task.videoMode || '');
  const [model, setModel] = useState<string>(task.model || '');

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const pollStatus = useCallback(async () => {
    try {
      const res = await api.get<VideoTaskStatus>(`/videos/${task.taskId}/status`);
      const data = res.data;
      mountedRef.current && applyStatus(data);
    } catch {
      // Network error: keep polling, don't crash
    }
  }, [task.taskId]);

  const applyStatus = (data: VideoTaskStatus) => {
    setStatus(data.status);
    data.video_url && setVideoUrl(data.video_url);
    data.quality && setQuality(data.quality);
    data.duration && setDuration(data.duration);
    data.credit_cost && setCreditCost(data.credit_cost);
    data.error_message && setErrorMsg(data.error_message);
    data.video_mode && setVideoMode(data.video_mode);
    data.model && setModel(data.model);

    // Stop polling on terminal state
    TERMINAL_STATES.has(data.status) && stopPolling();
  };

  const stopPolling = () => {
    pollingRef.current && clearInterval(pollingRef.current);
    pollingRef.current = null;
  };

  // Start polling on mount (only if not already done)
  useEffect(() => {
    mountedRef.current = true;

    // Skip polling for completed tasks
    !isDone && (() => {
      // Initial poll
      pollStatus();
      // Interval poll
      pollingRef.current = setInterval(pollStatus, POLL_INTERVAL);
    })();

    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [isDone, pollStatus]);

  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.Icon;
  const isActive = !TERMINAL_STATES.has(status);
  const modeLabel = MODE_LABELS[videoMode] || videoMode;

  return (
    <div
      className={cn(
        'rounded-lg border overflow-hidden transition-all duration-300 my-2',
        isActive
          ? 'bg-[var(--color-status-processing-bg)] border-[var(--color-status-processing-border)]'
          : status === 'completed'
            ? 'bg-[var(--color-status-success-bg)] border-[var(--color-status-success-border)]'
            : 'bg-[var(--color-status-error-bg)] border-[var(--color-status-error-border)]',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Film className={cn('h-4 w-4', statusCfg.color)} />
        <span className={cn('text-xs font-medium', statusCfg.color)}>
          {statusCfg.label}
        </span>
        {isActive && (
          <StatusIcon className={cn('h-3.5 w-3.5 animate-spin', statusCfg.color)} />
        )}
        {/* Meta badges */}
        <div className="flex items-center gap-1.5 ml-auto">
          {modeLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-panel)] text-[var(--color-text-panel)]">
              {modeLabel}
            </span>
          )}
          {model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-bg-panel)] text-[var(--color-text-panel)]">
              {model}
            </span>
          )}
        </div>
      </div>

      {/* Loading animation for active tasks */}
      {isActive && (
        <div className="px-3 pb-3">
          <div className="flex items-center justify-center py-8 rounded-lg bg-[var(--color-bg-panel)]">
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <Film className="h-8 w-8 text-[var(--color-status-processing-icon)]" />
              </motion.div>
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[var(--color-status-processing-icon)]"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                视频生成中，通常需要 1-5 分钟...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Video player for completed tasks - with drag support */}
      {status === 'completed' && videoUrl && (
        <DraggableVideoPreview
          videoUrl={videoUrl}
          quality={quality}
          duration={duration}
          creditCost={creditCost}
          modeLabel={modeLabel}
        />
      )}

      {/* Error message for failed tasks */}
      {status === 'failed' && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 py-3 px-3 rounded-lg bg-[var(--color-status-error-bg)] text-[var(--color-status-error-text)] text-xs">
            <XCircle className="h-4 w-4 shrink-0 text-[var(--color-status-error-icon)]" />
            <span>{errorMsg || '视频生成失败，请重试'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
