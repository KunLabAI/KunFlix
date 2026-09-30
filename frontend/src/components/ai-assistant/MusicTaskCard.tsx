'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Music, Loader2, CheckCircle2, XCircle, Clock, Music2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { handleAudioDragStart, cleanupDragPreview } from '@/lib/dragToCanvas';
import { useAuth } from '@/context/AuthContext';
import { useCanvasStore } from '@/store/useCanvasStore';
import { MediaAudioPlayer } from './MediaAudioPlayer';
import { TaskCardDragHandle } from './TaskCardDragHandle';

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
  // 后端扣费不足、余额被兜底扣到 0 时为 true（不持久化，仅响应携带）
  billing_underpaid?: boolean;
  // 本次扣费后用户余额（不持久化，用于前端同步 user.credits）
  remaining_credits?: number | null;
}

/** 演示注入状态：提供后跳过轮询，直接以该数据渲染卡片（仅供 demo 页使用） */
export interface MusicTaskMockStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audio_url?: string;
  credit_cost?: number;
  error_message?: string;
  model?: string;
  lyrics?: string;
}

// Terminal states that stop polling
const TERMINAL_STATES = new Set(['completed', 'failed']);
const POLL_INTERVAL = 5000;

// 单色主题状态元数据：仅 failed 用 destructive 作为唯一强调色，其余走中性 foreground/muted
const STATUS_META: Record<string, { Icon: typeof Loader2; tone: string; labelKey: string }> = {
  pending:    { Icon: Clock,        tone: 'text-muted-foreground', labelKey: 'ai.mediaTask.pending' },
  processing: { Icon: Loader2,      tone: 'text-muted-foreground', labelKey: 'ai.mediaTask.processing' },
  completed:  { Icon: CheckCircle2, tone: 'text-foreground',       labelKey: 'ai.mediaTask.completed' },
  failed:     { Icon: XCircle,      tone: 'text-destructive',      labelKey: 'ai.mediaTask.failed' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MusicTaskCardProps {
  task: MusicTaskInfo;
  className?: string;
  /** 演示用：注入静态状态，跳过 /music/:id/status 轮询 */
  mockStatus?: MusicTaskMockStatus;
}

export function MusicTaskCard({ task, className, mockStatus }: MusicTaskCardProps) {
  const { t } = useTranslation();
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
  // 仅提示一次余额被兜底扣到 0 的事件
  const underpaidNotifiedRef = useRef(false);
  const { updateCredits } = useAuth();

  // 拖拽到画布
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

  const stopPolling = () => {
    pollingRef.current && clearInterval(pollingRef.current);
    pollingRef.current = null;
  };

  const applyStatus = (data: MusicTaskStatus) => {
    setStatus(data.status);
    data.audio_url && setAudioUrl(data.audio_url);
    data.credit_cost && setCreditCost(data.credit_cost);
    data.error_message && setErrorMsg(data.error_message);
    data.model && setModel(data.model);
    data.lyrics && setLyrics(data.lyrics);

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

    // 音乐完成后同步画布（后端已更新占位节点）
    const cStore = useCanvasStore.getState();
    (data.status === 'completed' && cStore.theaterId) && cStore.syncTheater(cStore.theaterId);
  };

  const pollStatus = useCallback(async () => {
    try {
      const res = await api.get<MusicTaskStatus>(`/music/${task.taskId}/status`);
      const data = res.data;
      mountedRef.current && applyStatus(data);
    } catch {
      // Network error: keep polling
    }
  }, [task.taskId]);

  // 演示注入：一次性应用 mock 状态，不参与轮询
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions, react-hooks/set-state-in-effect
    mockStatus && applyStatus({ id: task.taskId, ...mockStatus });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockStatus]);

  useEffect(() => {
    mountedRef.current = true;

    !isDone && !mockStatus && (() => {
      pollStatus();
      pollingRef.current = setInterval(pollStatus, POLL_INTERVAL);
    })();

    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [isDone, mockStatus, pollStatus]);

  const copyError = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const text = errorMsg || t('ai.mediaTask.musicFailedFallback', '音乐生成失败');
    navigator.clipboard?.writeText(text).then(
      () => toast.success(t('ai.mediaTask.copied', '已复制错误信息')),
      () => toast.error(text),
    );
  }, [errorMsg, t]);

  const meta = STATUS_META[status] || STATUS_META.pending;
  const MetaIcon = meta.Icon;
  const isActive = !TERMINAL_STATES.has(status);
  const finalError = errorMsg || t('ai.mediaTask.musicFailedFallback', '音乐生成失败');

  // 歌词开关（作为播放器的额外操作按钮）
  const lyricsToggle = lyrics ? (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setShowLyrics((v) => !v); }}
      title={showLyrics ? t('ai.mediaTask.hideLyrics', '收起歌词') : t('ai.mediaTask.showLyrics', '查看歌词')}
      className={cn(
        'shrink-0 p-1 rounded transition-colors',
        showLyrics ? 'text-foreground bg-muted' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
      )}
    >
      <Music2 className="size-3.5" />
    </button>
  ) : undefined;

  return (
    <div className={cn('group rounded-lg border border-border bg-card overflow-hidden my-2', className)}>
      {/* Header */}
      <div className="relative flex items-center gap-2 px-3 py-2">
        <Music className="size-4 text-muted-foreground" />
        <span className={cn('text-xs font-medium', meta.tone)}>{t(meta.labelKey)}</span>
        {isActive
          ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          : <MetaIcon className={cn('size-3.5', meta.tone)} />}
        <div className="flex items-center gap-1.5 ml-auto">
          {model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{model}</span>
          )}
        </div>
        <TaskCardDragHandle
          active={status === 'completed' && !!audioUrl}
          isDragging={isDragging}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      </div>

      {/* Loading skeleton（极简，无时长预估文案；活动反馈由头部 spinner 承载） */}
      {isActive && (
        <div className="px-3 pb-3">
          <div className="h-12 rounded-md bg-muted animate-pulse" />
        </div>
      )}

      {/* Completed: 极简播放器 + 拖拽到画布 + 歌词 */}
      {status === 'completed' && audioUrl && (
        <div className="px-3 pb-3">
          <div className={cn('rounded-md transition-opacity', isDragging && 'opacity-50')}>
            <MediaAudioPlayer audioUrl={audioUrl} extraActions={lyricsToggle} />
          </div>

          {creditCost > 0 && (
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              {t('ai.mediaTask.cost', { cost: creditCost })}
            </div>
          )}

          {showLyrics && lyrics && (
            <div className="mt-2 p-2 rounded-md bg-muted text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
              {lyrics}
            </div>
          )}
        </div>
      )}

      {/* Failed: 完整错误 + 复制 */}
      {status === 'failed' && (
        <div className="px-3 pb-3">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-1.5">
            <p className="text-xs text-destructive break-words">{finalError}</p>
            <button
              type="button"
              onClick={copyError}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="size-3" />
              {t('ai.mediaTask.copyError', '复制错误信息')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default MusicTaskCard;
