'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import api from '@/lib/axios';

interface SkillInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  source: string;
  status: 'active' | 'inactive';
}

interface SkillDialogProps {
  open: boolean;
  skill: SkillInfo | null;   // null = create mode
  onClose: (refresh?: boolean) => void;
}

interface FormValues {
  name: string;
  description: string;
  version: string;
  content: string;
  auto_enable: boolean;
}

export default function SkillDialog({ open, skill, onClose }: SkillDialogProps) {
  const isNew = !skill;
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      name: '',
      description: '',
      version: '1.0',
      content: '',
      auto_enable: true,
    },
  });

  const watchedAutoEnable = watch('auto_enable');

  // Load skill detail when editing
  useEffect(() => {
    if (!open) return;

    // Create mode: reset to defaults
    if (!skill) {
      reset({ name: '', description: '', version: '1.0', content: '', auto_enable: true });
      return;
    }

    // Edit mode: fetch full detail
    setLoadingDetail(true);
    api.get(`/admin/skills/${skill.name}`)
      .then((res) => {
        reset({
          name: res.data.name,
          description: res.data.description === 'No description' ? '' : res.data.description,
          version: res.data.version,
          content: res.data.content || '',
          auto_enable: true,
        });
      })
      .catch(() => {
        toast({ variant: 'destructive', title: '加载失败', description: '无法获取技能详情' });
      })
      .finally(() => setLoadingDetail(false));
  }, [open, skill, reset, toast]);

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    try {
      const action = isNew
        ? () => api.post('/admin/skills/', {
            name: values.name,
            description: values.description,
            content: values.content,
            version: values.version,
            auto_enable: values.auto_enable,
          })
        : () => api.put(`/admin/skills/${skill!.name}`, {
            description: values.description,
            content: values.content,
            version: values.version,
          });

      await action();
      toast({ title: isNew ? '技能创建成功' : '技能更新成功' });
      onClose(true);
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
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>{isNew ? '创建技能' : `编辑：${skill?.name}`}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          {loadingDetail ? (
            <div className="flex justify-center items-center h-40 text-muted-foreground">
              加载中...
            </div>
          ) : (
            <form id="skill-form" onSubmit={handleSubmit(handleSave)}>
              <div className="px-6 py-4 space-y-6">

                {/* Basic Info */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">基础信息</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="skill-name">
                        技能标识 <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="skill-name"
                        placeholder="例如：web_search"
                        disabled={!isNew}
                        className={`font-mono ${errors.name ? 'border-destructive' : ''}`}
                        {...register('name', {
                          required: true,
                          pattern: /^[a-zA-Z0-9_\-]+$/,
                        })}
                      />
                      {isNew && (
                        <p className="text-xs text-muted-foreground">
                          仅支持字母、数字、下划线和中划线
                        </p>
                      )}
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
                </section>

                {/* Skill Content */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">技能内容</h3>
                  <p className="text-xs text-muted-foreground">
                    使用 Markdown 编写技能说明。Agent 会根据此内容了解如何使用该技能。
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="skill-content">
                      SKILL.md 正文 <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="skill-content"
                      placeholder={"# 技能名称\n\n描述该技能的用途和使用方式...\n\n## 使用示例\n\n```\n调用示例...\n```"}
                      rows={14}
                      className={`font-mono text-sm resize-y ${errors.content ? 'border-destructive' : ''}`}
                      {...register('content', { required: true })}
                    />
                  </div>
                </section>

                {/* Settings (create only) */}
                {isNew && (
                  <section className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">设置</h3>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={watchedAutoEnable}
                        onCheckedChange={(v) => setValue('auto_enable', v)}
                        id="auto_enable"
                      />
                      <Label htmlFor="auto_enable" className="cursor-pointer">
                        创建后自动启用
                      </Label>
                    </div>
                  </section>
                )}

              </div>
            </form>
          )}
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onClose()}>取消</Button>
          <Button type="submit" form="skill-form" disabled={saving || loadingDetail}>
            {saving ? '保存中...' : isNew ? '创建技能' : '保存更改'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
