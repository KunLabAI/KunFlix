'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { VideoTaskResponse } from '@/types';
import { formatDateTime, formatDuration } from '@/lib/date-utils';

const MODE_LABELS: Record<string, string> = {
  text_to_video: '文字生成',
  image_to_video: '图片生成',
  edit: '视频编辑',
};

const DELETABLE_STATUSES = new Set(['completed', 'failed']);

interface VideoPreviewModalProps {
  task: VideoTaskResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (task: VideoTaskResponse) => void;
}

export default function VideoPreviewModal({ task, open, onOpenChange, onDelete }: VideoPreviewModalProps) {
  const canDelete = task && DELETABLE_STATUSES.has(task.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>视频预览</DialogTitle>
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
                {task.error_message || '视频生成失败'}
              </div>
            ) : (
              <div className="rounded-lg bg-muted p-8 text-center text-sm text-muted-foreground">
                视频尚未生成完成
              </div>
            )}

            {/* 任务信息 */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">模式：</span>
                {MODE_LABELS[task.video_mode] ?? task.video_mode}
              </div>
              <div>
                <span className="text-muted-foreground">画质：</span>
                {task.quality}
              </div>
              <div>
                <span className="text-muted-foreground">时长：</span>
                {task.duration}秒
              </div>
              <div>
                <span className="text-muted-foreground">比例：</span>
                {task.aspect_ratio ?? '16:9'}
              </div>
              <div>
                <span className="text-muted-foreground">费用：</span>
                {task.credit_cost > 0 ? `${task.credit_cost.toFixed(2)} 积分` : '-'}
              </div>
              <div>
                <span className="text-muted-foreground">供应商：</span>
                {task.provider_name ?? '-'}
              </div>
              <div>
                <span className="text-muted-foreground">模型：</span>
                {task.model ?? '-'}
              </div>
            </div>

            {/* 提示词 */}
            <div className="text-sm">
              <span className="text-muted-foreground">提示词：</span>
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{task.prompt}</p>
            </div>

            {/* 时间信息 */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>创建: {formatDateTime(task.created_at)}</span>
              {task.completed_at && (
                <>
                  <span>完成: {formatDateTime(task.completed_at)}</span>
                  <span>耗时: {formatDuration(task.created_at, task.completed_at)}</span>
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
              删除任务
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
