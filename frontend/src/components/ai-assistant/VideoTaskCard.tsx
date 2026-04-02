'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Film, Loader2, CheckCircle2, XCircle, Clock, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

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
  pending:    { label: '等待生成...',  color: 'text-amber-500',  Icon: Clock },
  processing: { label: '正在生成...',  color: 'text-blue-500',   Icon: Loader2 },
  completed:  { label: '生成完成',     color: 'text-green-500',  Icon: CheckCircle2 },
  failed:     { label: '生成失败',     color: 'text-red-500',    Icon: XCircle },
};

// Video mode labels
const MODE_LABELS: Record<string, string> = {
  text_to_video: '文生视频',
  image_to_video: '图生视频',
  edit: '视频编辑',
};

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
        'rounded-xl border overflow-hidden transition-all duration-300 my-2',
        isActive
          ? 'bg-violet-50/50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800'
          : status === 'completed'
            ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
            : 'bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
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
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-muted-foreground">
              {modeLabel}
            </span>
          )}
          {model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-muted-foreground">
              {model}
            </span>
          )}
        </div>
      </div>

      {/* Loading animation for active tasks */}
      {isActive && (
        <div className="px-3 pb-3">
          <div className="flex items-center justify-center py-8 rounded-lg bg-black/5 dark:bg-white/5">
            <div className="flex flex-col items-center gap-3">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <Film className="h-8 w-8 text-violet-400" />
              </motion.div>
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-violet-400"
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

      {/* Video player for completed tasks */}
      {status === 'completed' && videoUrl && (
        <div className="px-3 pb-3">
          <video
            src={videoUrl}
            controls
            preload="metadata"
            className="w-full rounded-lg bg-black"
            style={{ maxHeight: '360px' }}
          />
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
      )}

      {/* Error message for failed tasks */}
      {status === 'failed' && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 py-3 px-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-xs">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg || '视频生成失败，请重试'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
