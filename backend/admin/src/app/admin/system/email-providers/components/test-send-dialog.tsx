'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import api from '@/lib/axios';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
}

export function TestSendDialog({ open, onOpenChange, providerId }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [toEmail, setToEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    open && setToEmail('');
  }, [open]);

  const handleSend = async () => {
    setSubmitting(true);
    try {
      await api.post(`/admin/email-providers/${providerId}/test-send`, { to: toEmail });
      toast({ title: t('systemEmail.test.success') });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t('systemEmail.test.failed'),
        description: err?.response?.data?.detail || String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t('systemEmail.test.title')}</DialogTitle>
          <DialogDescription>{t('systemEmail.testSend')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="ts-to">{t('systemEmail.test.toEmail')}</Label>
          <Input
            id="ts-to"
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('systemEmail.form.cancel')}
          </Button>
          <Button onClick={handleSend} disabled={submitting || !toEmail}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('systemEmail.test.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
