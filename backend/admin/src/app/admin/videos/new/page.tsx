'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import { useCreateVideoTask } from '@/hooks/useVideoTasks';
import { LLMProvider } from '@/types';
import { parseProviderModels } from '@/lib/api-utils';

// ---------------------------------------------------------------------------
// 配置映射表
// ---------------------------------------------------------------------------
const VIDEO_MODE_OPTIONS = [
  { value: 'text_to_video', label: '文字生成视频', needsImage: false },
  { value: 'image_to_video', label: '图片生成视频', needsImage: true },
  { value: 'edit', label: '视频编辑', needsImage: true },
] as const;

const VIDEO_MODE_NEEDS_IMAGE: Record<string, boolean> = {
  text_to_video: false,
  image_to_video: true,
  edit: true,
};

// 通用画质选项
const QUALITY_OPTIONS = [
  { value: '480p', label: '480p (流畅)' },
  { value: '512p', label: '512p' },
  { value: '720p', label: '720p (高清)' },
  { value: '768p', label: '768p' },
  { value: '1080p', label: '1080p (全高清)' },
] as const;

const ASPECT_OPTIONS = [
  { value: '16:9', label: '16:9 (横屏)' },
  { value: '9:16', label: '9:16 (竖屏)' },
  { value: '1:1', label: '1:1 (方形)' },
] as const;

// MiniMax 支持首尾帧的模型
const MINIMAX_FIRST_LAST_FRAME_MODELS = ['MiniMax-Hailuo-02'];

// MiniMax 模型特征
const MINIMAX_MODEL_PATTERNS = ['hailuo', 'minimax', 't2v-01', 'i2v-01', 's2v-01'];

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------
function isMiniMaxProvider(provider: LLMProvider | undefined): boolean {
  const providerType = provider?.provider_type?.toLowerCase() || '';
  return providerType === 'minimax';
}

function isMiniMaxModel(model: string): boolean {
  const modelLower = model.toLowerCase();
  return MINIMAX_MODEL_PATTERNS.some(p => modelLower.includes(p));
}

function supportsFirstLastFrame(model: string): boolean {
  return MINIMAX_FIRST_LAST_FRAME_MODELS.some(m => model.startsWith(m));
}

// ---------------------------------------------------------------------------
// 页面组件
// ---------------------------------------------------------------------------
export default function CreateVideoPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { providers, isLoading: providersLoading } = useLLMProviders();
  const { createVideoTask } = useCreateVideoTask();

  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  
  const [videoMode, setVideoMode] = useState('text_to_video');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [lastFrameImageUrl, setLastFrameImageUrl] = useState('');
  const [duration, setDuration] = useState(6);
  const [quality, setQuality] = useState<'480p' | '512p' | '720p' | '768p' | '1080p'>('720p');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  
  // MiniMax 特有配置
  const [promptOptimizer, setPromptOptimizer] = useState(true);
  const [fastPretreatment, setFastPretreatment] = useState(false);
  
  const [submitting, setSubmitting] = useState(false);

  // Get selected provider
  const selectedProvider = useMemo(() => {
    return providers?.find((p: LLMProvider) => p.id === providerId);
  }, [providerId, providers]);

  // Get available models for selected provider
  const availableModels = useMemo(() => {
    return selectedProvider ? parseProviderModels(selectedProvider.models) : [];
  }, [selectedProvider]);

  // Detect if using MiniMax
  const isMiniMax = useMemo(() => {
    return isMiniMaxProvider(selectedProvider) || isMiniMaxModel(model);
  }, [selectedProvider, model]);

  // Check if model supports first+last frame
  const canUseFirstLastFrame = useMemo(() => {
    return isMiniMax && supportsFirstLastFrame(model);
  }, [isMiniMax, model]);

  const showImageField = VIDEO_MODE_NEEDS_IMAGE[videoMode] ?? false;

  // Duration constraints based on provider
  const durationConfig = useMemo(() => {
    (isMiniMax) && null;  // MiniMax: 6 or 10 only
    return isMiniMax 
      ? { min: 6, max: 10, step: 4, options: [6, 10] }  // MiniMax only supports 6 or 10
      : { min: 1, max: 15, step: 1, options: null };    // xAI: 1-15
  }, [isMiniMax]);

  const canSubmit = !!providerId && !!model && prompt.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await createVideoTask({
        provider_id: providerId,
        model,
        video_mode: videoMode as 'text_to_video' | 'image_to_video' | 'edit',
        prompt: prompt.trim(),
        image_url: showImageField ? imageUrl || undefined : undefined,
        last_frame_image: canUseFirstLastFrame && lastFrameImageUrl ? lastFrameImageUrl : undefined,
        config: { 
          duration: isMiniMax ? (duration <= 6 ? 6 : 10) : duration, 
          quality, 
          aspect_ratio: aspectRatio,
          prompt_optimizer: isMiniMax ? promptOptimizer : undefined,
          fast_pretreatment: isMiniMax ? fastPretreatment : undefined,
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

  // Reset duration when provider changes
  const handleProviderChange = (v: string) => {
    setProviderId(v);
    setModel('');
    setDuration(6);  // Reset to default
  };

  (providersLoading) && (
    <div className="flex h-[50vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

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
              <Select value={model} onValueChange={setModel} disabled={!providerId}>
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
          
          {/* Provider type hint */}
          {isMiniMax && (
            <div className="rounded-lg bg-primary/5 p-3 text-sm text-muted-foreground">
              <Sparkles className="mr-2 inline h-4 w-4 text-primary" />
              MiniMax 视频模型：时长支持 6秒 或 10秒，分辨率支持 512P/720P/768P/1080P
            </div>
          )}
        </section>

        {/* Video Settings */}
        <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold">视频设置</h3>
          
          <div className="grid gap-2">
            <Label>生成模式</Label>
            <Select value={videoMode} onValueChange={setVideoMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIDEO_MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
          {showImageField && (
            <div className="grid gap-2">
              <Label>首帧图片 URL</Label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="输入图片 URL 或 base64 data URL"
              />
              <p className="text-xs text-muted-foreground">视频将从这张图片开始生成</p>
            </div>
          )}

          {/* 尾帧图片 (MiniMax-Hailuo-02 支持) */}
          {canUseFirstLastFrame && showImageField && (
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
                <span className="text-sm font-medium">
                  {isMiniMax 
                    ? (duration <= 6 ? '6 秒' : '10 秒')
                    : `${duration} 秒`
                  }
                </span>
              </div>
              {isMiniMax ? (
                <div className="flex gap-2">
                  {[6, 10].map(d => (
                    <Button
                      key={d}
                      variant={(duration <= 6 ? 6 : 10) === d ? "default" : "outline"}
                      onClick={() => setDuration(d)}
                      className="flex-1"
                    >
                      {d} 秒
                    </Button>
                  ))}
                </div>
              ) : (
                <Slider
                  value={[duration]}
                  onValueChange={(v) => setDuration(v[0])}
                  min={1}
                  max={15}
                  step={1}
                  className="py-2"
                />
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>画质</Label>
                <Select value={quality} onValueChange={(v) => setQuality(v as typeof quality)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUALITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>画面比例</Label>
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASPECT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </section>

        {/* MiniMax 高级设置 */}
        {isMiniMax && (
          <section className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
            <h3 className="text-lg font-semibold">高级设置</h3>
            
            <div className="grid gap-4">
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
