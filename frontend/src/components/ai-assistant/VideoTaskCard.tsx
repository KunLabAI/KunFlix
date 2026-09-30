'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Film, Loader2, CheckCircle2, XCircle, Clock, Download, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { handleVideoDragStart, cleanupDragPreview } from '@/lib/dragToCanvas';
import { useAuth } from '@/context/AuthContext';
import { useCanvasStore } from '@/store/useCanvasStore';
import { TaskCardDragHandle } from './TaskCardDragHandle';

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
  // 后端扣费不足、余额被兜底扣到 0 时为 true（不持久化，仅响应携带）
  billing_underpaid?: boolean;
  // 本次扣费后用户余额（不持久化，用于前端同步 user.credits）
  remaining_credits?: number | null;
}

/** 演示注入状态：提供后跳过轮询，直接以该数据渲染卡片（仅供 demo 页使用） */
export interface VideoTaskMockStatus {
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

// 单色主题状态元数据：仅 failed 用 destructive 强调，其余走中性 foreground/muted
const STATUS_META: Record<string, { Icon: typeof Loader2; tone: string; labelKey: string }> = {
  pending:    { Icon: Clock,        tone: 'text-muted-foreground', labelKey: 'ai.mediaTask.pending' },
  processing: { Icon: Loader2,      tone: 'text-muted-foreground', labelKey: 'ai.mediaTask.processing' },
  completed:  { Icon: CheckCircle2, tone: 'text-foreground',       labelKey: 'ai.mediaTask.completed' },
  failed:     { Icon: XCircle,      tone: 'text-destructive',      labelKey: 'ai.mediaTask.failed' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface VideoTaskCardProps {
  task: VideoTaskInfo;
  className?: string;
  /** 演示用：注入静态状态，跳过 /videos/:id/status 轮询 */
  mockStatus?: VideoTaskMockStatus;
}

export function VideoTaskCard({ task, className, mockStatus }: VideoTaskCardProps) {
  const { t } = useTranslation();
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
  // 仅提示一次余额被兜底扣到 0 的事件
  const underpaidNotifiedRef = useRef(false);
  const { updateCredits } = useAuth();

  // 拖拽到画布
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const onDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    dragPreviewRef.current = handleVideoDragStart(e, videoUrl, modeLabelOf(videoMode, t) || '视频');
  }, [videoUrl, videoMode, t]);
  const onDragEnd = useCallback(() => {
    setIsDragging(false);
    cleanupDragPreview(dragPreviewRef.current);
    dragPreviewRef.current = null;
  }, []);

  const stopPolling = () => {
    pollingRef.current && clearInterval(pollingRef.current);
    pollingRef.current = null;
  };

  const applyStatus = (data: VideoTaskStatus) => {
    setStatus(data.status);
    data.video_url && setVideoUrl(data.video_url);
    data.quality && setQuality(data.quality);
    data.duration && setDuration(data.duration);
    data.credit_cost && setCreditCost(data.credit_cost);
    data.error_message && setErrorMsg(data.error_message);
    data.video_mode && setVideoMode(data.video_mode);
    data.model && setModel(data.model);

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

    // Stop polling on terminal state
    TERMINAL_STATES.has(data.status) && stopPolling();

    // 视频完成后同步画布（后端已更新占位节点）
    const cStore = useCanvasStore.getState();
    (data.status === 'completed' && cStore.theaterId) && cStore.syncTheater(cStore.theaterId);
  };

  const pollStatus = useCallback(async () => {
    try {
      const res = await api.get<VideoTaskStatus>(`/videos/${task.taskId}/status`);
      const data = res.data;
      mountedRef.current && applyStatus(data);
    } catch {
      // Network error: keep polling, don't crash
    }
  }, [task.taskId]);

  // 演示注入：一次性应用 mock 状态，不参与轮询
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions, react-hooks/set-state-in-effect
    mockStatus && applyStatus({ id: task.taskId, ...mockStatus });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockStatus]);

  // Start polling on mount (only if not already done)
  useEffect(() => {
    mountedRef.current = true;

    // Skip polling for completed tasks
    !isDone && !mockStatus && (() => {
      // Initial poll
      pollStatus();
      // Interval poll
      pollingRef.current = setInterval(pollStatus, POLL_INTERVAL);
    })();

    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [isDone, mockStatus, pollStatus]);

  const copyError = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const text = errorMsg || t('ai.mediaTask.videoFailedFallback', '视频生成失败');
    navigator.clipboard?.writeText(text).then(
      () => toast.success(t('ai.mediaTask.copied', '已复制错误信息')),
      () => toast.error(text),
    );
  }, [errorMsg, t]);

  const meta = STATUS_META[status] || STATUS_META.pending;
  const MetaIcon = meta.Icon;
  const isActive = !TERMINAL_STATES.has(status);
  const modeLabel = modeLabelOf(videoMode, t);
  const finalError = errorMsg || t('ai.mediaTask.videoFailedFallback', '视频生成失败');

  return (
    <div className={cn('group rounded-lg border border-border bg-card overflow-hidden my-2', className)}>
      {/* Header */}
      <div className="relative flex items-center gap-2 px-3 py-2">
        <Film className="size-4 text-muted-foreground" />
        <span className={cn('text-xs font-medium', meta.tone)}>{t(meta.labelKey)}</span>
        {isActive
          ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          : <MetaIcon className={cn('size-3.5', meta.tone)} />}
        {/* Meta badges */}
        <div className="flex items-center gap-1.5 ml-auto">
          {modeLabel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{modeLabel}</span>
          )}
          {model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{model}</span>
          )}
        </div>
        <TaskCardDragHandle
          active={status === 'completed' && !!videoUrl}
          isDragging={isDragging}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      </div>

      {/* Loading skeleton（极简，无时长预估文案） */}
      {isActive && (
        <div className="px-3 pb-3">
          <div className="h-40 rounded-md bg-muted animate-pulse" />
        </div>
      )}

      {/* Completed: 原生播放器 + 拖拽到画布 + 精简元信息 */}
      {status === 'completed' && videoUrl && (
        <div className="px-3 pb-3">
          <div className={cn('transition-opacity', isDragging && 'opacity-50')}>
            <video
              src={videoUrl}
              controls
              preload="metadata"
              className="w-full rounded-md bg-black"
              style={{ maxHeight: '360px' }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
            {quality && <span>{t('ai.mediaTask.quality', '画质')}: {quality}</span>}
            {duration > 0 && <span>{t('ai.mediaTask.duration', '时长')}: {duration}s</span>}
            {creditCost > 0 && <span>{t('ai.mediaTask.cost', { cost: creditCost })}</span>}
            <a
              href={videoUrl}
              download
              onMouseDown={(e) => e.stopPropagation()}
              className="ml-auto flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Download className="size-3" />
              {t('ai.mediaTask.download', '下载')}
            </a>
          </div>
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

/** 视频模式标签：优先 i18n，缺失回退原始值 */
function modeLabelOf(videoMode: string, t: (key: string, def: string) => string): string {
  return videoMode ? t(`ai.mediaTask.mode.${videoMode}`, videoMode) : '';
}

export default VideoTaskCard;
