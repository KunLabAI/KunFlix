'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Coins } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';
import { useToast } from '@/components/ui/use-toast';
import type { Admin } from '@/types';
import { Textarea } from '@/components/ui/textarea';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

// 权限级别变体映射
const PERMISSION_VARIANT: Record<string, 'default' | 'secondary'> = {
  admin: 'default',
  super_admin: 'secondary',
};

const PERMISSION_KEYS = ['admin', 'super_admin'] as const;

type CreateValues = {
  email: string;
  nickname: string;
  password: string;
  permission_level: string;
};

type EditValues = {
  nickname: string;
  password?: string;
  permission_level: string;
  is_active: boolean;
};

export default function AdminsPage() {
  const { t } = useTranslation();
  const { data: admins, isLoading } = useSWR<Admin[]>('/admin/admins', fetcher);
  const { toast } = useToast();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDescription, setCreditDescription] = useState('');

  // Schema 随语言切换动态重建
  const createSchema = useMemo(
    () =>
      z.object({
        email: z.string().email(t('admins.validation.emailInvalid')),
        nickname: z.string().min(1, t('admins.validation.nicknameRequired')).max(100),
        password: z.string().min(6, t('admins.validation.passwordMin')),
        permission_level: z.string(),
      }),
    [t],
  );

  const editSchema = useMemo(
    () =>
      z.object({
        nickname: z.string().min(1, t('admins.validation.nicknameRequired')).max(100),
        password: z.string().optional(),
        permission_level: z.string(),
        is_active: z.boolean(),
      }),
    [t],
  );

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      email: '',
      nickname: '',
      password: '',
      permission_level: 'admin',
    },
  });

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      nickname: '',
      password: '',
      permission_level: 'admin',
      is_active: true,
    },
  });

  const openCreateDialog = () => {
    createForm.reset({
      email: '',
      nickname: '',
      password: '',
      permission_level: 'admin',
    });
    setCreateDialogOpen(true);
  };

  const openEditDialog = (admin: Admin) => {
    setSelectedAdmin(admin);
    editForm.reset({
      nickname: admin.nickname,
      password: '',
      permission_level: admin.permission_level,
      is_active: admin.is_active,
    });
    setEditDialogOpen(true);
  };

  const onCreate = async (values: CreateValues) => {
    setSubmitting(true);
    try {
      await api.post('/admin/admins', values);
      toast({
        title: t('admins.toast.createSuccess'),
        description: t('admins.toast.createSuccessDesc', { name: values.nickname }),
      });
      setCreateDialogOpen(false);
      mutate('/admin/admins');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t('admins.toast.createFailed'),
        description: err?.response?.data?.detail || t('admins.toast.retryLater'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onEdit = async (values: EditValues) => {
    if (!selectedAdmin) return;
    setSubmitting(true);
    try {
      const payload: any = {
        nickname: values.nickname,
        permission_level: values.permission_level,
        is_active: values.is_active,
      };
      // 只有填写了密码才更新
      if (values.password) {
        payload.password = values.password;
      }
      await api.put(`/admin/admins/${selectedAdmin.id}`, payload);
      toast({ title: t('admins.toast.updateSuccess') });
      setEditDialogOpen(false);
      mutate('/admin/admins');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t('admins.toast.updateFailed'),
        description: err?.response?.data?.detail || t('admins.toast.retryLater'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (admin: Admin) => {
    try {
      await api.delete(`/admin/admins/${admin.id}`);
      toast({
        title: t('admins.toast.deleteSuccess'),
        description: t('admins.toast.deleteSuccessDesc', { name: admin.nickname }),
      });
      mutate('/admin/admins');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t('admins.toast.deleteFailed'),
        description: err?.response?.data?.detail || t('admins.toast.retryLater'),
      });
    }
  };

  const openCreditsDialog = (admin: Admin) => {
    setSelectedAdmin(admin);
    setCreditAmount('');
    setCreditDescription('');
    setCreditsDialogOpen(true);
  };

  const onAdjustCredits = async () => {
    if (!selectedAdmin || !creditAmount) return;
    setSubmitting(true);
    try {
      await api.post(`/admin/admins/${selectedAdmin.id}/credits/adjust`, {
        amount: parseFloat(creditAmount),
        description: creditDescription || undefined,
      });
      toast({ title: t('admins.toast.creditsSuccess') });
      setCreditsDialogOpen(false);
      mutate('/admin/admins');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: t('admins.toast.creditsFailed'),
        description: err?.response?.data?.detail || t('admins.toast.retryLater'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">{t('admins.title')}</h2>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" /> {t('admins.addBtn')}
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admins.table.email')}</TableHead>
              <TableHead>{t('admins.table.nickname')}</TableHead>
              <TableHead>{t('admins.table.permissionLevel')}</TableHead>
              <TableHead>{t('admins.table.credits')}</TableHead>
              <TableHead>{t('admins.table.status')}</TableHead>
              <TableHead>{t('admins.table.lastLogin')}</TableHead>
              <TableHead className="text-right">{t('admins.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  {t('admins.table.loading')}
                </TableCell>
              </TableRow>
            ) : admins?.map((admin) => {
              const variant = PERMISSION_VARIANT[admin.permission_level] ?? PERMISSION_VARIANT.admin;
              return (
                <TableRow key={admin.id}>
                  <TableCell className="font-medium">{admin.email}</TableCell>
                  <TableCell>{admin.nickname}</TableCell>
                  <TableCell>
                    <Badge variant={variant}>
                      {t(`admins.permission.${admin.permission_level}`, { defaultValue: admin.permission_level })}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono">{Number(admin.credits ?? 0).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={admin.is_active ? 'default' : 'secondary'}>
                      {admin.is_active
                        ? t('admins.status.enabled')
                        : t('admins.status.disabled')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {admin.last_login_at ? new Date(admin.last_login_at).toLocaleString() : t('admins.table.dash')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t('admins.tooltip.adjustCredits')}
                        onClick={() => openCreditsDialog(admin)}
                      >
                        <Coins className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(admin)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('admins.delete.title')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('admins.delete.description', { name: admin.nickname })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('admins.delete.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(admin)}>
                              {t('admins.delete.confirm')}
                            </AlertDialogAction>
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

      {/* 创建管理员 Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admins.create.title')}</DialogTitle>
            <DialogDescription>{t('admins.create.description')}</DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admins.form.email')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('admins.create.emailPlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="nickname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admins.form.nickname')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('admins.create.nicknamePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admins.form.password')}</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder={t('admins.create.passwordPlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="permission_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admins.form.permissionLevel')}</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PERMISSION_KEYS.map((key) => (
                            <SelectItem key={key} value={key}>
                              {t(`admins.permission.${key}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  {t('admins.delete.cancel')}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('admins.create.submitting') : t('admins.create.submit')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 编辑管理员 Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admins.edit.title')}</DialogTitle>
            <DialogDescription>
              {t('admins.edit.description', { name: selectedAdmin?.nickname ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="nickname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admins.form.nickname')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admins.edit.passwordLabel')}</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder={t('admins.edit.passwordPlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="permission_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('admins.form.permissionLevel')}</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PERMISSION_KEYS.map((key) => (
                            <SelectItem key={key} value={key}>
                              {t(`admins.permission.${key}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>{t('admins.edit.isActive')}</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  {t('admins.delete.cancel')}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('admins.edit.submitting') : t('admins.edit.submit')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* 积分调整 Dialog */}
      <Dialog open={creditsDialogOpen} onOpenChange={setCreditsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admins.credits.title')}</DialogTitle>
            <DialogDescription>
              {t('admins.credits.description', {
                name: selectedAdmin?.nickname ?? '',
                balance: Number(selectedAdmin?.credits ?? 0).toFixed(2),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {[100, 500, 1000, 5000].map((v) => (
                <Button
                  key={v}
                  variant="outline"
                  size="sm"
                  onClick={() => setCreditAmount(String(v))}
                >
                  +{v}
                </Button>
              ))}
            </div>
            <div>
              <label className="text-sm font-medium">{t('admins.credits.amountLabel')}</label>
              <Input
                type="number"
                placeholder={t('admins.credits.amountPlaceholder')}
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('admins.credits.noteLabel')}</label>
              <Textarea
                placeholder={t('admins.credits.notePlaceholder')}
                value={creditDescription}
                onChange={(e) => setCreditDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditsDialogOpen(false)}>
              {t('admins.credits.cancel')}
            </Button>
            <Button
              onClick={onAdjustCredits}
              disabled={submitting || !creditAmount || parseFloat(creditAmount) === 0}
            >
              {submitting ? t('admins.credits.processing') : t('admins.credits.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
