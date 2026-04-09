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
import { AlertCircle } from 'lucide-react';

// 音频供应商类型集合（Lyria 3 由 Gemini 供应商提供）
const MUSIC_PROVIDER_TYPES = new Set(["gemini"]);

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
  const [providerId, setProviderId] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [outputFormat, setOutputFormat] = useState<string>('mp3');

  // 从初始配置初始化
  useEffect(() => {
    const cfg = initialConfig;
    setEnabled(!!cfg?.music_generation_enabled);
    setProviderId(cfg?.music_provider_id || '');
    setModel(cfg?.music_model || '');
    setOutputFormat(cfg?.music_config?.output_format || 'mp3');
  }, [initialConfig]);

  // 过滤支持音乐生成的供应商
  const musicProviders = useMemo(
    () => providers.filter(p => p.is_active && MUSIC_PROVIDER_TYPES.has(p.provider_type?.toLowerCase())),
    [providers],
  );

  // 从供应商配置获取模型列表
  const modelList = useMemo(() => {
    const p = musicProviders.find(pr => pr.id === providerId);
    return p
      ? (Array.isArray(p.models) ? p.models : (p.models || '').split(',').map((s: string) => s.trim()).filter(Boolean))
      : [];
  }, [providerId, musicProviders]);

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
        music_provider_id: enabled ? (providerId || null) : null,
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
              {/* 无可用供应商提示 */}
              {musicProviders.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    未找到音乐供应商。请先在「供应商管理」中添加 Google Gemini 类型的供应商，并配置 Lyria 3 模型。
                  </span>
                </div>
              )}

              {/* 音乐供应商 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">音乐供应商</Label>
                <Select
                  value={providerId}
                  onValueChange={(val) => {
                    setProviderId(val);
                    setModel('');
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="选择音乐供应商" />
                  </SelectTrigger>
                  <SelectContent>
                    {musicProviders.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.provider_type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 音乐模型 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">音乐模型</Label>
                <Select
                  value={model}
                  onValueChange={setModel}
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
