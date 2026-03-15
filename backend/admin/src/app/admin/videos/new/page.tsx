'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { VIDEO_MODE_LABELS, RESOLUTION_LABELS, ASPECT_RATIO_LABELS } from '@/types/video';

// ---------------------------------------------------------------------------
// 页面组件
// ---------------------------------------------------------------------------
export default function CreateVideoPage() {
  const router = useRouter();
  const { toast } = useToast();
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
      toast({ title: '视频任务已提交', description: '任务已进入队列，请等待生成完成' });
      router.push('/admin/videos');
    } catch (e: any) {
      toast({
        title: '提交失败',
        description: e?.response?.data?.detail || e?.message || '未知错误',
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
            <h2 className="text-2xl font-bold tracking-tight">新建视频任务</h2>
            <p className="text-muted-foreground">配置参数并生成新的视频内容</p>
          </div>
        </div>
      </div>

      <div className="grid gap-8">
        {/* Model Configuration */}
        <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold">模型配置</h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>供应商</Label>
              <Select value={providerId} onValueChange={handleProviderChange}>
                <SelectTrigger>
                  <SelectValue placeholder="选择供应商" />
                </SelectTrigger>
                <SelectContent>
                  {providers?.map((p: LLMProvider) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>模型</Label>
              <Select value={model} onValueChange={handleModelChange} disabled={!providerId}>
                <SelectTrigger>
                  <SelectValue placeholder={providerId ? "选择模型" : "先选择供应商"} />
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
              支持模式: {capabilities.modes.map(m => VIDEO_MODE_LABELS[m]).join('、')}
              {capabilities.supports_last_frame && '、首尾帧生成'}
            </div>
          )}
        </section>

        {/* Video Settings */}
        <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold">视频设置</h3>
          
          {/* 生成模式 - 仅当支持多个模式时显示 */}
          {visibility.showModeSelect && (
            <div className="grid gap-2">
              <Label>生成模式</Label>
              <Select value={videoMode} onValueChange={setVideoMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {capabilities?.modes.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {VIDEO_MODE_LABELS[mode]}
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
                此模型仅支持{VIDEO_MODE_LABELS[capabilities.modes[0]]}模式
              </AlertDescription>
            </Alert>
          )}

          {/* 提示词 */}
          <div className="grid gap-2">
            <Label>提示词</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你想生成的视频内容..."
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
              <Label>首帧图片 URL <span className="text-destructive">*</span></Label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="输入图片 URL 或 base64 data URL"
                required
              />
              <p className="text-xs text-muted-foreground">此模型需要提供首帧图片才能生成视频</p>
            </div>
          )}

          {/* 尾帧图片 */}
          {visibility.showLastFrame && (
            <div className="grid gap-2">
              <Label>尾帧图片 URL (可选)</Label>
              <Input
                value={lastFrameImageUrl}
                onChange={(e) => setLastFrameImageUrl(e.target.value)}
                placeholder="输入尾帧图片 URL"
              />
              <p className="text-xs text-muted-foreground">视频将以这张图片结束，实现首尾帧过渡效果</p>
            </div>
          )}

          {/* 时长设置 */}
          <div className="grid gap-6 pt-2">
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <Label>时长</Label>
                <span className="text-sm font-medium">{duration} 秒</span>
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
                      {d} 秒
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* 画质 */}
              <div className="grid gap-2">
                <Label>画质</Label>
                <Select value={quality} onValueChange={setQuality}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {visibility.resolutionOptions.map((res) => (
                      <SelectItem key={res} value={res}>
                        {RESOLUTION_LABELS[res] || res}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* 画面比例 */}
              <div className="grid gap-2">
                <Label>画面比例</Label>
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(visibility.aspectRatioOptions || ['16:9', '9:16', '1:1']).map((ratio) => (
                      <SelectItem key={ratio} value={ratio}>
                        {ASPECT_RATIO_LABELS[ratio] || ratio}
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
            <h3 className="text-lg font-semibold">高级设置</h3>
            
            <div className="grid gap-4">
              {visibility.showPromptOptimizer && (
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      提示词优化
                    </Label>
                    <p className="text-xs text-muted-foreground">自动优化提示词以获得更好的生成效果</p>
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
                      快速预处理
                    </Label>
                    <p className="text-xs text-muted-foreground">减少优化时间，加快生成速度</p>
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
          <Button variant="outline" onClick={() => router.back()}>取消</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} size="lg" className="min-w-[120px]">
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              '提交任务'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
