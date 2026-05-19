'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/axios';
import { useToast } from '@/components/ui/use-toast';
import {
  EmailProvider,
  EmailProviderFormState,
  DEFAULT_FORM,
  PROVIDER_TYPES,
} from '../types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: EmailProvider | null;
  onSaved: () => void;
}

const fromProvider = (p: EmailProvider): EmailProviderFormState => ({
  name: p.name,
  provider_type: p.provider_type,
  api_key: p.api_key || '',
  api_base_url: p.api_base_url || '',
  from_email: p.from_email,
  from_name: p.from_name || '',
  reply_to: p.reply_to || '',
  is_default: !!p.is_default,
  is_active: !!p.is_active,
});

const buildPayload = (form: EmailProviderFormState, isEdit: boolean): Record<string, unknown> => {
  const base: Record<string, unknown> = {
    name: form.name,
    provider_type: form.provider_type,
    api_base_url: form.api_base_url || null,
    from_email: form.from_email,
    from_name: form.from_name || null,
    reply_to: form.reply_to || null,
    is_default: form.is_default,
    is_active: form.is_active,
  };
  // 仅在创建时强制带 api_key；编辑时只在用户输入新值时附带，避免覆盖
  (!isEdit || form.api_key) && (base.api_key = form.api_key);
  return base;
};

export function ProviderFormDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isEdit = !!initial;
  const [form, setForm] = useState<EmailProviderFormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // 打开时根据 initial 初始化表单；重新打开默认隐藏 api_key。
  React.useEffect(() => {
    open && (setForm(initial ? fromProvider(initial) : DEFAULT_FORM), setShowApiKey(false));
  }, [open, initial]);

  const update = <K extends keyof EmailProviderFormState>(key: K, value: EmailProviderFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = buildPayload(form, isEdit);
      isEdit
        ? await api.patch(`/admin/email-providers/${initial!.id}`, payload)
        : await api.post('/admin/email-providers', payload);
      toast({ title: t('systemEmail.toast.saveSuccess') });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t('systemEmail.toast.saveFailed'),
        description: err?.response?.data?.detail || String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t(isEdit ? 'systemEmail.form.editTitle' : 'systemEmail.form.createTitle')}</DialogTitle>
          <DialogDescription>{t('systemEmail.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid gap-2">
            <Label htmlFor="ep-name">{t('systemEmail.form.name')}</Label>
            <Input id="ep-name" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder={t('systemEmail.form.namePlaceholder')} />
          </div>

          <div className="grid gap-2">
            <Label>{t('systemEmail.form.providerType')}</Label>
            <Select value={form.provider_type} onValueChange={(v) => update('provider_type', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_TYPES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ep-key">{t('systemEmail.form.apiKey')}</Label>
            <div className="relative">
              <Input
                id="ep-key"
                type={showApiKey ? 'text' : 'password'}
                value={form.api_key}
                onChange={(e) => update('api_key', e.target.value)}
                placeholder="re_xxxxxxxxxxxx"
                autoComplete="off"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showApiKey ? t('systemEmail.form.hideApiKey') : t('systemEmail.form.showApiKey')}
                title={showApiKey ? t('systemEmail.form.hideApiKey') : t('systemEmail.form.showApiKey')}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ep-base">{t('systemEmail.form.apiBaseUrl')}</Label>
            <Input id="ep-base" value={form.api_base_url} onChange={(e) => update('api_base_url', e.target.value)} placeholder="https://api.resend.com" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="ep-from-email">{t('systemEmail.form.fromEmail')}</Label>
              <Input id="ep-from-email" value={form.from_email} onChange={(e) => update('from_email', e.target.value)} placeholder="noreply@yourdomain.com" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ep-from-name">{t('systemEmail.form.fromName')}</Label>
              <Input id="ep-from-name" value={form.from_name} onChange={(e) => update('from_name', e.target.value)} placeholder="KunFlix" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ep-reply">{t('systemEmail.form.replyTo')}</Label>
            <Input id="ep-reply" value={form.reply_to} onChange={(e) => update('reply_to', e.target.value)} placeholder="support@yourdomain.com" />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="ep-default" className="cursor-pointer">{t('systemEmail.form.isDefault')}</Label>
            <Switch id="ep-default" checked={!!form.is_default} onCheckedChange={(v) => update('is_default', v)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="ep-enabled" className="cursor-pointer">{t('systemEmail.form.isEnabled')}</Label>
            <Switch id="ep-enabled" checked={!!form.is_active} onCheckedChange={(v) => update('is_active', v)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('systemEmail.form.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !form.name || !form.from_email || (!isEdit && !form.api_key)}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('systemEmail.form.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
