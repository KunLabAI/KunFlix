'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { PromptTemplateVariable } from '@/types';
import { usePromptTemplate, useUpdatePromptTemplate } from '@/hooks/usePromptTemplates';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Save, Plus, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface FormValues {
  name: string;
  description: string;
  template_type: string;
  system_prompt_template: string;
  user_prompt_template: string;
  is_active: boolean;
  is_default: boolean;
  variables: PromptTemplateVariable[];
}

const VARIABLE_TYPES = [
  { value: 'string', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔值' },
  { value: 'select', label: '下拉选择' },
];

export default function EditPromptTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params?.id as string;
  const { toast } = useToast();
  const { template, isLoading } = usePromptTemplate(templateId);
  const { updateTemplate } = useUpdatePromptTemplate();
  const [saving, setSaving] = useState(false);
  const [showUserPrompt, setShowUserPrompt] = useState(false);

  const { register, handleSubmit, watch, setValue, control, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      name: '',
      description: '',
      template_type: '',
      system_prompt_template: '',
      user_prompt_template: '',
      is_active: true,
      is_default: false,
      variables: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'variables' });

  const watchedIsActive = watch('is_active');
  const watchedIsDefault = watch('is_default');
  const watchedTemplateType = watch('template_type');

  useEffect(() => {
    template && reset({
      name: template.name || '',
      description: template.description || '',
      template_type: template.template_type || '',
      system_prompt_template: template.system_prompt_template || '',
      user_prompt_template: template.user_prompt_template || '',
      is_active: template.is_active !== false,
      is_default: template.is_default || false,
      variables: template.variables_schema || [],
    });
    template?.user_prompt_template && setShowUserPrompt(true);
  }, [template, reset]);

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    try {
      await updateTemplate(templateId, {
        name: values.name,
        description: values.description || null,
        template_type: values.template_type || 'custom',
        agent_type: 'text',
        system_prompt_template: values.system_prompt_template,
        user_prompt_template: values.user_prompt_template || null,
        is_active: values.is_active,
        is_default: values.is_default,
        variables_schema: values.variables,
        output_schema: {},
      });
      toast({ title: '模板更新成功' });
      router.push('/admin/prompt-templates');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const message = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((e: any) => e.msg).join('; ')
          : '未知错误';
      toast({ variant: 'destructive', title: '更新失败', description: message });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">编辑提示词模板</h2>
          <p className="text-muted-foreground mt-1">编辑模板「{template?.name}」的配置与内容</p>
        </div>
        <div className="flex gap-3 items-center">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> 返回
          </Button>
          <Button type="submit" form="template-form" disabled={saving}>
            {saving ? '保存中...' : <><Save className="mr-2 h-4 w-4" /> 保存</>}
          </Button>
        </div>
      </div>

      <form id="template-form" onSubmit={handleSubmit(handleSave)} className="space-y-6">
        {/* 基础信息 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-name">
              模板名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tpl-name"
              placeholder="例如：故事设定生成"
              className={errors.name ? 'border-destructive' : ''}
              {...register('name', { required: true })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-desc">描述</Label>
            <Input
              id="tpl-desc"
              placeholder="简要描述此模板的用途..."
              {...register('description')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-type">分类标签</Label>
            <Input
              id="tpl-type"
              placeholder="自定义分类，最多12字"
              maxLength={12}
              value={watchedTemplateType}
              onChange={(e) => setValue('template_type', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">支持中英文，最多12个字符</p>
          </div>
        </div>

        {/* 提示词内容 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">提示词内容</h3>
            <p className="text-xs text-muted-foreground">
              使用 <code className="bg-muted px-1 rounded">{'{{ variable_name }}'}</code> 插入变量
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="system_prompt">
              系统提示词 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="system_prompt"
              placeholder="你是一个专业的剧场剧情设计师..."
              className={`font-mono text-sm resize-y min-h-[calc(100vh-680px)] ${errors.system_prompt_template ? 'border-destructive' : ''}`}
              {...register('system_prompt_template', { required: true })}
            />
          </div>

          <div className="space-y-2">
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowUserPrompt((v) => !v)}
            >
              {showUserPrompt ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              用户提示词（可选）
            </button>
            {showUserPrompt && (
              <Textarea
                placeholder={'请根据以下信息生成内容...\n\n剧场名称：{{ theater_name }}'}
                rows={4}
                className="font-mono text-sm resize-y"
                {...register('user_prompt_template')}
              />
            )}
          </div>
        </div>

        {/* 输入变量定义 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">输入变量</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ name: '', label: '', type: 'string', required: true, options: null, default: null, description: null })}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> 添加变量
            </Button>
          </div>

          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg border-dashed">
              暂无变量，点击「添加变量」定义提示词中的占位符
            </p>
          )}

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="p-4 border rounded-lg bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">变量 #{index + 1}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(index)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">变量名（英文）</Label>
                    <Input
                      placeholder="theater_name"
                      className="h-8 text-sm font-mono"
                      {...register(`variables.${index}.name`)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">显示标签</Label>
                    <Input
                      placeholder="剧场名称"
                      className="h-8 text-sm"
                      {...register(`variables.${index}.label`)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">类型</Label>
                    <Select
                      value={watch(`variables.${index}.type`)}
                      onValueChange={(v) => setValue(`variables.${index}.type`, v as any)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VARIABLE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">描述（可选）</Label>
                    <Input
                      placeholder="变量说明..."
                      className="h-8 text-sm"
                      {...register(`variables.${index}.description`)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={watch(`variables.${index}.required`)}
                    onCheckedChange={(v) => setValue(`variables.${index}.required`, v)}
                    id={`required-${index}`}
                  />
                  <Label htmlFor={`required-${index}`} className="text-xs cursor-pointer">必填</Label>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 状态设置 */}
        <div className="flex items-center gap-6 pb-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={watchedIsActive}
              onCheckedChange={(v) => setValue('is_active', v)}
              id="is_active"
            />
            <Label htmlFor="is_active" className="cursor-pointer text-sm">启用模板</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={watchedIsDefault}
              onCheckedChange={(v) => setValue('is_default', v)}
              id="is_default"
            />
            <Label htmlFor="is_default" className="cursor-pointer text-sm">设为该类型默认模板</Label>
          </div>
        </div>
      </form>
    </div>
  );
}
