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
import { LLMProvider, TtsGenToolConfigData } from '@/types';
import { useToast } from '@/components/ui/use-toast';
import { collectModelsByType } from '@/lib/api-utils';
import { AlertCircle } from 'lucide-react';

interface TtsGenConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  providers: LLMProvider[];
  initialConfig?: TtsGenToolConfigData;
  onSaveConfig: (config: TtsGenToolConfigData) => Promise<void>;
}

// 预置音色（与后端 services/tts_providers/gemini_tts.py PREBUILT_VOICES 保持一致）
const PREBUILT_VOICES: Array<{ name: string; tone: string; gender: 'male' | 'female' }> = [
  { name: 'Zephyr', tone: 'Bright', gender: 'female' }, { name: 'Puck', tone: 'Upbeat', gender: 'male' }, { name: 'Charon', tone: 'Informative', gender: 'male' },
  { name: 'Kore', tone: 'Firm', gender: 'female' }, { name: 'Fenrir', tone: 'Excitable', gender: 'male' }, { name: 'Leda', tone: 'Youthful', gender: 'female' },
  { name: 'Orus', tone: 'Firm', gender: 'male' }, { name: 'Aoede', tone: 'Breezy', gender: 'female' }, { name: 'Callirrhoe', tone: 'Easy-going', gender: 'female' },
  { name: 'Autonoe', tone: 'Bright', gender: 'female' }, { name: 'Enceladus', tone: 'Breathy', gender: 'male' }, { name: 'Iapetus', tone: 'Clear', gender: 'male' },
  { name: 'Umbriel', tone: 'Easy-going', gender: 'male' }, { name: 'Algieba', tone: 'Smooth', gender: 'male' }, { name: 'Despina', tone: 'Smooth', gender: 'female' },
  { name: 'Erinome', tone: 'Clear', gender: 'female' }, { name: 'Algenib', tone: 'Gravelly', gender: 'male' }, { name: 'Rasalgethi', tone: 'Informative', gender: 'male' },
  { name: 'Laomedeia', tone: 'Upbeat', gender: 'female' }, { name: 'Achernar', tone: 'Soft', gender: 'female' }, { name: 'Alnilam', tone: 'Firm', gender: 'male' },
  { name: 'Schedar', tone: 'Even', gender: 'male' }, { name: 'Gacrux', tone: 'Mature', gender: 'female' }, { name: 'Pulcherrima', tone: 'Forward', gender: 'female' },
  { name: 'Achird', tone: 'Friendly', gender: 'male' }, { name: 'Zubenelgenubi', tone: 'Casual', gender: 'male' }, { name: 'Vindemiatrix', tone: 'Gentle', gender: 'female' },
  { name: 'Sadachbia', tone: 'Lively', gender: 'male' }, { name: 'Sadaltager', tone: 'Knowledgeable', gender: 'male' }, { name: 'Sulafat', tone: 'Warm', gender: 'female' },
];

// 预置音色语气中文标签（音色名 -> 中文）；英文语气直接用 tone 字段
const VOICE_TONES_ZH: Record<string, string> = {
  Zephyr: '明亮', Puck: '欢快', Charon: '沉稳',
  Kore: '坚定', Fenrir: '激越', Leda: '年轻',
  Orus: '坚定', Aoede: '轻快', Callirrhoe: '随和',
  Autonoe: '明亮', Enceladus: '气声', Iapetus: '清澈',
  Umbriel: '随和', Algieba: '柔滑', Despina: '柔滑',
  Erinome: '清澈', Algenib: '沙哑', Rasalgethi: '沉稳',
  Laomedeia: '欢快', Achernar: '柔和', Alnilam: '坚定',
  Schedar: '平稳', Gacrux: '成熟', Pulcherrima: '直接',
  Achird: '友好', Zubenelgenubi: '随意', Vindemiatrix: '温柔',
  Sadachbia: '活泼', Sadaltager: '博学', Sulafat: '温暖',
};

