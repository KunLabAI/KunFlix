'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Music, Loader2, CheckCircle2, XCircle, Clock, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { handleAudioDragStart, cleanupDragPreview } from '@/lib/dragToCanvas';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MusicTaskInfo {
  taskId: string;
  model?: string;
  // Pre-filled when parsed from __MUSIC_DONE__
  audioUrl?: string;
  creditCost?: number;
  lyrics?: string;
}

interface MusicTaskStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audio_url?: string;
  credit_cost?: number;
  error_message?: string;
  model?: string;
  lyrics?: string;
  output_format?: string;
}

// Terminal states that stop polling
const TERMINAL_STATES = new Set(['completed', 'failed']);
const POLL_INTERVAL = 5000;

// Status display config (dispatch map)
const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: typeof Loader2 }> = {
  pending:    { label: '等待生成...',  color: 'text-[var(--color-status-pending-text)]',     Icon: Clock },
  processing: { label: '正在生成...',  color: 'text-[var(--color-status-processing-text)]',  Icon: Loader2 },
  completed:  { label: '生成完成',     color: 'text-[var(--color-status-success-text)]',     Icon: CheckCircle2 },
  failed:     { label: '生成失败',     color: 'text-[var(--color-status-error-text)]',       Icon: XCircle },
};

// ---------------------------------------------------------------------------
// DraggableAudioPreview - Sub-component with drag support
// ---------------------------------------------------------------------------

interface DraggableAudioPreviewProps {
  audioUrl: string;
  creditCost: number;
  lyrics: string;
  showLyrics: boolean;
  onToggleLyrics: () => void;
}

function DraggableAudioPreview({ audioUrl, creditCost, lyrics, showLyrics, onToggleLyrics }: DraggableAudioPreviewProps) {
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const onDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    dragPreviewRef.current = handleAudioDragStart(e, audioUrl, '音频', lyrics);
  }, [audioUrl, lyrics]);

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
        <audio
          src={audioUrl}
          controls
          preload="metadata"
          className="w-full rounded-lg"
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
        {creditCost > 0 && <span>消耗: {creditCost} 积分</span>}
        {lyrics && (
          <button
            className="text-primary hover:underline cursor-pointer"
            onClick={onToggleLyrics}
          >
            {showLyrics ? '收起歌词' : '查看歌词'}
          </button>
        )}
        <a
          href={audioUrl}
          download
          className="ml-auto flex items-center gap-1 text-primary hover:underline"
        >
          <Download className="h-3 w-3" />
          下载
        </a>
      </div>
      {/* Lyrics panel */}
      {showLyrics && lyrics && (
        <div className="mt-2 p-2 rounded-lg bg-[var(--color-bg-panel)] text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
          {lyrics}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MusicTaskCardProps {
  task: MusicTaskInfo;
  className?: string;
}

export function MusicTaskCard({ task, className }: MusicTaskCardProps) {
  const isDone = !!task.audioUrl;

  const [status, setStatus] = useState<string>(isDone ? 'completed' : 'pending');
  const [audioUrl, setAudioUrl] = useState<string>(task.audioUrl || '');
  const [creditCost, setCreditCost] = useState<number>(task.creditCost || 0);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [model, setModel] = useState<string>(task.model || '');
  const [lyrics, setLyrics] = useState<string>(task.lyrics || '');
  const [showLyrics, setShowLyrics] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const pollStatus = useCallback(async () => {
    try {
      const res = await api.get<MusicTaskStatus>(`/music/${task.taskId}/status`);
      const data = res.data;
      mountedRef.current && applyStatus(data);
    } catch {
      // Network error: keep polling
    }
  }, [task.taskId]);

  const applyStatus = (data: MusicTaskStatus) => {
    setStatus(data.status);
    data.audio_url && setAudioUrl(data.audio_url);
    data.credit_cost && setCreditCost(data.credit_cost);
    data.error_message && setErrorMsg(data.error_message);
    data.model && setModel(data.model);
    data.lyrics && setLyrics(data.lyrics);

    TERMINAL_STATES.has(data.status) && stopPolling();
  };

  const stopPolling = () => {
    pollingRef.current && clearInterval(pollingRef.current);
    pollingRef.current = null;
  };

  useEffect(() => {
    mountedRef.current = true;

    !isDone && (() => {
      pollStatus();
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
        <Music className={cn('h-4 w-4', statusCfg.color)} />
        <span className={cn('text-xs font-medium', statusCfg.color)}>
          {statusCfg.label}
        </span>
        {isActive && (
          <StatusIcon className={cn('h-3.5 w-3.5 animate-spin', statusCfg.color)} />
        )}
        <div className="flex items-center gap-1.5 ml-auto">
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
                <Music className="h-8 w-8 text-[var(--color-status-processing-icon)]" />
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
                音乐生成中，通常需要 30-120 秒...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Audio player for completed tasks - with drag support */}
      {status === 'completed' && audioUrl && (
        <DraggableAudioPreview
          audioUrl={audioUrl}
          creditCost={creditCost}
          lyrics={lyrics}
          showLyrics={showLyrics}
          onToggleLyrics={() => setShowLyrics(!showLyrics)}
        />
      )}

      {/* Error message for failed tasks */}
      {status === 'failed' && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 py-3 px-3 rounded-lg bg-[var(--color-status-error-bg)] text-[var(--color-status-error-text)] text-xs">
            <XCircle className="h-4 w-4 shrink-0 text-[var(--color-status-error-icon)]" />
            <span>{errorMsg || '音乐生成失败，请重试'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
