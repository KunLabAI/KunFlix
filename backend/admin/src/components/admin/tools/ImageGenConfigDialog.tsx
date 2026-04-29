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
import { LLMProvider, ImageProviderCapability, ImageGenToolConfigData } from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { collectModelsByType } from '@/lib/api-utils';
import { AlertCircle } from 'lucide-react';

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
  const { t } = useTranslation();
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
      toast({ title: t('tools.imageDialog.saveSuccess'), description: t('tools.imageDialog.saveSuccessDesc') });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: t('tools.imageDialog.saveFailed'),
        description: e?.response?.data?.detail || t('tools.imageDialog.retry'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('tools.imageDialog.title')}</DialogTitle>
          <DialogDescription>{t('tools.imageDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t('tools.imageDialog.enable')}</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <div className="space-y-4 pt-2 border-t">
              {/* 无可用模型提示 */}
              {imageModels.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{t('tools.imageDialog.noModelWarning')}</span>
                </div>
              )}

              {/* 图像模型（扁平列表，按 model_type 过滤） */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('tools.imageDialog.model')}</Label>
                <Select
                  value={model}
                  onValueChange={setModel}
                  disabled={imageModels.length === 0}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={imageModels.length === 0 ? t('tools.imageDialog.modelEmpty') : t('tools.imageDialog.modelSelect')} />
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
                  <Label className="text-xs text-muted-foreground">{t('tools.imageDialog.aspectRatio')}</Label>
                  <Select
                    value={aspectRatio}
                    onValueChange={setAspectRatio}
                    disabled={!caps}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={caps ? t('tools.imageDialog.selectPlaceholder') : t('tools.imageDialog.selectProviderFirst')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(caps?.aspect_ratios || []).map((v: string) => (
                        <SelectItem key={v} value={v}>{t(`tools.aspectRatios.${v}`, { defaultValue: v })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 画质 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('tools.imageDialog.quality')}</Label>
                  <Select
                    value={quality}
                    onValueChange={setQuality}
                    disabled={!caps}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={caps ? t('tools.imageDialog.selectPlaceholder') : t('tools.imageDialog.selectProviderFirst')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(caps?.qualities || []).map((v: string) => (
                        <SelectItem key={v} value={v}>{t(`tools.qualities.${v}`, { defaultValue: v })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* 批量生成数量 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t('tools.imageDialog.batchCount')}</Label>
                  <Select
                    value={batchCount === null || batchCount === 0 ? 'auto' : String(batchCount)}
                    onValueChange={val => setBatchCount(val === 'auto' ? 0 : Number(val))}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={t('tools.imageDialog.selectPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{t('tools.imageDialog.batchAuto')}</SelectItem>
                      <SelectItem value="1">{t('tools.imageDialog.batchN', { count: 1 })}</SelectItem>
                      <SelectItem value="2">{t('tools.imageDialog.batchN', { count: 2 })}</SelectItem>
                      <SelectItem value="3">{t('tools.imageDialog.batchN', { count: 3 })}</SelectItem>
                      <SelectItem value="4">{t('tools.imageDialog.batchN', { count: 4 })}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 输出格式 */}
                {(caps?.output_formats?.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('tools.imageDialog.outputFormat')}</Label>
                    <Select
                      value={outputFormat}
                      onValueChange={setOutputFormat}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder={t('tools.imageDialog.selectPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {(caps?.output_formats || []).map((v: string) => (
                          <SelectItem key={v} value={v}>{t(`tools.outputFormats.${v}`, { defaultValue: v })}</SelectItem>
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
