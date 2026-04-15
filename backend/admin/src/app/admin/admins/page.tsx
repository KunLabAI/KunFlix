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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Coins } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';
import { useToast } from '@/components/ui/use-toast';
import type { Admin } from '@/types';
import { Textarea } from '@/components/ui/textarea';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

// 权限级别映射表
const PERMISSION_LEVELS: Record<string, { label: string; variant: 'default' | 'secondary' }> = {
  admin: { label: '管理员', variant: 'default' },
  super_admin: { label: '超级管理员', variant: 'secondary' },
};

// 创建管理员表单 Schema
const createSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  nickname: z.string().min(1, '请输入昵称').max(100),
  password: z.string().min(6, '密码至少 6 位'),
  permission_level: z.string(),
});

// 编辑管理员表单 Schema
const editSchema = z.object({
  nickname: z.string().min(1, '请输入昵称').max(100),
  password: z.string().optional(),
  permission_level: z.string(),
  is_active: z.boolean(),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

export default function AdminsPage() {
  const { data: admins, isLoading } = useSWR<Admin[]>('/admin/admins', fetcher);
  const { toast } = useToast();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDescription, setCreditDescription] = useState('');

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
      toast({ title: '创建成功', description: `管理员 ${values.nickname} 已创建` });
      setCreateDialogOpen(false);
      mutate('/admin/admins');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '创建失败',
        description: err?.response?.data?.detail || '请稍后重试',
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
      toast({ title: '更新成功' });
      setEditDialogOpen(false);
      mutate('/admin/admins');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '更新失败',
        description: err?.response?.data?.detail || '请稍后重试',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (admin: Admin) => {
    try {
      await api.delete(`/admin/admins/${admin.id}`);
      toast({ title: '删除成功', description: `管理员 ${admin.nickname} 已删除` });
      mutate('/admin/admins');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '删除失败',
        description: err?.response?.data?.detail || '请稍后重试',
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
      toast({ title: '积分调整成功' });
      setCreditsDialogOpen(false);
      mutate('/admin/admins');
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '调整失败',
        description: err?.response?.data?.detail || '请稍后重试',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">管理员管理</h2>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" /> 新增管理员
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>邮箱</TableHead>
              <TableHead>昵称</TableHead>
              <TableHead>权限级别</TableHead>
              <TableHead>积分</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>最后登录</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  加载中...
                </TableCell>
              </TableRow>
            ) : admins?.map((admin) => {
              const levelInfo = PERMISSION_LEVELS[admin.permission_level] || PERMISSION_LEVELS.admin;
              return (
                <TableRow key={admin.id}>
                  <TableCell className="font-medium">{admin.email}</TableCell>
                  <TableCell>{admin.nickname}</TableCell>
                  <TableCell>
                    <Badge variant={levelInfo.variant}>{levelInfo.label}</Badge>
                  </TableCell>
                  <TableCell className="font-mono">{Number(admin.credits ?? 0).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={admin.is_active ? 'default' : 'secondary'}>
                      {admin.is_active ? '启用' : '禁用'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {admin.last_login_at ? new Date(admin.last_login_at).toLocaleString() : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" title="调整积分" onClick={() => openCreditsDialog(admin)}>
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
                            <AlertDialogTitle>确认删除？</AlertDialogTitle>
                            <AlertDialogDescription>
                              确定要删除管理员 &quot;{admin.nickname}&quot; 吗？此操作不可撤销。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(admin)}>确认删除</AlertDialogAction>
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
            <DialogTitle>新增管理员</DialogTitle>
            <DialogDescription>创建新的管理员账户</DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input placeholder="admin@example.com" {...field} />
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
                    <FormLabel>昵称</FormLabel>
                    <FormControl>
                      <Input placeholder="管理员昵称" {...field} />
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
                    <FormLabel>密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="至少 6 位" {...field} />
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
                    <FormLabel>权限级别</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PERMISSION_LEVELS).map(([key, val]) => (
                            <SelectItem key={key} value={key}>{val.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>取消</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? '创建中...' : '创建'}
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
            <DialogTitle>编辑管理员</DialogTitle>
            <DialogDescription>修改管理员 {selectedAdmin?.nickname} 的信息</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="nickname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>昵称</FormLabel>
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
                    <FormLabel>新密码（留空则不修改）</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="输入新密码" {...field} />
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
                    <FormLabel>权限级别</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PERMISSION_LEVELS).map(([key, val]) => (
                            <SelectItem key={key} value={key}>{val.label}</SelectItem>
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
                      <FormLabel>启用账户</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? '保存中...' : '保存'}
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
            <DialogTitle>调整积分</DialogTitle>
            <DialogDescription>
              管理员: {selectedAdmin?.nickname} | 当前余额: {Number(selectedAdmin?.credits ?? 0).toFixed(2)}
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
              <label className="text-sm font-medium">调整数量</label>
              <Input
                type="number"
                placeholder="正数=充值，负数=扣减"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">备注说明</label>
              <Textarea
                placeholder="可选：填写调整原因"
                value={creditDescription}
                onChange={(e) => setCreditDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditsDialogOpen(false)}>取消</Button>
            <Button
              onClick={onAdjustCredits}
              disabled={submitting || !creditAmount || parseFloat(creditAmount) === 0}
            >
              {submitting ? '处理中...' : '确认调整'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
