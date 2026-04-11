'use client';

import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { PromptTemplate, PromptTemplateVariable } from '@/types';
import { useCreatePromptTemplate, useUpdatePromptTemplate } from '@/hooks/usePromptTemplates';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface PromptTemplateDialogProps {
  open: boolean;
  template: PromptTemplate | null;
  onClose: (refresh?: boolean) => void;
}

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

// 预设分类选项
const PRESET_CATEGORIES = [
  { value: 'story_basic', label: '故事基础设定' },
  { value: 'character', label: '角色设定' },
  { value: 'scene', label: '场景描述' },
  { value: 'storyboard', label: '分镜脚本' },
];

const VARIABLE_TYPES = [
  { value: 'string', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔值' },
  { value: 'select', label: '下拉选择' },
];

export default function PromptTemplateDialog({
  open,
  template,
  onClose,
}: PromptTemplateDialogProps) {
  const isNew = !template;
  const { toast } = useToast();
  const { createTemplate } = useCreatePromptTemplate();
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

  const { fields, append, remove, swap } = useFieldArray({ control, name: 'variables' });

  const watchedTemplateType = watch('template_type');
  const watchedIsActive = watch('is_active');
  const watchedIsDefault = watch('is_default');

  useEffect(() => {
    if (template) {
      reset({
        name: template.name || '',
        description: template.description || '',
        template_type: template.template_type || '',
        system_prompt_template: template.system_prompt_template || '',
        user_prompt_template: template.user_prompt_template || '',
        is_active: template.is_active !== false,
        is_default: template.is_default || false,
        variables: template.variables_schema || [],
      });
      setShowUserPrompt(!!template.user_prompt_template);
    } else {
      reset({
        name: '',
        description: '',
        template_type: '',
        system_prompt_template: '',
        user_prompt_template: '',
        is_active: true,
        is_default: false,
        variables: [],
      });
      setShowUserPrompt(false);
    }
  }, [template, reset]);

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    try {
      const payload: Partial<PromptTemplate> = {
        name: values.name,
        description: values.description || null,
        template_type: values.template_type || undefined,
        agent_type: 'text', // 保持向后兼容，但不再使用
        system_prompt_template: values.system_prompt_template,
        user_prompt_template: values.user_prompt_template || null,
        is_active: values.is_active,
        is_default: values.is_default,
        variables_schema: values.variables,
        output_schema: {},
      };

      if (isNew) {
        await createTemplate(payload);
        toast({ title: '模板创建成功' });
      } else {
        await updateTemplate(template.id!, payload);
        toast({ title: '模板更新成功' });
      }
      onClose(true);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const message = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((e: any) => e.msg).join('; ')
          : '未知错误';
      toast({
        variant: 'destructive',
        title: '保存失败',
        description: message,
      });
    } finally {
      setSaving(false);
    }
  };

  const addVariable = () => {
    append({
      name: '',
      label: '',
      type: 'string',
      required: true,
      options: null,
      default: null,
      description: null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>{isNew ? '创建提示词模板' : `编辑：${template?.name}`}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <form id="template-form" onSubmit={handleSubmit(handleSave)}>
            <div className="px-6 py-4 space-y-6">

              {/* 基础信息 */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">基础信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">模板名称 <span className="text-destructive">*</span></Label>
                    <Input
                      id="name"
                      placeholder="例如：故事设定生成"
                      {...register('name', { required: true })}
                      className={errors.name ? 'border-destructive' : ''}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="template_type">分类标签（可选，最多8字）</Label>
                    <div className="flex gap-2">
                      <Select
                        value={watchedTemplateType || '__none__'}
                        onValueChange={(v) => setValue('template_type', v === '__none__' ? '' : v)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="选择或输入分类" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">无分类</SelectItem>
                          {PRESET_CATEGORIES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      placeholder="自定义分类（最多8个字符）"
                      maxLength={8}
                      className="mt-2"
                      value={watchedTemplateType}
                      onChange={(e) => setValue('template_type', e.target.value.slice(0, 8))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">描述</Label>
                  <Input
                    id="description"
                    placeholder="简要描述此模板的用途..."
                    {...register('description')}
                  />
                </div>
              </section>

              {/* 提示词内容 */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">提示词内容</h3>
                <p className="text-xs text-muted-foreground">
                  使用 <code className="bg-muted px-1 rounded">{'{{ variable_name }}'}</code> 插入变量，变量在下方「输入变量」区域定义
                </p>
                <div className="space-y-2">
                  <Label htmlFor="system_prompt_template">
                    系统提示词 <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="system_prompt_template"
                    placeholder="你是一个专业的剧场剧情设计师..."
                    rows={8}
                    className={`font-mono text-sm resize-y ${errors.system_prompt_template ? 'border-destructive' : ''}`}
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
                      placeholder="请根据以下信息生成内容...\n\n剧场名称：{{ theater_name }}"
                      rows={4}
                      className="font-mono text-sm resize-y"
                      {...register('user_prompt_template')}
                    />
                  )}
                </div>
              </section>

              {/* 输入变量定义 */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">输入变量</h3>
                  <Button type="button" variant="outline" size="sm" onClick={addVariable}>
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
              </section>

              {/* 状态设置 */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">状态设置</h3>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={watchedIsActive}
                      onCheckedChange={(v) => setValue('is_active', v)}
                      id="is_active"
                    />
                    <Label htmlFor="is_active" className="cursor-pointer">启用模板</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={watchedIsDefault}
                      onCheckedChange={(v) => setValue('is_default', v)}
                      id="is_default"
                    />
                    <Label htmlFor="is_default" className="cursor-pointer">设为该类型默认模板</Label>
                  </div>
                </div>
              </section>
            </div>
          </form>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onClose()}>取消</Button>
          <Button type="submit" form="template-form" disabled={saving}>
            {saving ? '保存中...' : isNew ? '创建模板' : '保存更改'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
