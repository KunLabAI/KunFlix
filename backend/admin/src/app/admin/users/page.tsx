'use client';

import React, { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Trash2, Coins, CreditCard, History, HardDrive, Monitor, Eye, Globe, Smartphone, Laptop, Tablet, CircleUser, Mail, RefreshCw } from 'lucide-react';
import { formatDateTime, formatShortDateTime, formatRelativeTime } from '@/lib/date-utils';
import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';
import { useToast } from '@/components/ui/use-toast';
import type { User, SubscriptionPlan } from '@/types';
import Link from 'next/link';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

// 存储大小格式化
const STORAGE_UNITS = ["B", "KB", "MB", "GB", "TB"];
function formatBytes(bytes: number): string {
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < STORAGE_UNITS.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${STORAGE_UNITS[i]}`;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  active: 'default',
  inactive: 'secondary',
  expired: 'destructive',
};

// 详情行组件
function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

// 注册来源标识组件
function AuthSourceBadge({ user }: { user: User }) {
  const sources: { icon: string; label: string }[] = [];
  user.google_id && sources.push({ icon: '/provider/gemini-color.svg', label: 'Google' });
  user.github_id && sources.push({ icon: '/provider/meta-color.svg', label: 'GitHub' });

  return (
    <div className="flex items-center gap-1.5">
      {sources.length === 0 ? (
        <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">local</span>
      ) : (
        sources.map((s) => (
          <TooltipProvider key={s.label}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                  <img src={s.icon} alt={s.label} width={14} height={14} />
                </div>
              </TooltipTrigger>
              <TooltipContent>{s.label}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))
      )}
    </div>
  );
}

export default function UsersPage() {
  const { t } = useTranslation();
  const { data: users, isLoading } = useSWR<User[]>('/admin/users', fetcher);
  const { data: plans } = useSWR<SubscriptionPlan[]>('/admin/subscriptions', fetcher);
  const { toast } = useToast();

  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recalcingAll, setRecalcingAll] = useState(false);

  const creditAdjustSchema = useMemo(() => z.object({
    amount: z.number().refine(v => v !== 0, { message: t('users.credit.validation.nonZero') }),
    description: z.string().min(1, t('users.credit.validation.reasonRequired')),
  }), [t]);

  const subscriptionSchema = useMemo(() => z.object({
    plan_id: z.string().min(1, t('users.subscription.validation.planRequired')),
    start_at: z.string().min(1, t('users.subscription.validation.startRequired')),
    end_at: z.string().min(1, t('users.subscription.validation.endRequired')),
    auto_grant_credits: z.boolean(),
  }), [t]);

  type CreditAdjustValues = z.infer<typeof creditAdjustSchema>;
  type SubscriptionValues = z.infer<typeof subscriptionSchema>;

  const creditForm = useForm<CreditAdjustValues>({
    resolver: zodResolver(creditAdjustSchema),
    defaultValues: { amount: 0, description: '' },
  });

  const subscriptionForm = useForm<SubscriptionValues>({
    resolver: zodResolver(subscriptionSchema),
    defaultValues: {
      plan_id: '',
      start_at: new Date().toISOString().slice(0, 16),
      end_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      auto_grant_credits: true,
    },
  });

  const getStatusLabel = (status: string) => t(`users.subscriptionStatus.${status in STATUS_VARIANT ? status : 'inactive'}`);
  const getStatusVariant = (status: string) => STATUS_VARIANT[status] ?? STATUS_VARIANT.inactive;

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/admin/users/${id}`);
      toast({ title: t('users.toast.deleteSuccess'), description: t('users.toast.deleteSuccessDesc') });
      mutate('/admin/users');
    } catch {
      toast({ variant: 'destructive', title: t('users.toast.deleteFailed'), description: t('users.toast.retryLater') });
    }
  };

  const openDetailDialog = (user: User) => {
    setSelectedUser(user);
    setDetailDialogOpen(true);
  };

  const openCreditDialog = (user: User) => {
    setSelectedUser(user);
    creditForm.reset({ amount: 0, description: '' });
    setCreditDialogOpen(true);
  };

  const openSubscriptionDialog = (user: User) => {
    setSelectedUser(user);
    const now = new Date();
    const monthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    subscriptionForm.reset({
      plan_id: user.subscription_plan_id || '',
      start_at: now.toISOString().slice(0, 16),
      end_at: monthLater.toISOString().slice(0, 16),
      auto_grant_credits: true,
    });
    setSubscriptionDialogOpen(true);
  };

  const onCreditSubmit = async (values: CreditAdjustValues) => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      await api.post(`/admin/users/${selectedUser.id}/credits/adjust`, {
        amount: values.amount,
        description: values.description,
      });
      const isRecharge = values.amount > 0;
      toast({
        title: isRecharge ? t('users.toast.rechargeSuccess') : t('users.toast.deductSuccess'),
        description: isRecharge
          ? t('users.toast.rechargeDesc', { amount: Math.abs(values.amount) })
          : t('users.toast.deductDesc', { amount: Math.abs(values.amount) }),
      });
      setCreditDialogOpen(false);
      mutate('/admin/users');
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('users.toast.operationFailed'), description: err?.response?.data?.detail || t('users.toast.retryLater') });
    } finally {
      setSubmitting(false);
    }
  };

  const onSubscriptionSubmit = async (values: SubscriptionValues) => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      await api.put(`/admin/users/${selectedUser.id}/subscription`, {
        plan_id: values.plan_id,
        start_at: new Date(values.start_at).toISOString(),
        end_at: new Date(values.end_at).toISOString(),
        auto_grant_credits: values.auto_grant_credits,
      });
      toast({ title: t('users.toast.subscriptionSetSuccess') });
      setSubscriptionDialogOpen(false);
      mutate('/admin/users');
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('users.toast.subscriptionSetFailed'), description: err?.response?.data?.detail || t('users.toast.retryLater') });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelSubscription = async (userId: string) => {
    try {
      await api.delete(`/admin/users/${userId}/subscription`);
      toast({ title: t('users.toast.subscriptionCanceled') });
      mutate('/admin/users');
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('users.toast.subscriptionCancelFailed'), description: err?.response?.data?.detail || t('users.toast.retryLater') });
    }
  };

  const handleRecalcAll = async () => {
    setRecalcingAll(true);
    try {
      await api.post('/admin/users/recalc-all-storage');
      toast({ title: t('users.toast.recalcSuccess') });
      mutate('/admin/users');
    } catch {
      toast({ variant: 'destructive', title: t('users.toast.recalcFailed') });
    } finally {
      setRecalcingAll(false);
    }
  };

  const getAuthProviderLabel = (u: User) => {
    if (u.google_id && u.github_id) return t('users.detail.providerGoogleGitHub');
    if (u.google_id) return t('users.detail.providerGoogle');
    if (u.github_id) return t('users.detail.providerGitHub');
    return t('users.detail.providerLocal');
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{t('users.title')}</h2>
        <Button variant="outline" size="sm" onClick={handleRecalcAll} disabled={recalcingAll}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${recalcingAll ? 'animate-spin' : ''}`} />
          {recalcingAll ? t('users.actions.recalcing') : t('users.actions.recalcStorage')}
        </Button>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('users.table.user')}</TableHead>
              <TableHead className="text-right">{t('users.table.credits')}</TableHead>
              <TableHead className="text-right">{t('users.table.tokenIO')}</TableHead>
              <TableHead>{t('users.table.subscriptionStatus')}</TableHead>
              <TableHead>{t('users.table.storage')}</TableHead>
              <TableHead>{t('users.table.authSource')}</TableHead>
              <TableHead>{t('users.table.time')}</TableHead>
              <TableHead className="text-right">{t('users.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  {t('users.table.loading')}
                </TableCell>
              </TableRow>
            ) : users?.map((user) => {
              const usedBytes = user.storage_used_bytes || 0;
              const quotaBytes = user.storage_quota_bytes || 2147483648;
              const usagePercent = Math.min(100, Math.round(usedBytes / quotaBytes * 100));
              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{user.email}</span>
                      <span className="text-xs text-muted-foreground truncate">{user.nickname}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="tabular-nums font-mono text-sm">{Number(user.credits || 0).toFixed(2)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span className="tabular-nums font-mono text-xs">{(user.total_input_tokens || 0).toLocaleString()}</span>
                      <span className="tabular-nums font-mono text-xs text-muted-foreground">{(user.total_output_tokens || 0).toLocaleString()}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(user.subscription_status)}>{getStatusLabel(user.subscription_status)}</Badge>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="w-24">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                              <HardDrive className="h-3 w-3" />
                              <span>{formatBytes(usedBytes)} / {formatBytes(quotaBytes)}</span>
                            </div>
                            <Progress value={usagePercent} className="h-1.5" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('users.tooltip.usageRate', { percent: usagePercent })}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>
                    <AuthSourceBadge user={user} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-xs">
                      <span className="text-muted-foreground">{formatShortDateTime(user.created_at)}</span>
                      <span>{formatRelativeTime(user.last_login_at)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" title={t('users.tooltip.viewDetail')} onClick={() => openDetailDialog(user)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title={t('users.tooltip.manageCredits')} onClick={() => openCreditDialog(user)}>
                        <Coins className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title={t('users.tooltip.manageSubscription')} onClick={() => openSubscriptionDialog(user)}>
                        <CreditCard className="h-4 w-4" />
                      </Button>
                      <Link href={`/admin/users/${user.id}/credits`}>
                        <Button variant="ghost" size="icon" title={t('users.tooltip.creditHistory')}>
                          <History className="h-4 w-4" />
                        </Button>
                      </Link>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('users.delete.title')}</AlertDialogTitle>
                            <AlertDialogDescription>{t('users.delete.description')}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('users.delete.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(user.id)}>{t('users.delete.confirm')}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 用户详情 Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          <VisuallyHidden><DialogTitle>{t('users.detail.title')}</DialogTitle></VisuallyHidden>
          {selectedUser && (() => {
            const u = selectedUser;
            const usedBytes = u.storage_used_bytes || 0;
            const quotaBytes = u.storage_quota_bytes || 2147483648;
            const usagePercent = Math.min(100, Math.round(usedBytes / quotaBytes * 100));
            const planName = plans?.find(p => p.id === u.subscription_plan_id)?.name;
            const DEVICE_ICON_MAP: Record<string, React.ElementType> = { mobile: Smartphone, tablet: Tablet, desktop: Laptop };
            const DeviceIcon = DEVICE_ICON_MAP[u.last_device_type || ''] || Monitor;
            return (
              <>
                {/* 头部信息卡片 */}
                <div className="px-6 pt-6 pb-5 border-b bg-muted/30">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                      <CircleUser className="h-7 w-7" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold truncate">{u.nickname}</h3>
                        <Badge variant={u.is_active ? 'default' : 'destructive'} className="text-[10px] px-1.5 py-0">{u.is_active ? t('users.detail.active') : t('users.detail.disabled')}</Badge>
                        {u.is_balance_frozen && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{t('users.detail.frozen')}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{u.email}</p>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">{u.id}</p>
                    </div>
                    <AuthSourceBadge user={u} />
                  </div>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {/* 注册来源 */}
                  <div className="rounded-lg border p-4">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{t('users.detail.authSource')}</h4>
                    <div className="flex items-center gap-2">
                      <AuthSourceBadge user={u} />
                      <span className="text-sm text-muted-foreground">{getAuthProviderLabel(u)}</span>
                    </div>
                  </div>

                  {/* 账户数据统计卡片 */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{t('users.detail.stats.creditBalance')}</p>
                      <p className="text-lg font-semibold font-mono">{Number(u.credits || 0).toFixed(2)}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{t('users.detail.stats.inputToken')}</p>
                      <p className="text-lg font-semibold font-mono">{(u.total_input_tokens || 0).toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{t('users.detail.stats.outputToken')}</p>
                      <p className="text-lg font-semibold font-mono">{(u.total_output_tokens || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  {/* 存储空间 */}
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5 text-muted-foreground" />{t('users.detail.storage.title')}</span>
                      <span className="text-xs text-muted-foreground">{formatBytes(usedBytes)} / {formatBytes(quotaBytes)} ({usagePercent}%)</span>
                    </div>
                    <Progress value={usagePercent} className="h-1.5" />
                  </div>

                  {/* 订阅信息 */}
                  <div className="rounded-lg border p-4">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-muted-foreground" />{t('users.detail.subscription.title')}</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <DetailRow label={t('users.detail.subscription.status')} value={<Badge variant={getStatusVariant(u.subscription_status)}>{getStatusLabel(u.subscription_status)}</Badge>} />
                      <DetailRow label={t('users.detail.subscription.plan')} value={planName || t('users.detail.subscription.empty')} />
                      <DetailRow label={t('users.detail.subscription.startTime')} value={formatDateTime(u.subscription_start_at)} />
                      <DetailRow label={t('users.detail.subscription.endTime')} value={formatDateTime(u.subscription_end_at)} />
                    </div>
                  </div>

                  {/* 登录与设备 */}
                  <div className="rounded-lg border p-4">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-muted-foreground" />{t('users.detail.login.title')}</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <DetailRow label={t('users.detail.login.registerTime')} value={formatDateTime(u.created_at)} />
                      <DetailRow label={t('users.detail.login.lastLogin')} value={formatDateTime(u.last_login_at)} />
                      <DetailRow label={t('users.detail.login.registerIp')} value={<span className="font-mono text-xs">{u.register_ip || '-'}</span>} />
                      <DetailRow label={t('users.detail.login.loginIp')} value={<span className="font-mono text-xs">{u.last_login_ip || '-'}</span>} />
                      <DetailRow label={t('users.detail.login.deviceType')} value={<span className="flex items-center gap-1"><DeviceIcon className="h-3.5 w-3.5" />{u.last_device_type || '-'}</span>} />
                      <DetailRow label={t('users.detail.login.os')} value={u.last_os || '-'} />
                      <DetailRow label={t('users.detail.login.browser')} value={u.last_browser || '-'} />
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* 积分管理 Dialog */}
      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.credit.dialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('users.credit.description', { nickname: selectedUser?.nickname ?? '', balance: Number(selectedUser?.credits || 0).toFixed(2) })}
            </DialogDescription>
          </DialogHeader>
          <Form {...creditForm}>
            <form onSubmit={creditForm.handleSubmit(onCreditSubmit)} className="space-y-4">
              <FormField
                control={creditForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.credit.amount')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={t('users.credit.amountPlaceholder')}
                        value={field.value}
                        onChange={e => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={creditForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.credit.reason')}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t('users.credit.reasonPlaceholder')} rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreditDialogOpen(false)}>{t('users.credit.cancel')}</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('users.credit.submitting') : t('users.credit.confirm')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 订阅管理 Dialog */}
      <Dialog open={subscriptionDialogOpen} onOpenChange={setSubscriptionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('users.subscription.dialogTitle')}</DialogTitle>
            <DialogDescription>
              {t('users.subscription.description', { nickname: selectedUser?.nickname ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <Form {...subscriptionForm}>
            <form onSubmit={subscriptionForm.handleSubmit(onSubscriptionSubmit)} className="space-y-4">
              <FormField
                control={subscriptionForm.control}
                name="plan_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('users.subscription.plan')}</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('users.subscription.planPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {plans?.filter(p => p.is_active).map(plan => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {t('users.subscription.planItem', { name: plan.name, price: plan.price_usd, credits: plan.credits })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={subscriptionForm.control}
                  name="start_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('users.subscription.startTime')}</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={subscriptionForm.control}
                  name="end_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('users.subscription.endTime')}</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={subscriptionForm.control}
                name="auto_grant_credits"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>{t('users.subscription.autoGrant')}</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="flex gap-2">
                {selectedUser?.subscription_status === 'active' && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      cancelSubscription(selectedUser.id);
                      setSubscriptionDialogOpen(false);
                    }}
                  >
                    {t('users.subscription.cancelSub')}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setSubscriptionDialogOpen(false)}>{t('users.subscription.cancel')}</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('users.subscription.submitting') : t('users.subscription.submit')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
