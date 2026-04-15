'use client';

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import { Trash2, Coins, CreditCard, History, HardDrive, Monitor, Eye, Mail, Shield, Clock, Globe, Smartphone, Laptop, Tablet } from 'lucide-react';
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

const fetcher = (url: string) => api.get(url).then((res) => res.data);

// 积分调整表单 Schema
const creditAdjustSchema = z.object({
  amount: z.number().refine(v => v !== 0, { message: '金额不能为 0' }),
  description: z.string().min(1, '请输入操作说明'),
});

// 订阅设置表单 Schema
const subscriptionSchema = z.object({
  plan_id: z.string().min(1, '请选择套餐'),
  start_at: z.string().min(1, '请选择开始时间'),
  end_at: z.string().min(1, '请选择结束时间'),
  auto_grant_credits: z.boolean(),
});

type CreditAdjustValues = z.infer<typeof creditAdjustSchema>;
type SubscriptionValues = z.infer<typeof subscriptionSchema>;

// 存储大小格式化
const STORAGE_UNITS = ["B", "KB", "MB", "GB", "TB"];
function formatBytes(bytes: number): string {
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < STORAGE_UNITS.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${STORAGE_UNITS[i]}`;
}

// 订阅状态映射表
const SUBSCRIPTION_STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  active: { label: '生效中', variant: 'default' },
  inactive: { label: '未订阅', variant: 'secondary' },
  expired: { label: '已过期', variant: 'destructive' },
};

export default function UsersPage() {
  const { data: users, error, isLoading } = useSWR<User[]>('/admin/users', fetcher);
  const { data: plans } = useSWR<SubscriptionPlan[]>('/admin/subscriptions', fetcher);
  const { toast } = useToast();

  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/admin/users/${id}`);
      toast({
        title: "用户删除成功",
        description: "用户已从系统中移除",
      });
      mutate('/admin/users');
    } catch (err) {
      toast({
        variant: "destructive",
        title: "删除用户失败",
        description: "请稍后重试",
      });
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
      toast({ 
        title: values.amount > 0 ? '充值成功' : '扣除成功',
        description: `已${values.amount > 0 ? '充值' : '扣除'} ${Math.abs(values.amount)} 积分`,
      });
      setCreditDialogOpen(false);
      mutate('/admin/users');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '操作失败',
        description: err?.response?.data?.detail || '请稍后重试',
      });
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
      toast({ title: '订阅设置成功' });
      setSubscriptionDialogOpen(false);
      mutate('/admin/users');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '设置失败',
        description: err?.response?.data?.detail || '请稍后重试',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const cancelSubscription = async (userId: string) => {
    try {
      await api.delete(`/admin/users/${userId}/subscription`);
      toast({ title: '订阅已取消' });
      mutate('/admin/users');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '取消失败',
        description: err?.response?.data?.detail || '请稍后重试',
      });
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-4">
      <h2 className="text-3xl font-bold tracking-tight">用户管理</h2>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>邮箱</TableHead>
              <TableHead>昵称</TableHead>
              <TableHead className="text-right">积分</TableHead>
              <TableHead>订阅状态</TableHead>
              <TableHead>存储用量</TableHead>
              <TableHead className="text-right">Token (输入/输出)</TableHead>
              <TableHead>设备/IP</TableHead>
              <TableHead>最后登录</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  加载中...
                </TableCell>
              </TableRow>
            ) : users?.map((user) => {
              const statusInfo = SUBSCRIPTION_STATUS_MAP[user.subscription_status] || SUBSCRIPTION_STATUS_MAP.inactive;
              const usedBytes = user.storage_used_bytes || 0;
              const quotaBytes = user.storage_quota_bytes || 2147483648;
              const usagePercent = Math.min(100, Math.round(usedBytes / quotaBytes * 100));
              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>{user.nickname}</TableCell>
                  <TableCell className="text-right tabular-nums font-mono">
                    {Number(user.credits || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
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
                          <p>使用率: {usagePercent}%</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(user.total_input_tokens || 0).toLocaleString()} / {(user.total_output_tokens || 0).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-default">
                            <Monitor className="h-3 w-3" />
                            <span>{user.last_device_type || '-'}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1 text-xs">
                            <p>操作系统: {user.last_os || '-'}</p>
                            <p>浏览器: {user.last_browser || '-'}</p>
                            <p>注册IP: {user.register_ip || '-'}</p>
                            <p>登录IP: {user.last_login_ip || '-'}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell>
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" title="查看详情" onClick={() => openDetailDialog(user)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="积分管理" onClick={() => openCreditDialog(user)}>
                        <Coins className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="订阅管理" onClick={() => openSubscriptionDialog(user)}>
                        <CreditCard className="h-4 w-4" />
                      </Button>
                      <Link href={`/admin/users/${user.id}/credits`}>
                        <Button variant="ghost" size="icon" title="积分历史">
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
                            <AlertDialogTitle>确认删除？</AlertDialogTitle>
                            <AlertDialogDescription>
                              此操作不可撤销。这将永久删除该用户及其相关数据。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(user.id)}>确认删除</AlertDialogAction>
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>用户详情</DialogTitle>
            <DialogDescription>
              {selectedUser?.nickname} ({selectedUser?.email})
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (() => {
            const u = selectedUser;
            const statusInfo = SUBSCRIPTION_STATUS_MAP[u.subscription_status] || SUBSCRIPTION_STATUS_MAP.inactive;
            const usedBytes = u.storage_used_bytes || 0;
            const quotaBytes = u.storage_quota_bytes || 2147483648;
            const usagePercent = Math.min(100, Math.round(usedBytes / quotaBytes * 100));
            const planName = plans?.find(p => p.id === u.subscription_plan_id)?.name;
            const DEVICE_ICON_MAP: Record<string, React.ElementType> = { mobile: Smartphone, tablet: Tablet, desktop: Laptop };
            const DeviceIcon = DEVICE_ICON_MAP[u.last_device_type || ''] || Monitor;
            return (
              <div className="space-y-6">
                {/* 基本信息 */}
                <section>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />基本信息</h4>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">用户ID</span><span className="font-mono text-xs">{u.id}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">邮箱</span><span>{u.email}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">昵称</span><span>{u.nickname}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">状态</span><Badge variant={u.is_active ? 'default' : 'destructive'}>{u.is_active ? '活跃' : '禁用'}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">余额冻结</span><Badge variant={u.is_balance_frozen ? 'destructive' : 'secondary'}>{u.is_balance_frozen ? '已冻结' : '正常'}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">注册时间</span><span>{u.created_at ? new Date(u.created_at).toLocaleString() : '-'}</span></div>
                  </div>
                </section>

                <div className="border-t" />

                {/* 账户数据 */}
                <section>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><Coins className="h-3.5 w-3.5" />账户数据</h4>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">积分余额</span><span className="font-mono">{Number(u.credits || 0).toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">输入Token</span><span className="font-mono">{(u.total_input_tokens || 0).toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">输出Token</span><span className="font-mono">{(u.total_output_tokens || 0).toLocaleString()}</span></div>
                  </div>
                </section>

                <div className="border-t" />

                {/* 存储空间 */}
                <section>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" />存储空间</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">使用量</span>
                      <span>{formatBytes(usedBytes)} / {formatBytes(quotaBytes)} ({usagePercent}%)</span>
                    </div>
                    <Progress value={usagePercent} className="h-2" />
                  </div>
                </section>

                <div className="border-t" />

                {/* 订阅信息 */}
                <section>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" />订阅信息</h4>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">订阅状态</span><Badge variant={statusInfo.variant}>{statusInfo.label}</Badge></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">当前套餐</span><span>{planName || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">开始时间</span><span>{u.subscription_start_at ? new Date(u.subscription_start_at).toLocaleString() : '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">到期时间</span><span>{u.subscription_end_at ? new Date(u.subscription_end_at).toLocaleString() : '-'}</span></div>
                  </div>
                </section>

                <div className="border-t" />

                {/* 登录与设备 */}
                <section>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />登录与设备</h4>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">注册IP</span><span className="font-mono text-xs">{u.register_ip || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">最近登录IP</span><span className="font-mono text-xs">{u.last_login_ip || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">最后登录</span><span>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '-'}</span></div>
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">设备类型</span><span className="flex items-center gap-1"><DeviceIcon className="h-3.5 w-3.5" />{u.last_device_type || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">操作系统</span><span>{u.last_os || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">浏览器</span><span>{u.last_browser || '-'}</span></div>
                  </div>
                </section>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* 积分管理 Dialog */}
      <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>积分管理</DialogTitle>
            <DialogDescription>
              为用户 {selectedUser?.nickname} 调整积分（当前余额: {Number(selectedUser?.credits || 0).toFixed(2)}）
            </DialogDescription>
          </DialogHeader>
          <Form {...creditForm}>
            <form onSubmit={creditForm.handleSubmit(onCreditSubmit)} className="space-y-4">
              <FormField
                control={creditForm.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>调整金额</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="正数=充值，负数=扣除"
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
                    <FormLabel>操作说明</FormLabel>
                    <FormControl>
                      <Textarea placeholder="请输入操作原因" rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreditDialogOpen(false)}>取消</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? '提交中...' : '确认'}
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
            <DialogTitle>订阅管理</DialogTitle>
            <DialogDescription>
              为用户 {selectedUser?.nickname} 设置订阅套餐
            </DialogDescription>
          </DialogHeader>
          <Form {...subscriptionForm}>
            <form onSubmit={subscriptionForm.handleSubmit(onSubscriptionSubmit)} className="space-y-4">
              <FormField
                control={subscriptionForm.control}
                name="plan_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>订阅套餐</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="选择套餐" />
                        </SelectTrigger>
                        <SelectContent>
                          {plans?.filter(p => p.is_active).map(plan => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} - ${plan.price_usd} ({plan.credits} 积分)
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
                      <FormLabel>开始时间</FormLabel>
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
                      <FormLabel>结束时间</FormLabel>
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
                      <FormLabel>自动发放套餐积分</FormLabel>
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
                    取消订阅
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setSubscriptionDialogOpen(false)}>取消</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? '提交中...' : '设置订阅'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
