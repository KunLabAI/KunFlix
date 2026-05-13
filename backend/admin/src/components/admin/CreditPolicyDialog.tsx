'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR, { mutate } from 'swr';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw, Coins, CalendarClock } from 'lucide-react';
import api from '@/lib/axios';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

// 积分策略：new_user_initial_credits 字段已下线
// - 新用户注册直接绑定 Free Tier 套餐，初始余额由套餐 credits 决定
// - 弹窗只保留月度重置相关策略与统计面板
type CreditPolicy = {
  subscription_reset_enabled: boolean;
  subscription_reset_mode: 'override' | 'accumulate' | 'floor';
  free_tier_reset_enabled: boolean;
  free_tier_reset_credits: number;
};

type PolicyResponse = {
  policy: CreditPolicy;
  defaults: CreditPolicy;
  reset_modes: Array<'override' | 'accumulate' | 'floor'>;
};

type ResetStats = {
  due_count: number;
  scheduled_count: number;
  active_subscription_count: number;
  server_time_utc: string;
};

const RESET_MODE_KEY: Record<string, string> = {
  override: 'systemSettings.resetMode.override',
  accumulate: 'systemSettings.resetMode.accumulate',
  floor: 'systemSettings.resetMode.floor',
};

interface CreditPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreditPolicyDialog({ open, onOpenChange }: CreditPolicyDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  // 弹窗关闭时不拉数据，避免无谓请求
  const { data: policyResp, isLoading: loadingPolicy } = useSWR<PolicyResponse>(
    open ? '/admin/system-settings/credit-policy' : null,
    fetcher,
  );
  const { data: stats, isLoading: loadingStats } = useSWR<ResetStats>(
    open ? '/admin/system-settings/credit-reset/stats' : null,
    fetcher,
    { refreshInterval: open ? 30000 : 0 },
  );

  const [form, setForm] = useState<CreditPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);

  // 初始化表单（policy 加载完成后同步一次）
  useEffect(() => {
    policyResp?.policy && setForm({ ...policyResp.policy });
  }, [policyResp]);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await api.patch('/admin/system-settings/credit-policy', form);
      await mutate('/admin/system-settings/credit-policy');
      toast({
        title: t('systemSettings.toast.saveSuccess'),
        description: t('systemSettings.toast.saveSuccessDesc'),
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: t('systemSettings.toast.saveFail'),
        description: e?.response?.data?.detail || String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    policyResp?.defaults && setForm({ ...policyResp.defaults });
    toast({ title: t('systemSettings.toast.reverted') });
  };

  const handleTriggerBatch = async () => {
    setTriggering(true);
    try {
      const { data } = await api.post('/admin/system-settings/credit-reset/trigger?limit=500');
      await mutate('/admin/system-settings/credit-reset/stats');
      toast({
        title: t('systemSettings.toast.triggerSuccess'),
        description: t('systemSettings.toast.triggerSuccessDesc', {
          total: data?.total_due ?? 0,
          reset: data?.reset_count ?? 0,
          skipped: data?.skipped ?? 0,
        }),
      });
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: t('systemSettings.toast.triggerFail'),
        description: e?.response?.data?.detail || String(e),
      });
    } finally {
      setTriggering(false);
    }
  };

  const resetModes = policyResp?.reset_modes || ['override', 'accumulate', 'floor'];
  const isLoading = loadingPolicy || !form;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            {t('systemSettings.creditPolicy.title')}
          </DialogTitle>
          <DialogDescription>{t('systemSettings.creditPolicy.desc')}</DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && form && (
          <div className="space-y-6">
            {/* 订阅用户月度重置 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('systemSettings.field.subscriptionResetEnabled')}</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('systemSettings.field.subscriptionResetEnabledHint')}
                  </p>
                </div>
                <Switch
                  checked={form.subscription_reset_enabled}
                  onCheckedChange={(v) => setForm({ ...form, subscription_reset_enabled: v })}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('systemSettings.field.resetMode')}</Label>
                <Select
                  value={form.subscription_reset_mode}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      subscription_reset_mode: v as CreditPolicy['subscription_reset_mode'],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {resetModes.map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(RESET_MODE_KEY[m] || m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t(`systemSettings.resetMode.${form.subscription_reset_mode}Hint`)}
                </p>
              </div>
            </div>

            <Separator />

            {/* 非订阅用户月度重置 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>{t('systemSettings.field.freeTierResetEnabled')}</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('systemSettings.field.freeTierResetEnabledHint')}
                  </p>
                </div>
                <Switch
                  checked={form.free_tier_reset_enabled}
                  onCheckedChange={(v) => setForm({ ...form, free_tier_reset_enabled: v })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="free_tier_reset_credits">
                  {t('systemSettings.field.freeTierResetCredits')}
                </Label>
                <Input
                  id="free_tier_reset_credits"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.free_tier_reset_credits}
                  disabled={!form.free_tier_reset_enabled}
                  onChange={(e) =>
                    setForm({ ...form, free_tier_reset_credits: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <Separator />

            {/* 月度重置操作台 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                <Label>{t('systemSettings.resetPanel.title')}</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('systemSettings.resetPanel.desc')}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    {t('systemSettings.resetPanel.dueCount')}
                  </div>
                  <div className="text-xl font-bold mt-1">
                    {loadingStats ? '—' : stats?.due_count ?? 0}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    {t('systemSettings.resetPanel.scheduledCount')}
                  </div>
                  <div className="text-xl font-bold mt-1">
                    {loadingStats ? '—' : stats?.scheduled_count ?? 0}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    {t('systemSettings.resetPanel.activeSubCount')}
                  </div>
                  <div className="text-xl font-bold mt-1">
                    {loadingStats ? '—' : stats?.active_subscription_count ?? 0}
                  </div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {t('systemSettings.resetPanel.serverTime')}:{' '}
                <Badge variant="secondary">{stats?.server_time_utc || '—'}</Badge>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleTriggerBatch}
                  disabled={triggering}
                >
                  {triggering ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {t('systemSettings.action.triggerBatch')}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleReset} disabled={saving || isLoading}>
            {t('systemSettings.action.revertDefaults')}
          </Button>
          <Button onClick={handleSave} disabled={saving || isLoading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('systemSettings.action.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
