'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RefreshCw, Activity, AlertTriangle, Clock, FileText, Settings2, Paintbrush } from 'lucide-react';
import { useToolRegistry, useAgentToolUsage, useToolStats, useImageCapabilities } from '@/hooks/useToolRegistry';
import { useAgents } from '@/hooks/useAgents';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import { Agent } from '@/types';
import ImageGenConfigDialog from '@/components/admin/tools/ImageGenConfigDialog';

// generate_image 工具可配置参数定义（映射 UnifiedImageGenConfig）
const IMAGE_GEN_CONFIG_PARAMS = [
  { name: 'image_generation_enabled', type: '布尔', description: '图像生成启用状态开关' },
  { name: 'image_provider_id', type: '字符串', description: '图像生成供应商 ID（支持跨供应商配置）' },
  { name: 'image_model', type: '字符串', description: '图像生成模型名称' },
  { name: 'aspect_ratio', type: '枚举', description: '宽高比选择 (auto, 1:1, 16:9, 9:16, 4:3, 3:4 等)' },
  { name: 'quality', type: '枚举', description: '图像质量 (standard, hd, ultra)' },
  { name: 'batch_count', type: '整数 1-10', description: '批量生成数量' },
  { name: 'output_format', type: '枚举', description: '输出格式 (png, jpeg, webp)' },
];

export default function ToolsPage() {
  const { registry, isLoading: regLoading } = useToolRegistry();
  const { agentUsage, isLoading: usageLoading } = useAgentToolUsage();
  const { stats, isLoading: statsLoading, mutate: refreshStats } = useToolStats();
  const { agents, mutate: refreshAgents } = useAgents(undefined, 1, 100);
  const { activeProviders } = useLLMProviders();
  const { capabilities: imageCapabilities } = useImageCapabilities();

  // 图像生成配置 Dialog 状态
  const [configAgent, setConfigAgent] = useState<Agent | null>(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  const isLoading = regLoading || usageLoading || statsLoading;

  // 供应商名称查找映射
  const providerNameMap = new Map(
    (activeProviders || []).map(p => [p.id, `${p.name} (${p.provider_type})`])
  );

  const handleEditAgent = (agent: Agent) => {
    setConfigAgent(agent);
    setConfigDialogOpen(true);
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">工具管理</h2>
          <p className="text-muted-foreground mt-2">
            查看系统注册的工具 Provider、配置工具参数与执行统计。
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
                  {/* generate_image 工具可配置参数展示 */}
                  {provider.tools.some(t => t.name === 'generate_image') && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-2 mb-2">
                        <Settings2 className="h-4 w-4 text-emerald-500" />
                        <h5 className="text-sm font-medium text-emerald-600 dark:text-emerald-400">智能体级可配置参数</h5>
                      </div>
                      <div className="space-y-1.5">
                        {IMAGE_GEN_CONFIG_PARAMS.map((param) => (
                          <div key={param.name} className="flex items-center gap-2 text-xs">
                            <code className="bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">{param.name}</code>
                            <Badge variant="outline" className="text-[10px] shrink-0">{param.type}</Badge>
                            <span className="text-muted-foreground">{param.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 图像生成工具配置（per-agent） ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Paintbrush className="h-5 w-5 text-emerald-500" />
            <CardTitle>图像生成工具配置</CardTitle>
          </div>
          <CardDescription>
            配置各智能体的 generate_image 工具参数（供应商、模型、画质等）
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>智能体</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>图像供应商</TableHead>
                <TableHead>图像模型</TableHead>
                <TableHead>宽高比</TableHead>
                <TableHead>画质</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(agents || []).map((agent) => {
                const cfg = agent.image_config;
                const isEnabled = !!cfg?.image_generation_enabled;
                const pName = cfg?.image_provider_id ? (providerNameMap.get(cfg.image_provider_id) || cfg.image_provider_id) : '-';
                return (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell>
                      <Badge variant={isEnabled ? 'default' : 'secondary'}>
                        {isEnabled ? '已启用' : '未启用'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {isEnabled ? pName : '-'}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-muted-foreground">
                      {isEnabled ? (cfg?.image_model || '-') : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {isEnabled ? (cfg?.image_config?.aspect_ratio || '-') : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {isEnabled ? (cfg?.image_config?.quality || '-') : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditAgent(agent)}
                      >
                        <Settings2 className="mr-1 h-3.5 w-3.5" />
                        配置
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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

      {/* 图像生成配置 Dialog */}
      <ImageGenConfigDialog
        agent={configAgent}
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onSaved={() => refreshAgents()}
        providers={activeProviders || []}
        imageCapabilities={imageCapabilities}
      />
    </div>
  );
}
