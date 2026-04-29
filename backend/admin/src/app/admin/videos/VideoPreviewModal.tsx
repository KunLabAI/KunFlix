'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { VideoTaskResponse } from '@/types';
import { formatDateTime, formatDuration } from '@/lib/date-utils';

const DELETABLE_STATUSES = new Set(['completed', 'failed']);

interface VideoPreviewModalProps {
  task: VideoTaskResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (task: VideoTaskResponse) => void;
}

export default function VideoPreviewModal({ task, open, onOpenChange, onDelete }: VideoPreviewModalProps) {
  const { t } = useTranslation();
  const canDelete = task && DELETABLE_STATUSES.has(task.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t('videos.preview.title')}</DialogTitle>
        </DialogHeader>

        {task && (
          <div className="space-y-4">
            {/* 视频播放器 / 错误信息 */}
            {task.status === 'completed' && task.video_url ? (
              <video
                src={task.video_url}
                controls
                autoPlay
                className="w-full rounded-lg bg-black"
              />
            ) : task.status === 'failed' ? (
              <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
                {task.error_message || t('videos.preview.failedFallback')}
              </div>
            ) : (
              <div className="rounded-lg bg-muted p-8 text-center text-sm text-muted-foreground">
                {t('videos.preview.pendingHint')}
              </div>
            )}

            {/* 任务信息 */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t('videos.preview.mode')}</span>
                {t(`videos.mode.${task.video_mode}`, { defaultValue: task.video_mode })}
              </div>
              <div>
                <span className="text-muted-foreground">{t('videos.preview.quality')}</span>
                {task.quality}
              </div>
              <div>
                <span className="text-muted-foreground">{t('videos.preview.duration')}</span>
                {t('videos.preview.durationSec', { value: task.duration })}
              </div>
              <div>
                <span className="text-muted-foreground">{t('videos.preview.ratio')}</span>
                {task.aspect_ratio ?? '16:9'}
              </div>
              <div>
                <span className="text-muted-foreground">{t('videos.preview.cost')}</span>
                {task.credit_cost > 0
                  ? t('videos.preview.credits', { value: task.credit_cost.toFixed(2) })
                  : t('videos.preview.dash')}
              </div>
              <div>
                <span className="text-muted-foreground">{t('videos.preview.provider')}</span>
                {task.provider_name ?? t('videos.preview.dash')}
              </div>
              <div>
                <span className="text-muted-foreground">{t('videos.preview.model')}</span>
                {task.model ?? t('videos.preview.dash')}
              </div>
            </div>

            {/* 提示词 */}
            <div className="text-sm">
              <span className="text-muted-foreground">{t('videos.preview.prompt')}</span>
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{task.prompt}</p>
            </div>

            {/* 时间信息 */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{t('videos.preview.createdAt', { time: formatDateTime(task.created_at) })}</span>
              {task.completed_at && (
                <>
                  <span>{t('videos.preview.completedAt', { time: formatDateTime(task.completed_at) })}</span>
                  <span>{t('videos.preview.elapsed', { time: formatDuration(task.created_at, task.completed_at) })}</span>
                </>
              )}
            </div>
          </div>
        )}

        {canDelete && onDelete && (
          <DialogFooter>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onDelete(task)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('videos.preview.deleteTask', { defaultValue: '删除任务' })}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
