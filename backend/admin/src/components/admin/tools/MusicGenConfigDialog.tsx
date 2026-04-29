'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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

  // 输出格式选项
  const outputFormatOptions = useMemo(
    () => [
      { value: 'mp3', label: t('tools.musicDialog.formats.mp3') },
      { value: 'wav', label: t('tools.musicDialog.formats.wav') },
    ],
    [t],
  );

  // 模型能力标签映射
  const modelCapsMap: Record<string, { label: string; description: string }> = useMemo(
    () => ({
      'lyria-3-clip-preview': {
        label: t('tools.musicDialog.caps.clipLabel'),
        description: t('tools.musicDialog.caps.clipDesc'),
      },
      'lyria-3-pro-preview': {
        label: t('tools.musicDialog.caps.proLabel'),
        description: t('tools.musicDialog.caps.proDesc'),
      },
    }),
    [t],
  );

  const currentCaps = modelCapsMap[model];

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
      toast({ title: t('tools.musicDialog.saveSuccess'), description: t('tools.musicDialog.saveSuccessDesc') });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: t('tools.musicDialog.saveFailed'),
        description: e?.response?.data?.detail || t('tools.musicDialog.retry'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('tools.musicDialog.title')}</DialogTitle>
          <DialogDescription>{t('tools.musicDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t('tools.musicDialog.enable')}</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <div className="space-y-4 pt-2 border-t">
              {/* 无可用模型提示 */}
              {audioModels.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{t('tools.musicDialog.noModelWarning')}</span>
                </div>
              )}

              {/* 音乐模型（扁平列表，按 model_type 过滤） */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('tools.musicDialog.model')}</Label>
                <Select
                  value={model}
                  onValueChange={setModel}
                  disabled={audioModels.length === 0}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={audioModels.length === 0 ? t('tools.musicDialog.modelEmpty') : t('tools.musicDialog.modelSelect')} />
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
                  <p className="font-medium">{t('tools.musicDialog.modelCaps')}</p>
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
                <Label className="text-xs text-muted-foreground">{t('tools.musicDialog.outputFormat')}</Label>
                <Select value={outputFormat} onValueChange={setOutputFormat}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t('tools.musicDialog.selectFormat')} />
                  </SelectTrigger>
                  <SelectContent>
                    {outputFormatOptions.map(opt => (
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
            {t('common.buttons.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('common.status.saving') : t('common.buttons.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
