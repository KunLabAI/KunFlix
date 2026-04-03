'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LLMProvider, VideoModelCapabilities, VideoGenToolConfigData } from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle } from 'lucide-react';

// 标签映射表
const ASPECT_RATIO_LABELS: Record<string, string> = {
  "1:1": "1:1 (方形)", "16:9": "16:9 (宽屏)", "9:16": "9:16 (手机)",
  "4:3": "4:3 (标准)", "3:4": "3:4 (竖屏)", "3:2": "3:2", "2:3": "2:3",
};

const RESOLUTION_LABELS: Record<string, string> = {
  "480p": "480p", "720p": "720p (标准)", "768p": "768p",
  "1080p": "1080p (高清)", "4k": "4K (超高清)",
};

// 视频供应商类型集合
const VIDEO_PROVIDER_TYPES = new Set(["xai", "minimax", "gemini", "ark"]);

interface VideoGenConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  providers: LLMProvider[];
  videoCapabilities?: Record<string, VideoModelCapabilities>;
  initialConfig?: VideoGenToolConfigData;
  onSaveConfig: (config: VideoGenToolConfigData) => Promise<void>;
}

export default function VideoGenConfigDialog({
  open,
  onOpenChange,
  onSaved,
  providers,
  videoCapabilities,
  initialConfig,
  onSaveConfig,
}: VideoGenConfigDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // 本地表单状态
  const [enabled, setEnabled] = useState(false);
  const [providerId, setProviderId] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [duration, setDuration] = useState<string>('');
  const [quality, setQuality] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<string>('');

  // 从初始配置数据初始化表单
  useEffect(() => {
    const cfg = initialConfig;
    setEnabled(!!cfg?.video_generation_enabled);
    setProviderId(cfg?.video_provider_id || '');
    setModel(cfg?.video_model || '');
    setDuration(String(cfg?.video_config?.duration || ''));
    setQuality(cfg?.video_config?.quality || '');
    setAspectRatio(cfg?.video_config?.aspect_ratio || '');
  }, [initialConfig]);

  // 过滤支持视频生成的供应商
  const videoProviders = useMemo(
    () => providers.filter(p => p.is_active && VIDEO_PROVIDER_TYPES.has(p.provider_type?.toLowerCase())),
    [providers],
  );

  // 从供应商配置获取模型列表（与图像生成一致，模型在供应商管理中配置）
  const modelList = useMemo(() => {
    const p = videoProviders.find(pr => pr.id === providerId);
    return p
      ? (Array.isArray(p.models) ? p.models : (p.models || '').split(',').map((s: string) => s.trim()).filter(Boolean))
      : [];
  }, [providerId, videoProviders]);

  // 当前选中模型的能力（从 videoCapabilities 查询参数选项，可选增强）
  const caps = useMemo(
    () => videoCapabilities?.[model],
    [videoCapabilities, model],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const config: VideoGenToolConfigData = {
        video_generation_enabled: enabled,
        video_provider_id: enabled ? (providerId || null) : null,
        video_model: enabled ? (model || null) : null,
        video_config: enabled ? {
          duration: duration ? Number(duration) : undefined,
          quality: quality || undefined,
          aspect_ratio: aspectRatio || undefined,
        } : null,
      };
      await onSaveConfig(config);
      toast({ title: '保存成功', description: '视频生成工具配置已更新' });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: '保存失败',
        description: e?.response?.data?.detail || '请重试',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>配置视频生成工具</DialogTitle>
          <DialogDescription>
            设置全局 generate_video 工具参数（所有智能体共享此配置）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">启用视频生成</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <div className="space-y-4 pt-2 border-t">
              {/* 无可用供应商提示 */}
              {videoProviders.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    未找到视频供应商。请先在「供应商管理」中添加 xAI、MiniMax、Gemini 或火山方舟 (Ark) 类型的供应商。
                  </span>
                </div>
              )}

              {/* 视频供应商 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">视频供应商</Label>
                <Select
                  value={providerId}
                  onValueChange={(val) => {
                    setProviderId(val);
                    setModel('');
                    setDuration('');
                    setQuality('');
                    setAspectRatio('');
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="选择视频供应商" />
                  </SelectTrigger>
                  <SelectContent>
                    {videoProviders.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.provider_type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 视频模型 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">视频模型</Label>
                <Select
                  value={model}
                  onValueChange={(val) => {
                    setModel(val);
                    setDuration('');
                    setQuality('');
                    setAspectRatio('');
                  }}
                  disabled={!providerId || modelList.length === 0}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={!providerId ? "请先选择供应商" : modelList.length === 0 ? "该供应商无可用模型" : "选择模型"} />
                  </SelectTrigger>
                  <SelectContent>
                    {modelList.map((m: string) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {model && !caps && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
                  该模型暂无预设参数配置，将使用默认值。
                </div>
              )}

              {caps && (
                <div className="grid grid-cols-3 gap-3">
                  {/* 时长 */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">时长 (秒)</Label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="选择" />
                      </SelectTrigger>
                      <SelectContent>
                        {caps.durations.map((d: number) => (
                          <SelectItem key={d} value={String(d)}>{d}s</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 分辨率 */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">分辨率</Label>
                    <Select value={quality} onValueChange={setQuality}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="选择" />
                      </SelectTrigger>
                      <SelectContent>
                        {caps.resolutions.map((r: string) => (
                          <SelectItem key={r} value={r}>{RESOLUTION_LABELS[r] || r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 宽高比 */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">宽高比</Label>
                    <Select value={aspectRatio} onValueChange={setAspectRatio}>
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="选择" />
                      </SelectTrigger>
                      <SelectContent>
                        {caps.aspect_ratios.map((ar: string) => (
                          <SelectItem key={ar} value={ar}>{ASPECT_RATIO_LABELS[ar] || ar}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* 模型能力概览 */}
              {caps && (
                <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                  <p className="font-medium">模型能力:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {caps.modes.map((m: string) => (
                      <span key={m} className="px-1.5 py-0.5 bg-muted rounded text-[11px]">{m}</span>
                    ))}
                    {caps.supports_audio && <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-[11px]">原生音频</span>}
                    {caps.supports_reference_images && <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900 rounded text-[11px]">参考图片</span>}
                    {caps.supports_video_edit && <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900 rounded text-[11px]">视频编辑</span>}
                    {caps.supports_video_extension && <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 rounded text-[11px]">视频扩展</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
