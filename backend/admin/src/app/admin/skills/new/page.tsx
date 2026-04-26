'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Save } from 'lucide-react';
import api from '@/lib/axios';

interface FormValues {
  name: string;
  description: string;
  version: string;
  content: string;
  auto_enable: boolean;
}

export default function CreateSkillPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      name: '',
      description: '',
      version: '1.0',
      content: '',
      auto_enable: true,
    },
  });

  const watchedAutoEnable = watch('auto_enable');

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    try {
      await api.post('/admin/skills', {
        name: values.name,
        description: values.description,
        content: values.content,
        version: values.version,
        auto_enable: values.auto_enable,
      });
      toast({ title: '技能创建成功' });
      router.push('/admin/skills');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '保存失败',
        description: err.response?.data?.detail || '未知错误',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">创建技能</h2>
          <p className="text-muted-foreground mt-1">使用 Markdown 定义一个新的 Agent 技能包</p>
        </div>
        <div className="flex gap-3 items-center">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> 返回
          </Button>
          <Button type="submit" form="skill-form" disabled={saving}>
            {saving ? '创建中...' : <><Save className="mr-2 h-4 w-4" /> 创建技能</>}
          </Button>
        </div>
      </div>

      <form id="skill-form" onSubmit={handleSubmit(handleSave)} className="space-y-6">
        {/* Meta info row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="skill-name">
              技能标识 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="skill-name"
              placeholder="例如：web_search"
              className={`font-mono ${errors.name ? 'border-destructive' : ''}`}
              {...register('name', {
                required: true,
                pattern: /^[a-zA-Z0-9_\-]+$/,
              })}
            />
            <p className="text-xs text-muted-foreground">
              仅支持字母、数字、下划线和中划线
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="skill-description">
              描述 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="skill-description"
              placeholder="简要描述此技能的功能..."
              className={errors.description ? 'border-destructive' : ''}
              {...register('description', { required: true })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="skill-version">版本</Label>
            <Input
              id="skill-version"
              placeholder="1.0"
              {...register('version')}
            />
          </div>
        </div>

        {/* Main content area */}
        <div className="space-y-2">
          <Label htmlFor="skill-content">
            SKILL.md 正文 <span className="text-destructive">*</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            使用 Markdown 编写技能说明。Agent 会根据此内容了解如何使用该技能。
          </p>
          <Textarea
            id="skill-content"
            placeholder={"# 技能名称\n\n描述该技能的用途和使用方式...\n\n## 使用示例\n\n```\n调用示例...\n```"}
            className={`font-mono text-sm resize-y min-h-[calc(100vh-420px)] ${errors.content ? 'border-destructive' : ''}`}
            {...register('content', { required: true })}
          />
        </div>

        {/* Settings */}
        <div className="flex items-center gap-2 pb-4">
          <Switch
            checked={watchedAutoEnable}
            onCheckedChange={(v) => setValue('auto_enable', v)}
            id="auto_enable"
          />
          <Label htmlFor="auto_enable" className="cursor-pointer text-sm">
            创建后自动启用
          </Label>
        </div>
      </form>
    </div>
  );
}
