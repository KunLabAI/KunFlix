'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RefreshCw, Activity, AlertTriangle, Clock, FileText, Settings2 } from 'lucide-react';
import { useToolRegistry, useAgentToolUsage, useToolStats, useImageCapabilities, useVideoCapabilities, useToolConfig, useUpdateToolConfig } from '@/hooks/useToolRegistry';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import { ImageGenToolConfigData, VideoGenToolConfigData, MusicGenToolConfigData } from '@/types';
import ImageGenConfigDialog from '@/components/admin/tools/ImageGenConfigDialog';
import VideoGenConfigDialog from '@/components/admin/tools/VideoGenConfigDialog';
import MusicGenConfigDialog from '@/components/admin/tools/MusicGenConfigDialog';

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

// generate_video 工具可配置参数定义
const VIDEO_GEN_CONFIG_PARAMS = [
  { name: 'video_generation_enabled', type: '布尔', description: '视频生成启用状态开关' },
  { name: 'video_provider_id', type: '字符串', description: '视频生成供应商 ID' },
  { name: 'video_model', type: '字符串', description: '视频生成模型名称' },
  { name: 'duration', type: '整数', description: '视频时长 (秒)' },
  { name: 'quality', type: '枚举', description: '分辨率 (480p, 720p, 1080p, 4k)' },
  { name: 'aspect_ratio', type: '枚举', description: '宽高比 (16:9, 9:16, 1:1 等)' },
];

// generate_music 工具可配置参数定义
const MUSIC_GEN_CONFIG_PARAMS = [
  { name: 'music_generation_enabled', type: '布尔', description: '音乐生成启用状态开关' },
  { name: 'music_provider_id', type: '字符串', description: '音乐生成供应商 ID (Gemini)' },
  { name: 'music_model', type: '字符串', description: '音乐模型 (lyria-3-clip-preview / lyria-3-pro-preview)' },
  { name: 'output_format', type: '枚举', description: '输出格式 (mp3, wav)' },
];

