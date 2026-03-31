'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RefreshCw, Activity, AlertTriangle, Clock, FileText } from 'lucide-react';
import { useToolRegistry, useAgentToolUsage, useToolStats } from '@/hooks/useToolRegistry';

export default function ToolsPage() {
  const { registry, isLoading: regLoading } = useToolRegistry();
  const { agentUsage, isLoading: usageLoading } = useAgentToolUsage();
  const { stats, isLoading: statsLoading, mutate: refreshStats } = useToolStats();

  const isLoading = regLoading || usageLoading || statsLoading;

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">工具管理</h2>
          <p className="text-muted-foreground mt-2">
            查看系统注册的工具 Provider、Agent 工具配置与执行统计。
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/tools/logs">
            <Button variant="outline">
              <FileText className="mr-2 h-4 w-4" /> 执行日志
            </Button>
          </Link>
          <Button variant="outline" onClick={() => refreshStats()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总调用次数</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_executions ?? '-'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">错误次数</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_errors ?? '-'}</div>
            <p className="text-xs text-muted-foreground">
              错误率 {stats?.error_rate ?? 0}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均耗时</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.avg_duration_ms != null ? `${stats.avg_duration_ms}ms` : '-'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">注册 Provider</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{registry?.length ?? '-'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tool Registry */}
      <Card>
        <CardHeader>
          <CardTitle>工具注册表</CardTitle>
          <CardDescription>系统中所有已注册的工具 Provider 及其工具列表</CardDescription>
        </CardHeader>
        <CardContent>
          {regLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {registry?.map((provider) => (
                <div key={provider.provider_name} className="border rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold text-base">{provider.display_name}</h4>
                    <Badge variant="outline">{provider.provider_name}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">{provider.description}</p>
                  <p className="text-xs text-muted-foreground mb-3">启用条件: {provider.condition}</p>
                  <div className="flex flex-wrap gap-2">
                    {provider.tools.map((tool) => (
                      <Badge key={tool.name} variant="secondary" className="text-xs">
                        {tool.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-tool Stats */}
      {stats?.by_tool && stats.by_tool.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>工具调用统计</CardTitle>
            <CardDescription>按工具名称分组的调用次数与平均耗时</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>工具名称</TableHead>
                  <TableHead className="text-right">调用次数</TableHead>
                  <TableHead className="text-right">平均耗时</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.by_tool.map((row) => (
                  <TableRow key={row.tool_name}>
                    <TableCell className="font-mono text-sm">{row.tool_name}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">
                      {row.avg_duration_ms != null ? `${row.avg_duration_ms}ms` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Agent Tool Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Agent 工具配置</CardTitle>
          <CardDescription>每个 Agent 启用的工具能力概览</CardDescription>
        </CardHeader>
        <CardContent>
          {usageLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>画布</TableHead>
                  <TableHead>图像生成</TableHead>
                  <TableHead>Skills</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentUsage?.map((agent) => (
                  <TableRow key={agent.agent_id}>
                    <TableCell className="font-medium">{agent.agent_name}</TableCell>
                    <TableCell>
                      {agent.canvas_enabled ? (
                        <Badge variant="default">
                          {agent.canvas_node_types.length} 类型
                        </Badge>
                      ) : (
                        <Badge variant="secondary">未启用</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={agent.image_gen_enabled ? 'default' : 'secondary'}>
                        {agent.image_gen_enabled ? '已启用' : '未启用'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {agent.skills.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {agent.skills.map((s) => (
                            <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
