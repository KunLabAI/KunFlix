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
import { LLMProvider, MusicGenToolConfigData } from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { collectModelsByType } from '@/lib/api-utils';
import { AlertCircle } from 'lucide-react';

// 音频供应商类型集合（已废弃，改用 model_type 过滤）
// const MUSIC_PROVIDER_TYPES = new Set(["gemini"]);

// 输出格式选项
const OUTPUT_FORMAT_OPTIONS = [
  { value: 'mp3', label: 'MP3 (通用)' },
  { value: 'wav', label: 'WAV (无损，仅 Pro)' },
];

interface MusicGenConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  providers: LLMProvider[];
  initialConfig?: MusicGenToolConfigData;
  onSaveConfig: (config: MusicGenToolConfigData) => Promise<void>;
}

export default function MusicGenConfigDialog({
  open,
  onOpenChange,
  onSaved,
  providers,
  initialConfig,
  onSaveConfig,
}: MusicGenConfigDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // 本地表单状态
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState<string>('');
  const [outputFormat, setOutputFormat] = useState<string>('mp3');

  // 从初始配置初始化
  useEffect(() => {
    const cfg = initialConfig;
    setEnabled(!!cfg?.music_generation_enabled);
    setModel(cfg?.music_model || '');
    setOutputFormat(cfg?.music_config?.output_format || 'mp3');
  }, [initialConfig]);

  // 按 model_type='audio' 收集所有音频模型（扁平化，跨供应商）
  const audioModels = useMemo(
    () => collectModelsByType(providers, 'audio'),
    [providers],
  );

  // 当前选中模型对应的供应商（自动反推）
  const selectedEntry = useMemo(
    () => audioModels.find(m => m.value === model),
    [audioModels, model],
  );

  // 模型能力标签映射
  const MODEL_CAPS: Record<string, { label: string; description: string }> = {
    'lyria-3-clip-preview': { label: 'Clip', description: '短音乐片段 (~30秒), 仅 MP3' },
    'lyria-3-pro-preview': { label: 'Pro', description: '完整歌曲 (3-5分钟), MP3/WAV, 支持歌词' },
  };

  const currentCaps = MODEL_CAPS[model];

  const handleSave = async () => {
    setSaving(true);
    try {
      const config: MusicGenToolConfigData = {
        music_generation_enabled: enabled,
        music_provider_id: enabled ? (selectedEntry?.providerId || null) : null,
        music_model: enabled ? (model || null) : null,
        music_config: enabled ? {
          output_format: outputFormat || undefined,
        } : null,
      };
      await onSaveConfig(config);
      toast({ title: '保存成功', description: '音乐生成工具配置已更新' });
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
          <DialogTitle>配置音乐生成工具</DialogTitle>
          <DialogDescription>
            设置全局 generate_music 工具参数（所有智能体共享此配置）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">启用音乐生成</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <div className="space-y-4 pt-2 border-t">
              {/* 无可用模型提示 */}
              {audioModels.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    未找到音频模型。请先在「供应商管理」中为供应商的模型设置「音频模型」类型。
                  </span>
                </div>
              )}

              {/* 音乐模型（扁平列表，按 model_type 过滤） */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">音乐模型</Label>
                <Select
                  value={model}
                  onValueChange={setModel}
                  disabled={audioModels.length === 0}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={audioModels.length === 0 ? "无可用音频模型" : "选择音乐模型"} />
                  </SelectTrigger>
                  <SelectContent>
                    {audioModels.map((m) => (
                      <SelectItem key={`${m.providerId}:${m.value}`} value={m.value}>
                        {m.displayName}
                        <span className="ml-2 text-muted-foreground text-[11px]">({m.providerName})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 模型能力概览 */}
              {currentCaps && (
                <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                  <p className="font-medium">模型能力:</p>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 bg-pink-100 dark:bg-pink-900 rounded text-[11px]">
                      {currentCaps.label}
                    </span>
                    <span>{currentCaps.description}</span>
                  </div>
                </div>
              )}

              {/* 输出格式 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">默认输出格式</Label>
                <Select value={outputFormat} onValueChange={setOutputFormat}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="选择格式" />
                  </SelectTrigger>
                  <SelectContent>
                    {OUTPUT_FORMAT_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
