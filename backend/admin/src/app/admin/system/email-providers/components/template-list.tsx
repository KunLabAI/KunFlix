'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import api from '@/lib/axios';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Pencil } from 'lucide-react';
import { EmailTemplate } from '../types';

const LIST_KEY = '/admin/email-templates';
const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface FormState {
  name: string;
  subject: string;
  html_body: string;
  text_body: string;
}

const fromTemplate = (tpl: EmailTemplate): FormState => ({
  name: tpl.name,
  subject: tpl.subject,
  html_body: tpl.html_body,
  text_body: tpl.text_body || '',
});

export function TemplateList() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, error, isLoading, mutate } = useSWR<EmailTemplate[]>(LIST_KEY, fetcher);

  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState<FormState>({ name: '', subject: '', html_body: '', text_body: '' });
  const [submitting, setSubmitting] = useState(false);

  const openEdit = (tpl: EmailTemplate) => {
    setEditing(tpl);
    setForm(fromTemplate(tpl));
  };

  const close = () => setEditing(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!editing) return;
    setSubmitting(true);
    try {
      await api.patch(`/admin/email-templates/${editing.id}`, {
        name: form.name,
        subject: form.subject,
        html_body: form.html_body,
        text_body: form.text_body || null,
      });
      toast({ title: t('systemEmail.template.updated') });
      close();
      mutate();
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('systemEmail.templates')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="flex h-32 items-center justify-center text-destructive">
            {t('systemEmail.toast.loadFailed')}
          </div>
        )}
        {!isLoading && !error && (data?.length ?? 0) > 0 && (
          <div className="grid gap-2">
            {data!.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="font-mono text-xs">{tpl.code}</Badge>
                    <span className="text-sm font-medium truncate">{tpl.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground truncate">{tpl.subject}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => openEdit(tpl)} title={t('systemEmail.edit')}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {!isLoading && !error && (data?.length ?? 0) === 0 && (
          <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">
            {t('systemEmail.empty')}
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t('systemEmail.template.editTitle')}</DialogTitle>
            <DialogDescription>
              {editing && (
                <>
                  <span className="font-mono text-xs">{editing.code}</span>
                  {editing.available_variables && editing.available_variables.length > 0 && (
                    <span className="ml-2 text-xs">
                      {t('systemEmail.template.variables')}: {editing.available_variables.map((v) => `{${v}}`).join(', ')}
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid gap-2">
              <Label htmlFor="tpl-name">{t('systemEmail.template.name')}</Label>
              <Input id="tpl-name" value={form.name} onChange={(e) => update('name', e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-subject">{t('systemEmail.template.subject')}</Label>
              <Input id="tpl-subject" value={form.subject} onChange={(e) => update('subject', e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-html">{t('systemEmail.template.htmlBody')}</Label>
              <Textarea
                id="tpl-html"
                rows={10}
                className="font-mono text-xs"
                value={form.html_body}
                onChange={(e) => update('html_body', e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tpl-text">{t('systemEmail.template.textBody')}</Label>
              <Textarea
                id="tpl-text"
                rows={5}
                className="font-mono text-xs"
                value={form.text_body}
                onChange={(e) => update('text_body', e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={submitting}>
              {t('systemEmail.form.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || !form.name || !form.subject || !form.html_body}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('systemEmail.form.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
