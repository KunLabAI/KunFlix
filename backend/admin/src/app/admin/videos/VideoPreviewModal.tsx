'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { VideoTaskResponse } from '@/types';

const MODE_LABELS: Record<string, string> = {
  text_to_video: '文字生成',
  image_to_video: '图片生成',
  edit: '视频编辑',
};

interface VideoPreviewModalProps {
  task: VideoTaskResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VideoPreviewModal({ task, open, onOpenChange }: VideoPreviewModalProps) {
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
                <span className="text-muted-foreground">Agent：</span>
                {task.agent_name ?? '-'}
              </div>
            </div>

            {/* 提示词 */}
            <div className="text-sm">
              <span className="text-muted-foreground">提示词：</span>
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted p-2 text-xs">{task.prompt}</p>
            </div>

            {/* 时间信息 */}
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>创建: {new Date(task.created_at).toLocaleString()}</span>
              {task.completed_at && <span>完成: {new Date(task.completed_at).toLocaleString()}</span>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