export default function TtsGenConfigDialog({
  open,
  onOpenChange,
  onSaved,
  providers,
  initialConfig,
  onSaveConfig,
}: TtsGenConfigDialogProps) {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const [saving, setSaving] = useState(false);

  // 当前语言下音色语气标签（中文走映射表，英文用原 tone）
  const isZh = (i18n.language || '').toLowerCase().startsWith('zh');
  const voiceTone = (v: { name: string; tone: string }) => (isZh ? (VOICE_TONES_ZH[v.name] || v.tone) : v.tone);
  const voiceGender = (g: string) => (g === 'male' ? (isZh ? '♂ 男' : '♂ Male') : g === 'female' ? (isZh ? '♀ 女' : '♀ Female') : '');

  // 本地表单状态
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState<string>('');
  const [voice, setVoice] = useState<string>('auto');
  const [outputFormat, setOutputFormat] = useState<string>('wav');

  // 从初始配置初始化
  useEffect(() => {
    const cfg = initialConfig;
    setEnabled(!!cfg?.tts_generation_enabled);
    setModel(cfg?.tts_model || '');
    setVoice(cfg?.tts_config?.voice || 'auto');
    setOutputFormat(cfg?.tts_config?.output_format || 'wav');
  }, [initialConfig]);

  // 按 model_type='tts' 收集所有语音模型（扁平化，跨供应商）
  const ttsModels = useMemo(
    () => collectModelsByType(providers, 'tts'),
    [providers],
  );

  // 当前选中模型对应的供应商（自动反推）
  const selectedEntry = useMemo(
    () => ttsModels.find(m => m.value === model),
    [ttsModels, model],
  );

  // 输出格式选项
  const outputFormatOptions = useMemo(
    () => [
      { value: 'wav', label: t('tools.ttsDialog.formats.wav') },
      { value: 'l16', label: t('tools.ttsDialog.formats.l16') },
    ],
    [t],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const config: TtsGenToolConfigData = {
        tts_generation_enabled: enabled,
        tts_provider_id: enabled ? (selectedEntry?.providerId || null) : null,
        tts_model: enabled ? (model || null) : null,
        tts_config: enabled ? {
          voice: voice || undefined,
          output_format: outputFormat || undefined,
        } : null,
      };
      await onSaveConfig(config);
      toast({ title: t('tools.ttsDialog.saveSuccess'), description: t('tools.ttsDialog.saveSuccessDesc') });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: t('tools.ttsDialog.saveFailed'),
        description: e?.response?.data?.detail || t('tools.ttsDialog.retry'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('tools.ttsDialog.title')}</DialogTitle>
          <DialogDescription>{t('tools.ttsDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t('tools.ttsDialog.enable')}</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <div className="space-y-4 pt-2 border-t">
              {/* 无可用模型提示 */}
              {ttsModels.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{t('tools.ttsDialog.noModelWarning')}</span>
                </div>
              )}

              {/* TTS 模型（扁平列表，按 model_type 过滤） */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('tools.ttsDialog.model')}</Label>
                <Select
                  value={model}
                  onValueChange={setModel}
                  disabled={ttsModels.length === 0}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={ttsModels.length === 0 ? t('tools.ttsDialog.modelEmpty') : t('tools.ttsDialog.modelSelect')} />
                  </SelectTrigger>
                  <SelectContent>
                    {ttsModels.map((m) => (
                      <SelectItem key={`${m.providerId}:${m.value}`} value={m.value}>
                        {m.displayName}
                        <span className="ml-2 text-muted-foreground text-[11px]">({m.providerName})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 默认音色（auto = 由模型自动选择，适合 Agent 调用） */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('tools.ttsDialog.defaultVoice')}</Label>
                <Select value={voice} onValueChange={setVoice}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t('tools.ttsDialog.selectVoice')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t('tools.ttsDialog.voiceAuto')}</SelectItem>
                    {PREBUILT_VOICES.map((v) => (
                      <SelectItem key={v.name} value={v.name}>
                        {v.name}
                        <span className="ml-2 text-muted-foreground text-[11px]">({voiceGender(v.gender)} · {voiceTone(v)})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 输出格式 */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('tools.ttsDialog.outputFormat')}</Label>
                <Select value={outputFormat} onValueChange={setOutputFormat}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t('tools.ttsDialog.selectFormat')} />
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
