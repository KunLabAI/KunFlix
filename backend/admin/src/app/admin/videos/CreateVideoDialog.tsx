'use client';

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/components/ui/use-toast';
import { useAgents } from '@/hooks/useAgents';
import { useCreateVideoTask } from '@/hooks/useVideoTasks';
import { Agent } from '@/types';

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

interface CreateVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export default function CreateVideoDialog({ open, onOpenChange, onCreated }: CreateVideoDialogProps) {
  const { toast } = useToast();
  const { agents } = useAgents(undefined, 1, 100);
  const { createVideoTask } = useCreateVideoTask();

  const [agentId, setAgentId] = useState('');
  const [videoMode, setVideoMode] = useState('text_to_video');
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [duration, setDuration] = useState(5);
  const [quality, setQuality] = useState<'480p' | '720p'>('720p');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [submitting, setSubmitting] = useState(false);

  const videoAgents = useMemo(
    () => (agents ?? []).filter((a: Agent) => a.agent_type === 'video'),
    [agents],
  );

  const showImageField = VIDEO_MODE_NEEDS_IMAGE[videoMode] ?? false;

  const canSubmit = agentId && prompt.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await createVideoTask({
        agent_id: agentId,
        video_mode: videoMode as 'text_to_video' | 'image_to_video' | 'edit',
        prompt: prompt.trim(),
        image_url: showImageField ? imageUrl || undefined : undefined,
        config: { duration, quality, aspect_ratio: aspectRatio },
      });
      toast({ title: '视频任务已提交', description: '任务已进入队列，请等待生成完成' });
      // 重置表单
      setPrompt('');
      setImageUrl('');
      setDuration(5);
      setQuality('720p');
      setAspectRatio('16:9');
      setVideoMode('text_to_video');
      onOpenChange(false);
      onCreated();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>新建视频任务</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Agent 选择 */}
          <div className="grid gap-2">
            <Label>视频 Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="选择视频 Agent" />
              </SelectTrigger>
              <SelectContent>
                {videoAgents.map((a: Agent) => (
                  <SelectItem key={a.id} value={a.id!}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 视频模式 */}
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

          {/* 提示词 */}
          <div className="grid gap-2">
            <Label>提示词</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述你想生成的视频内容..."
              className="min-h-[80px]"
              maxLength={2000}
            />
          </div>

          {/* 图片 URL（条件展示） */}
          {showImageField && (
            <div className="grid gap-2">
              <Label>图片 URL</Label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="输入图片 URL 或 base64 data URL"
              />
            </div>
          )}

          {/* 时长 */}
          <div className="grid gap-2">
            <Label>时长：{duration} 秒</Label>
            <Slider
              value={[duration]}
              onValueChange={(v) => setDuration(v[0])}
              min={1}
              max={15}
              step={1}
            />
          </div>

          {/* 画质与比例 */}
          <div className="grid grid-cols-2 gap-4">
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? '提交中...' : '提交任务'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
