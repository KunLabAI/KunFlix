'use client';

import React, { useState, useMemo } from 'react';
import { useVideoTasks } from '@/hooks/useVideoTasks';
import { useAgents } from '@/hooks/useAgents';
import { VideoTaskResponse, Agent } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Play, AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import CreateVideoDialog from './CreateVideoDialog';
import VideoPreviewModal from './VideoPreviewModal';

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

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '排队中' },
  { value: 'processing', label: '生成中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
] as const;

const MODE_FILTER_OPTIONS = [
  { value: 'all', label: '全部模式' },
  { value: 'text_to_video', label: '文字生成' },
  { value: 'image_to_video', label: '图片生成' },
  { value: 'edit', label: '视频编辑' },
] as const;

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------
function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const UNITS: [number, string][] = [[days, '天'], [hours, '小时'], [minutes, '分钟']];
  const match = UNITS.find(([v]) => v > 0);
  return match ? `${match[0]}${match[1]}前` : '刚刚';
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function VideosPage() {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [statusFilter, setStatusFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [previewTask, setPreviewTask] = useState<VideoTaskResponse | null>(null);

  const { agents } = useAgents(undefined, 1, 100);
  const videoAgents = useMemo(
    () => (agents ?? []).filter((a: Agent) => a.agent_type === 'video'),
    [agents],
  );

  const { tasks, total, isLoading, mutate } = useVideoTasks({
    page,
    pageSize,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    videoMode: modeFilter !== 'all' ? modeFilter : undefined,
    agentId: agentFilter !== 'all' ? agentFilter : undefined,
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 标题区域 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">视频生成</h2>
          <p className="text-muted-foreground">管理和监控视频生成任务</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> 新建视频任务
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={modeFilter} onValueChange={(v) => { setModeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODE_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {videoAgents.length > 0 && (
          <Select value={agentFilter} onValueChange={(v) => { setAgentFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="全部 Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部 Agent</SelectItem>
              {videoAgents.map((a: Agent) => (
                <SelectItem key={a.id} value={a.id!}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* 数据表格 */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">提示词</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>配置</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>费用</TableHead>
              <TableHead>时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  暂无视频任务
                </TableCell>
              </TableRow>
            ) : tasks.map((task: VideoTaskResponse) => {
              const statusInfo = STATUS_MAP[task.status] ?? STATUS_MAP.pending;
              return (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="text-sm">{truncate(task.prompt, 50)}</span>
                      <Badge variant="secondary" className="w-fit text-[10px]">
                        {MODE_LABELS[task.video_mode] ?? task.video_mode}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{task.agent_name ?? '-'}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {task.quality} · {task.duration}s · {task.aspect_ratio ?? '16:9'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {task.credit_cost > 0 ? task.credit_cost.toFixed(2) : '-'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(task.created_at)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {task.status === 'completed' && task.video_url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPreviewTask(task)}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    )}
                    {task.status === 'failed' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPreviewTask(task)}
                      >
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      {total > pageSize && (
        <div className="flex items-center justify-between">
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

      {/* Dialogs */}
      <CreateVideoDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={mutate}
      />
      <VideoPreviewModal
        task={previewTask}
        open={!!previewTask}
        onOpenChange={(open) => { !open && setPreviewTask(null); }}
      />
    </div>
  );
}