export default function ToolsPage() {
  const { registry, isLoading: regLoading } = useToolRegistry();
  const { agentUsage, isLoading: usageLoading } = useAgentToolUsage();
  const { stats, isLoading: statsLoading, mutate: refreshStats } = useToolStats();
  const { activeProviders } = useLLMProviders();
  const { capabilities: imageCapabilities } = useImageCapabilities();
  const { capabilities: videoCapabilities } = useVideoCapabilities();
  const { config: imageToolConfig, mutate: refreshImageToolConfig } = useToolConfig('generate_image');
  const { config: videoToolConfig, mutate: refreshVideoToolConfig } = useToolConfig('generate_video');
  const { config: musicToolConfig, mutate: refreshMusicToolConfig } = useToolConfig('generate_music');
  const { updateConfig } = useUpdateToolConfig();

  // Dialog 状态
  const [imageConfigDialogOpen, setImageConfigDialogOpen] = useState(false);
  const [videoConfigDialogOpen, setVideoConfigDialogOpen] = useState(false);
  const [musicConfigDialogOpen, setMusicConfigDialogOpen] = useState(false);

  const isLoading = regLoading || usageLoading || statsLoading;

  // 供应商名称查找映射
  const providerNameMap = new Map(
    (activeProviders || []).map(p => [p.id, `${p.name} (${p.provider_type})`])
  );

  // 获取全局配置数据
  const imageGenConfig: ImageGenToolConfigData | undefined = imageToolConfig?.config as ImageGenToolConfigData;
  const videoGenConfig: VideoGenToolConfigData | undefined = videoToolConfig?.config as VideoGenToolConfigData;
  const musicGenConfig: MusicGenToolConfigData | undefined = musicToolConfig?.config as MusicGenToolConfigData;

  const handleSaveImageConfig = async (config: ImageGenToolConfigData) => {
    await updateConfig('generate_image', { config });
  };

  const handleSaveVideoConfig = async (config: VideoGenToolConfigData) => {
    await updateConfig('generate_video', { config });
  };

  const handleSaveMusicConfig = async (config: MusicGenToolConfigData) => {
    await updateConfig('generate_music', { config });
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
                  {/* generate_image 工具配置 */}
                  {provider.tools.some(t => t.name === 'generate_image') && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4 text-emerald-500" />
                          <h5 className="text-sm font-medium text-emerald-600 dark:text-emerald-400">工具配置</h5>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setImageConfigDialogOpen(true)}
                        >
                          <Settings2 className="mr-1 h-3.5 w-3.5" />
                          配置
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={imageGenConfig?.image_generation_enabled ? 'default' : 'secondary'}>
                          {imageGenConfig?.image_generation_enabled ? '已启用' : '未启用'}
                        </Badge>
                        {imageGenConfig?.image_generation_enabled && (
                          <span className="text-sm text-muted-foreground">
                            {providerNameMap.get(imageGenConfig.image_provider_id || '') || '未选择供应商'} · {imageGenConfig.image_model || '未选择模型'}
                          </span>
                        )}
                      </div>
                      {imageGenConfig?.image_generation_enabled && imageGenConfig.image_config && (
                        <div className="text-xs text-muted-foreground">
                          宽高比: {imageGenConfig.image_config.aspect_ratio || '默认'} · 
                          画质: {imageGenConfig.image_config.quality || '默认'} · 
                          批量: {!imageGenConfig.image_config.batch_count || imageGenConfig.image_config.batch_count === 0 ? '自动' : `${imageGenConfig.image_config.batch_count}张`}
                        </div>
                      )}
                      <div className="mt-2 space-y-1.5">
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
                  {/* edit_image 工具 - 共享配置说明 */}
                  {provider.tools.some(t => t.name === 'edit_image') && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-2 mb-2">
                        <Settings2 className="h-4 w-4 text-blue-500" />
                        <h5 className="text-sm font-medium text-blue-600 dark:text-blue-400">工具配置</h5>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        图像编辑工具与「图像生成」共享全局配置。请在上方 ImageGenProvider 中配置。
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={imageGenConfig?.image_generation_enabled ? 'default' : 'secondary'}>
                          {imageGenConfig?.image_generation_enabled ? '已启用' : '未启用'}
                        </Badge>
                      </div>
                    </div>
                  )}
                  {/* generate_video 工具配置 */}
                  {provider.tools.some(t => t.name === 'generate_video') && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4 text-violet-500" />
                          <h5 className="text-sm font-medium text-violet-600 dark:text-violet-400">工具配置</h5>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setVideoConfigDialogOpen(true)}
                        >
                          <Settings2 className="mr-1 h-3.5 w-3.5" />
                          配置
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={videoGenConfig?.video_generation_enabled ? 'default' : 'secondary'}>
                          {videoGenConfig?.video_generation_enabled ? '已启用' : '未启用'}
                        </Badge>
                        {videoGenConfig?.video_generation_enabled && (
                          <span className="text-sm text-muted-foreground">
                            {providerNameMap.get(videoGenConfig.video_provider_id || '') || '未选择供应商'} · {videoGenConfig.video_model || '未选择模型'}
                          </span>
                        )}
                      </div>
                      {videoGenConfig?.video_generation_enabled && videoGenConfig.video_config && (
                        <div className="text-xs text-muted-foreground">
                          时长: {videoGenConfig.video_config.duration || '默认'}s · 
                          分辨率: {videoGenConfig.video_config.quality || '默认'} · 
                          宽高比: {videoGenConfig.video_config.aspect_ratio || '默认'}
                        </div>
                      )}
                      <div className="mt-2 space-y-1.5">
                        {VIDEO_GEN_CONFIG_PARAMS.map((param) => (
                          <div key={param.name} className="flex items-center gap-2 text-xs">
                            <code className="bg-muted px-1.5 py-0.5 rounded font-mono shrink-0">{param.name}</code>
                            <Badge variant="outline" className="text-[10px] shrink-0">{param.type}</Badge>
                            <span className="text-muted-foreground">{param.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* edit_video 工具 - 共享配置说明 */}
                  {provider.tools.some(t => t.name === 'edit_video') && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-2 mb-2">
                        <Settings2 className="h-4 w-4 text-indigo-500" />
                        <h5 className="text-sm font-medium text-indigo-600 dark:text-indigo-400">工具配置</h5>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        视频编辑工具与「视频生成」共享全局配置。请在上方 VideoGenProvider 中配置。
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={videoGenConfig?.video_generation_enabled ? 'default' : 'secondary'}>
                          {videoGenConfig?.video_generation_enabled ? '已启用' : '未启用'}
                        </Badge>
                      </div>
                    </div>
                  )}
                  {/* generate_music 工具配置 */}
                  {provider.tools.some(t => t.name === 'generate_music') && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4 text-pink-500" />
                          <h5 className="text-sm font-medium text-pink-600 dark:text-pink-400">工具配置</h5>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setMusicConfigDialogOpen(true)}
                        >
                          <Settings2 className="mr-1 h-3.5 w-3.5" />
                          配置
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={musicGenConfig?.music_generation_enabled ? 'default' : 'secondary'}>
                          {musicGenConfig?.music_generation_enabled ? '已启用' : '未启用'}
                        </Badge>
                        {musicGenConfig?.music_generation_enabled && (
                          <span className="text-sm text-muted-foreground">
                            {providerNameMap.get(musicGenConfig.music_provider_id || '') || '未选择供应商'} · {musicGenConfig.music_model || '未选择模型'}
                          </span>
                        )}
                      </div>
                      {musicGenConfig?.music_generation_enabled && musicGenConfig.music_config && (
                        <div className="text-xs text-muted-foreground">
                          输出格式: {musicGenConfig.music_config.output_format || '默认'}
                        </div>
                      )}
                      <div className="mt-2 space-y-1.5">
                        {MUSIC_GEN_CONFIG_PARAMS.map((param) => (
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
                  <TableHead>视频生成</TableHead>
                  <TableHead>音乐生成</TableHead>
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
                      <Badge variant={agent.video_gen_enabled ? 'default' : 'secondary'}>
                        {agent.video_gen_enabled ? '已启用' : '未启用'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={agent.music_gen_enabled ? 'default' : 'secondary'}>
                        {agent.music_gen_enabled ? '已启用' : '未启用'}
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
        open={imageConfigDialogOpen}
        onOpenChange={setImageConfigDialogOpen}
        onSaved={() => refreshImageToolConfig()}
        providers={activeProviders || []}
        imageCapabilities={imageCapabilities}
        initialConfig={imageGenConfig}
        onSaveConfig={handleSaveImageConfig}
      />

      {/* 视频生成配置 Dialog */}
      <VideoGenConfigDialog
        open={videoConfigDialogOpen}
        onOpenChange={setVideoConfigDialogOpen}
        onSaved={() => refreshVideoToolConfig()}
        providers={activeProviders || []}
        videoCapabilities={videoCapabilities}
        initialConfig={videoGenConfig}
        onSaveConfig={handleSaveVideoConfig}
      />

      {/* 音乐生成配置 Dialog */}
      <MusicGenConfigDialog
        open={musicConfigDialogOpen}
        onOpenChange={setMusicConfigDialogOpen}
        onSaved={() => refreshMusicToolConfig()}
        providers={activeProviders || []}
        initialConfig={musicGenConfig}
        onSaveConfig={handleSaveMusicConfig}
      />
    </div>
  );
}
