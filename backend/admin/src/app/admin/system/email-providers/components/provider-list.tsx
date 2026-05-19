'use client';

import React, { useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { useTranslation } from 'react-i18next';
import api from '@/lib/axios';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Pencil, Trash2, Send, Star, AlertTriangle } from 'lucide-react';
import { EmailProvider } from '../types';
import { ProviderFormDialog } from './provider-form-dialog';
import { TestSendDialog } from './test-send-dialog';

const LIST_KEY = '/admin/email-providers';
const fetcher = (url: string) => api.get(url).then((r) => r.data);

export function ProviderList() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, error, isLoading, mutate } = useSWR<EmailProvider[]>(LIST_KEY, fetcher);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmailProvider | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<EmailProvider | null>(null);
  const [busy, setBusy] = useState<string>('');

  const refresh = () => {
    mutate();
    globalMutate(LIST_KEY);
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (p: EmailProvider) => {
    setEditing(p);
    setFormOpen(true);
  };
  const openTest = (p: EmailProvider) => {
    setTestTarget(p.id);
    setTestOpen(true);
  };

  const handleSetDefault = async (p: EmailProvider) => {
    setBusy(p.id);
    try {
      await api.post(`/admin/email-providers/${p.id}/set-default`);
      toast({ title: t('systemEmail.toast.setDefaultSuccess') });
      refresh();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t('systemEmail.toast.setDefaultFailed'),
        description: err?.response?.data?.detail || String(err),
      });
    } finally {
      setBusy('');
    }
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setBusy(target.id);
    try {
      await api.delete(`/admin/email-providers/${target.id}`);
      toast({ title: t('systemEmail.toast.deleteSuccess') });
      setDeleteTarget(null);
      refresh();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t('systemEmail.toast.deleteFailed'),
        description: err?.response?.data?.detail || String(err),
      });
    } finally {
      setBusy('');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t('systemEmail.providers')}</CardTitle>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t('systemEmail.add')}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="flex h-40 items-center justify-center text-destructive">
            {t('systemEmail.toast.loadFailed')}
          </div>
        )}
        {!isLoading && !error && (data?.length ?? 0) === 0 && (
          <div className="flex h-40 flex-col items-center justify-center text-muted-foreground gap-2">
            <p className="text-sm font-medium">{t('systemEmail.empty')}</p>
            <p className="text-xs">{t('systemEmail.emptyHint')}</p>
          </div>
        )}
        {!isLoading && !error && (data?.length ?? 0) > 0 && (
          <div className="grid gap-3">
            {data!.map((p) => (
              <div
                key={p.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold truncate">{p.name}</span>
                    <Badge variant="outline" className="capitalize">{p.provider_type}</Badge>
                    {p.is_default && <Badge>{t('systemEmail.defaultBadge')}</Badge>}
                    <Badge variant={p.is_active ? 'secondary' : 'outline'}>
                      {t(p.is_active ? 'systemEmail.enabled' : 'systemEmail.disabled')}
                    </Badge>
                  </div>
                  <div className="mt-1.5 grid gap-0.5 text-xs text-muted-foreground">
                    <span>From: {p.from_name ? `${p.from_name} <${p.from_email}>` : p.from_email}</span>
                    <span>Key: {p.api_key_masked}</span>
                    {p.last_error_message && (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {p.last_error_message}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {!p.is_default && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(p)}
                      disabled={busy === p.id}
                    >
                      <Star className="mr-1 h-3.5 w-3.5" />
                      {t('systemEmail.setDefault')}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => openTest(p)}>
                    <Send className="mr-1 h-3.5 w-3.5" />
                    {t('systemEmail.testSend')}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)} title={t('systemEmail.edit')}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(p)}
                    title={t('systemEmail.delete')}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ProviderFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        onSaved={refresh}
      />
      <TestSendDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        providerId={testTarget}
      />
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('systemEmail.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('systemEmail.deleteConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('systemEmail.form.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('systemEmail.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
