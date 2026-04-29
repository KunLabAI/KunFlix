'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import api from '@/lib/axios';

interface FormValues {
  name: string;
  description: string;
  version: string;
  content: string;
}

export default function EditSkillPage() {
  const router = useRouter();
  const params = useParams();
  const skillName = params?.name as string;
  const { toast } = useToast();
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      name: '',
      description: '',
      version: '1.0',
      content: '',
    },
  });

  useEffect(() => {
    setLoading(true);
    api.get(`/admin/skills/${skillName}`)
      .then((res) => {
        reset({
          name: res.data.name,
          description: res.data.description === 'No description' ? '' : res.data.description,
          version: res.data.version,
          content: res.data.content || '',
        });
      })
      .catch(() => {
        toast({
          variant: 'destructive',
          title: t('skills.toast.loadFailed'),
          description: t('skills.toast.loadDetailFailed'),
        });
      })
      .finally(() => setLoading(false));
  }, [skillName, reset, toast, t]);

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    try {
      await api.put(`/admin/skills/${skillName}`, {
        description: values.description,
        content: values.content,
        version: values.version,
      });
      toast({ title: t('skills.toast.updateSuccess') });
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

  if (loading) {
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
          <h2 className="text-3xl font-bold tracking-tight">{t('skills.edit.title')}</h2>
          <p className="text-muted-foreground mt-1">{t('skills.edit.description', { name: skillName })}</p>
        </div>
        <div className="flex gap-3 items-center">
          <span className="text-xs text-muted-foreground mr-2">{skillName}</span>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t('skills.action.back')}
          </Button>
          <Button type="submit" form="skill-form" disabled={saving}>
            {saving ? t('skills.action.saving') : <><Save className="mr-2 h-4 w-4" /> {t('skills.action.save')}</>}
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
              disabled
              className={`font-mono ${errors.name ? 'border-destructive' : ''}`}
              {...register('name', {
                required: true,
                pattern: /^[a-zA-Z0-9_\-]+$/,
              })}
            />
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
      </form>
    </div>
  );
}
