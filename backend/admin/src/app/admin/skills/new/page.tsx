'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      toast({ title: t('skills.toast.createSuccess') });
      router.push('/admin/skills');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t('skills.toast.saveFailed'),
        description: err.response?.data?.detail || t('skills.toast.unknownError'),
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
          <h2 className="text-3xl font-bold tracking-tight">{t('skills.create.title')}</h2>
          <p className="text-muted-foreground mt-1">{t('skills.create.description')}</p>
        </div>
        <div className="flex gap-3 items-center">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t('skills.action.back')}
          </Button>
          <Button type="submit" form="skill-form" disabled={saving}>
            {saving ? t('skills.action.creating') : <><Save className="mr-2 h-4 w-4" /> {t('skills.action.create')}</>}
          </Button>
        </div>
      </div>

      <form id="skill-form" onSubmit={handleSubmit(handleSave)} className="space-y-6">
        {/* Meta info row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="skill-name">
              {t('skills.form.identifier')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="skill-name"
              placeholder={t('skills.form.identifierPlaceholder')}
              className={`font-mono ${errors.name ? 'border-destructive' : ''}`}
              {...register('name', {
                required: true,
                pattern: /^[a-zA-Z0-9_\-]+$/,
              })}
            />
            <p className="text-xs text-muted-foreground">
              {t('skills.form.identifierHint')}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="skill-description">
              {t('skills.form.description')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="skill-description"
              placeholder={t('skills.form.descriptionPlaceholder')}
              className={errors.description ? 'border-destructive' : ''}
              {...register('description', { required: true })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="skill-version">{t('skills.form.version')}</Label>
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
            {t('skills.form.content')} <span className="text-destructive">*</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            {t('skills.form.contentHint')}
          </p>
          <Textarea
            id="skill-content"
            placeholder={t('skills.form.contentPlaceholder')}
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
            {t('skills.form.autoEnable')}
          </Label>
        </div>
      </form>
    </div>
  );
}
