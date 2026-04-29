'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Sparkles, Zap, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import { useCreateVideoTask } from '@/hooks/useVideoTasks';
import { useModelCapabilities, useVideoFormVisibility } from '@/hooks/useModelCapabilities';
import { LLMProvider } from '@/types';
import { parseProviderModels } from '@/lib/api-utils';

// ---------------------------------------------------------------------------
// 页面组件
// ---------------------------------------------------------------------------
export default function CreateVideoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { providers, isLoading: providersLoading } = useLLMProviders();
  const { createVideoTask } = useCreateVideoTask();

  // 基础状态
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');

  // 视频配置状态
  const [videoMode, setVideoMode] = useState('text_to_video');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [lastFrameImageUrl, setLastFrameImageUrl] = useState('');
  const [duration, setDuration] = useState(6);
  const [quality, setQuality] = useState<string>('720p');
  const [aspectRatio, setAspectRatio] = useState('16:9');

  // MiniMax 特有配置
  const [promptOptimizer, setPromptOptimizer] = useState(true);
  const [fastPretreatment, setFastPretreatment] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // 获取选中的供应商
  const selectedProvider = useMemo(() => {
    return providers?.find((p: LLMProvider) => p.id === providerId);
  }, [providerId, providers]);

  // 获取可用模型
  const availableModels = useMemo(() => {
    return selectedProvider ? parseProviderModels(selectedProvider.models) : [];
  }, [selectedProvider]);

  // 获取模型能力配置
  const { capabilities, isLoading: capabilitiesLoading } = useModelCapabilities(model || null);

  // 根据能力配置计算表单可见性
  const visibility = useVideoFormVisibility(capabilities, videoMode);

  // 当模型切换时，自动修正不兼容的参数
  useEffect(() => {
    if (!capabilities) return;

    // 如果当前模式不支持，切换到第一个支持的模式
    if (!capabilities.modes.includes(videoMode as any)) {
      setVideoMode(capabilities.modes[0]);
    }

    // 如果当前分辨率不支持，切换到第一个支持的分辨率
    if (!capabilities.resolutions.includes(quality)) {
      setQuality(capabilities.resolutions[0]);
    }

    // 如果当前时长不支持，切换到第一个支持的时长
    if (!capabilities.durations.includes(duration)) {
      setDuration(capabilities.durations[0]);
    }

    // 如果当前画面比例不支持，切换到第一个支持的画面比例
    if (!capabilities.aspect_ratios.includes(aspectRatio)) {
      setAspectRatio(capabilities.aspect_ratios[0]);
    }
  }, [capabilities, model]);

  // 当模式切换时，清空图片
  useEffect(() => {
    if (videoMode === 'text_to_video') {
      setImageUrl('');
      setLastFrameImageUrl('');
    }
  }, [videoMode]);

  const canSubmit = !!providerId && !!model && prompt.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await createVideoTask({
        provider_id: providerId,
        model,
        video_mode: videoMode as 'text_to_video' | 'image_to_video' | 'edit',
        prompt: prompt.trim(),
        image_url: visibility.showFirstFrame ? imageUrl || undefined : undefined,
        last_frame_image: visibility.showLastFrame ? lastFrameImageUrl || undefined : undefined,
        config: {
          duration,
          quality: quality as any,
          aspect_ratio: aspectRatio,
          prompt_optimizer: visibility.showPromptOptimizer ? promptOptimizer : undefined,
          fast_pretreatment: visibility.showFastPretreatment ? fastPretreatment : undefined,
        },
      });
      toast({ title: t('videos.toast.submitSuccess'), description: t('videos.toast.submitSuccessDesc') });
      router.push('/admin/videos');
    } catch (e: any) {
      toast({
        title: t('videos.toast.submitFailed'),
        description: e?.response?.data?.detail || e?.message || t('videos.toast.unknownError'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 处理供应商切换
  const handleProviderChange = (v: string) => {
    setProviderId(v);
    setModel('');
    setVideoMode('text_to_video');
  };

  // 处理模型切换
  const handleModelChange = (v: string) => {
    setModel(v);
    // 重置为默认值
    setVideoMode('text_to_video');
    setDuration(6);
    setQuality('720p');
    setImageUrl('');
    setLastFrameImageUrl('');
  };

  if (providersLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('videos.form.title')}</h2>
            <p className="text-muted-foreground">{t('videos.form.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-8">
        {/* Model Configuration */}
        <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold">{t('videos.form.sections.model')}</h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t('videos.form.provider')}</Label>
              <Select value={providerId} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('videos.form.selectProvider')} />
                </SelectTrigger>
                <SelectContent>
                  {providers?.map((p: LLMProvider) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t('videos.form.model')}</Label>
              <Select value={model} onValueChange={handleModelChange} disabled={!providerId}>
                <SelectTrigger>
                  <SelectValue placeholder={providerId ? t('videos.form.selectModel') : t('videos.form.selectProviderFirst')} />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((m: string) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* 模型能力提示 */}
          {capabilities && (
            <div className="rounded-lg bg-primary/5 p-3 text-sm text-muted-foreground">
              <Sparkles className="mr-2 inline h-4 w-4 text-primary" />
              {t('videos.form.supportModes', {
                modes: capabilities.modes
                  .map((m: string) => t(`videos.modeLong.${m}`, { defaultValue: m }))
                  .join('、'),
              })}
              {capabilities.supports_last_frame && t('videos.form.supportLastFrame')}
            </div>
          )}
        </section>

        {/* Video Settings */}
        <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold">{t('videos.form.sections.video')}</h3>
          
          {/* 生成模式 - 仅当支持多个模式时显示 */}
          {visibility.showModeSelect && (
            <div className="grid gap-2">
              <Label>{t('videos.form.mode')}</Label>
              <Select value={videoMode} onValueChange={setVideoMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {capabilities?.modes.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(`videos.modeLong.${mode}`, { defaultValue: mode })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 单模式提示 */}
          {!visibility.showModeSelect && capabilities && (
            <Alert variant="default" className="bg-muted">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {t('videos.form.singleModeHint', {
                  mode: t(`videos.modeLong.${capabilities.modes[0]}`, { defaultValue: capabilities.modes[0] }),
                })}
              </AlertDescription>
            </Alert>
          )}

          {/* 提示词 */}
          <div className="grid gap-2">
            <Label>{t('videos.form.prompt')}</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('videos.form.promptPlaceholder')}
              className="min-h-[120px] resize-none"
              maxLength={2000}
            />
            <div className="flex justify-end">
               <span className="text-xs text-muted-foreground">{prompt.length}/2000</span>
            </div>
          </div>

          {/* 首帧图片 */}
          {visibility.showFirstFrame && (
            <div className="grid gap-2">
              <Label>{t('videos.form.firstFrame')} <span className="text-destructive">*</span></Label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder={t('videos.form.firstFramePlaceholder')}
                required
              />
              <p className="text-xs text-muted-foreground">{t('videos.form.firstFrameHint')}</p>
            </div>
          )}

          {/* 尾帧图片 */}
          {visibility.showLastFrame && (
            <div className="grid gap-2">
              <Label>{t('videos.form.lastFrame')}</Label>
              <Input
                value={lastFrameImageUrl}
                onChange={(e) => setLastFrameImageUrl(e.target.value)}
                placeholder={t('videos.form.lastFramePlaceholder')}
              />
              <p className="text-xs text-muted-foreground">{t('videos.form.lastFrameHint')}</p>
            </div>
          )}

          {/* 时长设置 */}
          <div className="grid gap-6 pt-2">
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <Label>{t('videos.form.duration')}</Label>
                <span className="text-sm font-medium">{t('videos.form.durationValue', { value: duration })}</span>
              </div>
              {visibility.showDurationSlider ? (
                <Slider
                  value={[duration]}
                  onValueChange={(v) => setDuration(v[0])}
                  min={Math.min(...visibility.durationOptions)}
                  max={Math.max(...visibility.durationOptions)}
                  step={1}
                  className="py-2"
                />
              ) : (
                <div className="flex gap-2">
                  {visibility.durationOptions.map(d => (
                    <Button
                      key={d}
                      variant={duration === d ? "default" : "outline"}
                      onClick={() => setDuration(d)}
                      className="flex-1"
                    >
                      {t('videos.form.durationValue', { value: d })}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* 画质 */}
              <div className="grid gap-2">
                <Label>{t('videos.form.quality')}</Label>
                <Select value={quality} onValueChange={setQuality}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {visibility.resolutionOptions.map((res) => (
                      <SelectItem key={res} value={res}>
                        {t(`tools.resolutions.${res}`, { defaultValue: res })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* 画面比例 */}
              <div className="grid gap-2">
                <Label>{t('videos.form.aspectRatio')}</Label>
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(visibility.aspectRatioOptions || ['16:9', '9:16', '1:1']).map((ratio) => (
                      <SelectItem key={ratio} value={ratio}>
                        {t(`tools.aspectRatios.${ratio}`, { defaultValue: ratio })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </section>

        {/* 高级设置 */}
        {(visibility.showPromptOptimizer || visibility.showFastPretreatment) && (
          <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
            <h3 className="text-lg font-semibold">{t('videos.form.sections.advanced')}</h3>
            
            <div className="grid gap-4">
              {visibility.showPromptOptimizer && (
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      {t('videos.form.promptOptimizer')}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t('videos.form.promptOptimizerDesc')}</p>
                  </div>
                  <Switch
                    checked={promptOptimizer}
                    onCheckedChange={setPromptOptimizer}
                  />
                </div>
              )}
              
              {visibility.showFastPretreatment && (
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      {t('videos.form.fastPretreatment')}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t('videos.form.fastPretreatmentDesc')}</p>
                  </div>
                  <Switch
                    checked={fastPretreatment}
                    onCheckedChange={setFastPretreatment}
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <Button variant="outline" onClick={() => router.back()}>{t('videos.form.cancel')}</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} size="lg" className="min-w-[120px]">
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('videos.form.submitting')}
              </>
            ) : (
              t('videos.form.submit')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
