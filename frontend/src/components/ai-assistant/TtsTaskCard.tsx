'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Loader2, CheckCircle2, XCircle, Clock, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { handleTtsDragStart, cleanupDragPreview } from '@/lib/dragToCanvas';
import { useAuth } from '@/context/AuthContext';
import { useCanvasStore } from '@/store/useCanvasStore';
import { MediaAudioPlayer } from './MediaAudioPlayer';
import { TaskCardDragHandle } from './TaskCardDragHandle';

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

/** 演示注入状态：提供后跳过轮询，直接以该数据渲染卡片（仅供 demo 页使用） */
export interface TtsTaskMockStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audio_url?: string;
  credit_cost?: number;
  error_message?: string;
  model?: string;
  text?: string;
  voice?: string;
  style?: string;
}

// Terminal states that stop polling
const TERMINAL_STATES = new Set(['completed', 'failed']);
const POLL_INTERVAL = 4000;

// 单色主题状态元数据：仅 failed 用 destructive 强调，文案走 TTS 专用键（合成）
const STATUS_META: Record<string, { Icon: typeof Loader2; tone: string; labelKey: string }> = {
  pending:    { Icon: Clock,        tone: 'text-muted-foreground', labelKey: 'ai.mediaTask.ttsPending' },
  processing: { Icon: Loader2,      tone: 'text-muted-foreground', labelKey: 'ai.mediaTask.ttsProcessing' },
  completed:  { Icon: CheckCircle2, tone: 'text-foreground',       labelKey: 'ai.mediaTask.ttsCompleted' },
  failed:     { Icon: XCircle,      tone: 'text-destructive',      labelKey: 'ai.mediaTask.ttsFailed' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TtsTaskCardProps {
  task: TtsTaskInfo;
  className?: string;
  /** 演示用：注入静态状态，跳过 /tts/:id/status 轮询 */
  mockStatus?: TtsTaskMockStatus;
}

export function TtsTaskCard({ task, className, mockStatus }: TtsTaskCardProps) {
  const { t } = useTranslation();
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

  // 拖拽到画布
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
    const text = errorMsg || t('ai.mediaTask.ttsFailedFallback', '语音合成失败');
    navigator.clipboard?.writeText(text).then(
      () => toast.success(t('ai.mediaTask.copied', '已复制错误信息')),
      () => toast.error(text),
    );
  }, [errorMsg, t]);

  const meta = STATUS_META[status] || STATUS_META.pending;
  const MetaIcon = meta.Icon;
  const isActive = !TERMINAL_STATES.has(status);
  const finalError = errorMsg || t('ai.mediaTask.ttsFailedFallback', '语音合成失败');

  return (
    <div className={cn('group rounded-lg border border-border bg-card overflow-hidden my-2', className)}>
      {/* Header */}
      <div className="relative flex items-center gap-2 px-3 py-2">
        <Mic className="size-4 text-muted-foreground" />
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

      {/* Loading skeleton（极简，无时长预估文案） */}
      {isActive && (
        <div className="px-3 pb-3">
          <div className="h-12 rounded-md bg-muted animate-pulse" />
        </div>
      )}

      {/* Completed: 极简播放器 + 拖拽到画布（还原 TTS 节点） */}
      {status === 'completed' && audioUrl && (
        <div className="px-3 pb-3">
          <div className={cn('rounded-md transition-opacity', isDragging && 'opacity-50')}>
            <MediaAudioPlayer audioUrl={audioUrl} />
          </div>

          {creditCost > 0 && (
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              {t('ai.mediaTask.cost', { cost: creditCost })}
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

export default TtsTaskCard;
