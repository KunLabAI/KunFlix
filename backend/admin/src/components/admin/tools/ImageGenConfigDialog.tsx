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
import { LLMProvider, ImageProviderCapability, ImageGenToolConfigData } from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { collectModelsByType } from '@/lib/api-utils';
import { AlertCircle } from 'lucide-react';

// 标签映射表
const ASPECT_RATIO_LABELS: Record<string, string> = {
  "auto": "自动", "1:1": "1:1 (方形)", "16:9": "16:9 (宽屏)", "9:16": "9:16 (手机)",
  "4:3": "4:3 (标准)", "3:4": "3:4 (竖屏)", "3:2": "3:2", "2:3": "2:3",
  "2:1": "2:1 (超宽)", "1:2": "1:2 (超高)",
};

const QUALITY_LABELS: Record<string, string> = {
  "standard": "标准", "hd": "高清", "ultra": "超高清",
};

const OUTPUT_FORMAT_LABELS: Record<string, string> = {
  "png": "PNG", "jpeg": "JPEG", "webp": "WebP",
};

interface ImageGenConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  providers: LLMProvider[];
  imageCapabilities?: Record<string, ImageProviderCapability>;
  initialConfig?: ImageGenToolConfigData;
  onSaveConfig: (config: ImageGenToolConfigData) => Promise<void>;
}

export default function ImageGenConfigDialog({
  open,
  onOpenChange,
  onSaved,
  providers,
  imageCapabilities,
  initialConfig,
  onSaveConfig,
}: ImageGenConfigDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // 本地表单状态
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<string>('');
  const [quality, setQuality] = useState<string>('');
  const [batchCount, setBatchCount] = useState<number | null>(null);
  const [outputFormat, setOutputFormat] = useState<string>('');

  // 从初始配置数据初始化表单
  useEffect(() => {
    const cfg = initialConfig;
    setEnabled(!!cfg?.image_generation_enabled);
    setModel(cfg?.image_model || '');
    setAspectRatio(cfg?.image_config?.aspect_ratio || '');
    setQuality(cfg?.image_config?.quality || '');
    setBatchCount(cfg?.image_config?.batch_count ?? null);
    setOutputFormat(cfg?.image_config?.output_format || '');
  }, [initialConfig]);

  // 按 model_type='image' 收集所有图像模型（扁平化，跨供应商）
  const imageModels = useMemo(
    () => collectModelsByType(providers, 'image'),
    [providers],
  );

  // 当前选中模型对应的供应商类型（自动反推）
  const selectedEntry = useMemo(
    () => imageModels.find(m => m.value === model),
    [imageModels, model],
  );
  const providerType = useMemo(() => {
    const p = providers.find(pr => pr.id === selectedEntry?.providerId);
    return p?.provider_type?.toLowerCase() || '';
  }, [selectedEntry, providers]);

  // 当前供应商能力
  const caps = useMemo(
    () => imageCapabilities?.[providerType],
    [imageCapabilities, providerType],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const config: ImageGenToolConfigData = {
        image_generation_enabled: enabled,
        image_provider_id: enabled ? (selectedEntry?.providerId || null) : null,
        image_model: enabled ? (model || null) : null,
        image_config: enabled ? {
          aspect_ratio: aspectRatio || null,
          quality: (quality as 'standard' | 'hd' | 'ultra') || null,
          batch_count: batchCount,
          output_format: (outputFormat as 'png' | 'jpeg' | 'webp') || null,
        } : null,
      };
      await onSaveConfig(config);
      toast({ title: '保存成功', description: '图像生成工具配置已更新' });
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
          <DialogTitle>配置图像生成工具</DialogTitle>
          <DialogDescription>
            设置全局 generate_image 工具参数（所有智能体共享此配置）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">启用图像生成</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <div className="space-y-4 pt-2 border-t">
              {/* 无可用模型提示 */}
              {imageModels.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    未找到图像模型。请先在「供应商管理」中为供应商的模型设置「图像模型」类型。
                  </span>
                </div>
              )}

              {/* 图像模型（扁平列表，按 model_type 过滤） */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">图像模型</Label>
                <Select
                  value={model}
                  onValueChange={setModel}
                  disabled={imageModels.length === 0}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={imageModels.length === 0 ? "无可用图像模型" : "选择图像模型"} />
                  </SelectTrigger>
                  <SelectContent>
                    {imageModels.map((m) => (
                      <SelectItem key={`${m.providerId}:${m.value}`} value={m.value}>
                        {m.displayName}
                        <span className="ml-2 text-muted-foreground text-[11px]">({m.providerName})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* 宽高比 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">宽高比</Label>
                  <Select
                    value={aspectRatio}
                    onValueChange={setAspectRatio}
                    disabled={!caps}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={caps ? "选择" : "请先选择供应商"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(caps?.aspect_ratios || []).map((v: string) => (
                        <SelectItem key={v} value={v}>{ASPECT_RATIO_LABELS[v] || v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 画质 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">画质</Label>
                  <Select
                    value={quality}
                    onValueChange={setQuality}
                    disabled={!caps}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={caps ? "选择" : "请先选择供应商"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(caps?.qualities || []).map((v: string) => (
                        <SelectItem key={v} value={v}>{QUALITY_LABELS[v] || v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* 批量生成数量 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">每次生成张数</Label>
                  <Select
                    value={batchCount === null || batchCount === 0 ? 'auto' : String(batchCount)}
                    onValueChange={val => setBatchCount(val === 'auto' ? 0 : Number(val))}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自动（智能体决定）</SelectItem>
                      <SelectItem value="1">1 张</SelectItem>
                      <SelectItem value="2">2 张</SelectItem>
                      <SelectItem value="3">3 张</SelectItem>
                      <SelectItem value="4">4 张</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 输出格式 */}
                {(caps?.output_formats?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">输出格式</Label>
                    <Select
                      value={outputFormat}
                      onValueChange={setOutputFormat}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="选择" />
                      </SelectTrigger>
                      <SelectContent>
                        {(caps?.output_formats || []).map((v: string) => (
                          <SelectItem key={v} value={v}>{OUTPUT_FORMAT_LABELS[v] || v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
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
