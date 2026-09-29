'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Loader2, CheckCircle2, XCircle, Clock, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { handleTtsDragStart, cleanupDragPreview } from '@/lib/dragToCanvas';
import { useAuth } from '@/context/AuthContext';
import { useCanvasStore } from '@/store/useCanvasStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TtsTaskInfo {
  taskId: string;
  model?: string;
  audioUrl?: string;
  creditCost?: number;
}

interface TtsSpeakerConfig {
  speaker: string;
  voice?: string;
  text: string;
  style?: string;
}

// 拖拽到画布还原为 TTS 节点时需要携带的特有配置
interface TtsDragMeta {
  text?: string;
  voice?: string;
  style?: string;
  speakers?: TtsSpeakerConfig[];
}

interface TtsTaskStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audio_url?: string;
  credit_cost?: number;
  error_message?: string;
  model?: string;
  text?: string;
  voice?: string;
  style?: string;
  speakers?: TtsSpeakerConfig[];
  output_format?: string;
  // 后端扣费不足、余额被兜底扣到 0 时为 true（不持久化，仅响应携带）
  billing_underpaid?: boolean;
  // 本次扣费后用户余额（不持久化，用于前端同步 user.credits）
  remaining_credits?: number | null;
}

// Terminal states that stop polling
const TERMINAL_STATES = new Set(['completed', 'failed']);
const POLL_INTERVAL = 4000;

// Status display config (dispatch map)
const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: typeof Loader2 }> = {
  pending:    { label: '等待合成...',  color: 'text-[var(--color-status-pending-text)]',     Icon: Clock },
  processing: { label: '正在合成...',  color: 'text-[var(--color-status-processing-text)]',  Icon: Loader2 },
  completed:  { label: '合成完成',     color: 'text-[var(--color-status-success-text)]',     Icon: CheckCircle2 },
  failed:     { label: '合成失败',     color: 'text-[var(--color-status-error-text)]',       Icon: XCircle },
};

// ---------------------------------------------------------------------------
// DraggableAudioPreview - Sub-component with drag support
// ---------------------------------------------------------------------------

interface DraggableAudioPreviewProps {
  audioUrl: string;
  creditCost: number;
  ttsMeta: TtsDragMeta;
}

function DraggableAudioPreview({ audioUrl, creditCost, ttsMeta }: DraggableAudioPreviewProps) {
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const onDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    dragPreviewRef.current = handleTtsDragStart(e, audioUrl, { name: '语音', ...ttsMeta });
  }, [audioUrl, ttsMeta]);

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
        <a
          href={audioUrl}
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

interface TtsTaskCardProps {
  task: TtsTaskInfo;
  className?: string;
}

export function TtsTaskCard({ task, className }: TtsTaskCardProps) {
  const isDone = !!task.audioUrl;

  const [status, setStatus] = useState<string>(isDone ? 'completed' : 'pending');
  const [audioUrl, setAudioUrl] = useState<string>(task.audioUrl || '');
  const [creditCost, setCreditCost] = useState<number>(task.creditCost || 0);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [model, setModel] = useState<string>(task.model || '');
  // TTS 特有配置（文本/音色/风格/多说话人），拖拽到画布时还原为 TTS 节点
  const [ttsMeta, setTtsMeta] = useState<TtsDragMeta>({});

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  // 仅提示一次余额被兜底扣到 0 的事件
  const underpaidNotifiedRef = useRef(false);
  const { updateCredits } = useAuth();

  const stopPolling = () => {
    pollingRef.current && clearInterval(pollingRef.current);
    pollingRef.current = null;
  };

  const applyStatus = (data: TtsTaskStatus) => {
    setStatus(data.status);
    data.audio_url && setAudioUrl(data.audio_url);
    data.credit_cost && setCreditCost(data.credit_cost);
    data.error_message && setErrorMsg(data.error_message);
    data.model && setModel(data.model);

    // 捕获 TTS 特有配置，供拖拽到画布时还原为 TTS 节点（幂等合并）
    setTtsMeta((prev) => ({
      ...prev,
      ...(data.text ? { text: data.text } : {}),
      ...(data.voice ? { voice: data.voice } : {}),
      ...(data.style ? { style: data.style } : {}),
      ...(data.speakers ? { speakers: data.speakers } : {}),
    }));

    // 后端扣费后同步最新余额到 AuthContext，驱动 useCreditsGuard 即时生效
    data.remaining_credits != null && updateCredits(data.remaining_credits);

    // 后端扣费不足、余额被兜底扣到 0 时提示一次
    data.billing_underpaid && !underpaidNotifiedRef.current && (
      (underpaidNotifiedRef.current = true),
      toast.warning(
        '本次操作已扣除您剩余的全部积分，余额已为 0。请充值后继续使用。',
        { duration: 4500 },
      )
    );

    TERMINAL_STATES.has(data.status) && stopPolling();

    // 语音完成后同步画布（后端已更新占位节点）
    const cStore = useCanvasStore.getState();
    (data.status === 'completed' && cStore.theaterId) && cStore.syncTheater(cStore.theaterId);
  };

  const pollStatus = useCallback(async () => {
    try {
      const res = await api.get<TtsTaskStatus>(`/tts/${task.taskId}/status`);
      mountedRef.current && applyStatus(res.data);
    } catch {
      // Network error: keep polling
    }
  }, [task.taskId]);

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
        'rounded-lg overflow-hidden transition-all duration-300 my-2',
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
        <Mic className={cn('h-4 w-4', statusCfg.color)} />
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
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Mic className="h-8 w-8 text-[var(--color-status-processing-icon)]" />
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
                语音合成中，通常需要 10-60 秒...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Audio player for completed tasks - with drag support */}
      {status === 'completed' && audioUrl && (
        <DraggableAudioPreview audioUrl={audioUrl} creditCost={creditCost} ttsMeta={ttsMeta} />
      )}

      {/* Error message for failed tasks */}
      {status === 'failed' && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 py-3 px-3 rounded-lg bg-[var(--color-status-error-bg)] text-[var(--color-status-error-text)] text-xs">
            <XCircle className="h-4 w-4 shrink-0 text-[var(--color-status-error-icon)]" />
            <span>{errorMsg || '语音合成失败，请重试'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
