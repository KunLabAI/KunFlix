'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RefreshCw, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToolExecutions } from '@/hooks/useToolExecutions';
import { formatRelativeTime } from '@/lib/date-utils';

const PAGE_SIZE = 30;

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'destructive' }> = {
  success: { label: '成功', variant: 'default' },
  error:   { label: '错误', variant: 'destructive' },
};

export default function ToolLogsPage() {
  const [page, setPage] = useState(1);
  const [filterTool, setFilterTool] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();

  const { executions, total, isLoading, mutate } = useToolExecutions({
    skip: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
    tool_name: filterTool,
    status: filterStatus,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetFilters = () => {
    setFilterTool(undefined);
    setFilterStatus(undefined);
    setPage(1);
  };

  return (
    <div className="max-w-[1400px] mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/admin/tools">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">工具执行日志</h2>
            <p className="text-muted-foreground mt-1">
              查看工具调用的详细记录，支持按工具名称和状态过滤。
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => mutate()} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> 刷新
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">过滤条件</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">状态</label>
              <Select value={filterStatus ?? '__all__'} onValueChange={(v) => { setFilterStatus(v === '__all__' ? undefined : v); setPage(1); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部</SelectItem>
                  <SelectItem value="success">成功</SelectItem>
                  <SelectItem value="error">错误</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">工具名称</label>
              <Select value={filterTool ?? '__all__'} onValueChange={(v) => { setFilterTool(v === '__all__' ? undefined : v); setPage(1); }}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部</SelectItem>
                  {/* Build unique tool names from current results */}
                  {[...new Set(executions.map((e) => e.tool_name))].sort().map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" onClick={resetFilters}>重置</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardDescription>共 {total} 条记录</CardDescription>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && executions.length === 0 ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">时间</TableHead>
                  <TableHead>工具</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">耗时</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead className="max-w-[300px]">结果摘要</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map((row) => {
                  const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.success;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {row.created_at ? formatRelativeTime(row.created_at) : '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{row.tool_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{row.provider_name}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {row.duration_ms != null ? `${row.duration_ms}ms` : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {row.is_admin ? '管理员' : '用户'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-xs text-muted-foreground">
                        {row.error_message || row.result_summary || '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {executions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      暂无执行记录
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
