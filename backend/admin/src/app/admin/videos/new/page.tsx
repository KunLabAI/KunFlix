'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/components/ui/use-toast';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import { useCreateVideoTask } from '@/hooks/useVideoTasks';
import { LLMProvider } from '@/types';
import { parseProviderModels } from '@/lib/api-utils';

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

const QUALITY_OPTIONS = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
] as const;

const ASPECT_OPTIONS = [
  { value: '16:9', label: '16:9 (横屏)' },
  { value: '9:16', label: '9:16 (竖屏)' },
  { value: '1:1', label: '1:1 (方形)' },
] as const;

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
  const [duration, setDuration] = useState(5);
  const [quality, setQuality] = useState<'480p' | '720p'>('720p');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [submitting, setSubmitting] = useState(false);

  // Get available models for selected provider
  const availableModels = useMemo(() => {
    if (!providerId || !providers) return [];
    const provider = providers.find((p: LLMProvider) => p.id === providerId);
    return provider ? parseProviderModels(provider.models) : [];
  }, [providerId, providers]);

  const showImageField = VIDEO_MODE_NEEDS_IMAGE[videoMode] ?? false;

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
        config: { duration, quality, aspect_ratio: aspectRatio },
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
              <Select value={providerId} onValueChange={(v) => { setProviderId(v); setModel(''); }}>
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

          {showImageField && (
            <div className="grid gap-2">
              <Label>参考图片 URL</Label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="输入图片 URL 或 base64 data URL"
              />
            </div>
          )}

          <div className="grid gap-6 pt-2">
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <Label>时长</Label>
                  <span className="text-sm font-medium">{duration} 秒</span>
                </div>
                <Slider
                  value={[duration]}
                  onValueChange={(v) => setDuration(v[0])}
                  min={1}
                  max={15}
                  step={1}
                  className="py-2"
                />
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>画质</Label>
                  <Select value={quality} onValueChange={(v) => setQuality(v as '480p' | '720p')}>
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
