'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useVideoTasks, useDeleteVideoTask } from '@/hooks/useVideoTasks';
import { VideoTaskResponse } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Play, AlertCircle, ChevronLeft, ChevronRight, Loader2, Video, Clock, Trash2 } from 'lucide-react';
import VideoPreviewModal from './VideoPreviewModal';
import { formatRelativeTime } from '@/lib/date-utils';

// ---------------------------------------------------------------------------
// 映射表（无 if-else）
// ---------------------------------------------------------------------------
const STATUS_MAP: Record<string, { label: string; variant: 'secondary' | 'default' | 'outline' | 'destructive' }> = {
  pending:    { label: '排队中', variant: 'secondary' },
  processing: { label: '生成中', variant: 'default' },
  completed:  { label: '已完成', variant: 'outline' },
  failed:     { label: '失败',   variant: 'destructive' },
};

const MODE_LABELS: Record<string, string> = {
  text_to_video:  '文字生成',
  image_to_video: '图片生成',
  edit:           '视频编辑',
};

const DELETABLE_STATUSES = new Set(['completed', 'failed']);

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function VideosPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [previewTask, setPreviewTask] = useState<VideoTaskResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VideoTaskResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { tasks, total, isLoading, mutate } = useVideoTasks({ page, pageSize });
  const { deleteVideoTask } = useDeleteVideoTask();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 自动轮询：当有进行中的任务时，每 5 秒刷新一次
  const hasActiveTasks = tasks.some((t: VideoTaskResponse) => 
    t.status === 'pending' || t.status === 'processing'
  );

  const refreshTasks = useCallback(() => {
    mutate();
  }, [mutate]);

  useEffect(() => {
    if (!hasActiveTasks) return;
    const interval = setInterval(refreshTasks, 5000);
    return () => clearInterval(interval);
  }, [hasActiveTasks, refreshTasks]);

  const handleDelete = async () => {
    const task = deleteTarget;
    setDeleting(true);
    try {
      await deleteVideoTask(task!.id);
      toast({ title: '删除成功' });
      setDeleteTarget(null);
      mutate();
    } catch (e: any) {
      toast({
        title: '删除失败',
        description: e?.response?.data?.detail || e?.message || '未知错误',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 标题区域 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">视频生成</h2>
          <p className="text-muted-foreground">管理和监控视频生成任务</p>
        </div>
        <Button onClick={() => router.push('/admin/videos/new')}>
          <Plus className="mr-2 h-4 w-4" /> 新建视频任务
        </Button>
      </div>

      {/* 视频列表（卡片式） */}
      <div className="min-h-[400px]">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/50 text-muted-foreground">
            <Video className="mb-2 h-8 w-8 opacity-50" />
            <p>暂无视频任务</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tasks.map((task: VideoTaskResponse) => {
              const statusInfo = STATUS_MAP[task.status] ?? STATUS_MAP.pending;
              const canDelete = DELETABLE_STATUSES.has(task.status);
              
              return (
                <Card 
                  key={task.id} 
                  className="group relative flex flex-col overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg"
                >
                  <div className="relative aspect-video w-full bg-muted">
                    {task.status === 'completed' && task.video_url ? (
                      <video 
                        src={task.video_url} 
                        className="h-full w-full object-cover"
                        preload="metadata"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted/50 text-muted-foreground">
                        {task.status === 'failed' ? (
                          <AlertCircle className="h-8 w-8 text-destructive/50" />
                        ) : (
                          <Video className="h-8 w-8 opacity-20" />
                        )}
                      </div>
                    )}
                    
                    {/* 状态标签 */}
                    <div className="absolute right-2 top-2">
                      <Badge variant={statusInfo.variant} className="shadow-sm">
                        {statusInfo.label}
                      </Badge>
                    </div>

                    {/* 操作遮罩 */}
                    <div 
                      className="absolute inset-0 flex items-center justify-center gap-3 bg-black/0 transition-colors group-hover:bg-black/20 cursor-pointer"
                      onClick={() => setPreviewTask(task)}
                    >
                      {task.status === 'completed' && (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/90 opacity-0 shadow-lg transition-all group-hover:opacity-100 group-hover:scale-110">
                          <Play className="h-5 w-5 fill-foreground text-foreground ml-1" />
                        </div>
                      )}
                    </div>

                    {/* 删除按钮 */}
                    {canDelete && (
                      <button
                        className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 opacity-0 shadow transition-opacity group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(task); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <CardContent className="flex-1 p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {MODE_LABELS[task.video_mode] ?? task.video_mode}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {task.quality} · {task.duration}s
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm text-foreground/90 font-medium leading-snug">
                      {task.prompt}
                    </p>
                  </CardContent>

                  <CardFooter className="flex items-center justify-between border-t bg-muted/20 p-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary/50" />
                      <span className="truncate max-w-[120px]">{task.provider_name ?? '-'} / {task.model ?? '-'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatRelativeTime(task.created_at)}</span>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 分页 */}
      {total > pageSize && (
        <div className="flex items-center justify-between pt-4">
          <span className="text-sm text-muted-foreground">
            共 {total} 条记录
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <VideoPreviewModal
        task={previewTask}
        open={!!previewTask}
        onOpenChange={(open) => { !open && setPreviewTask(null); }}
        onDelete={(task) => { setPreviewTask(null); setDeleteTarget(task); }}
      />

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { !open && setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后视频文件和任务记录将不可恢复，是否继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
