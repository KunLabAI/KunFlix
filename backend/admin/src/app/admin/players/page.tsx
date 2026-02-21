'use client';

import React from 'react';
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
import { Badge } from "@/components/ui/badge";
import { Trash2 } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';
import { useToast } from '@/components/ui/use-toast';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

interface UserRow {
  id: string;
  email: string;
  nickname: string;
  role: string;
  is_active: boolean;
  total_input_tokens: number;
  total_output_tokens: number;
  last_login_at: string | null;
  created_at: string | null;
}

export default function UsersPage() {
  const { data: users, error, isLoading } = useSWR<UserRow[]>('/admin/users', fetcher);
  const { toast } = useToast();

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

  const roleBadgeVariant = (role: string) => {
    const variants: Record<string, 'default' | 'secondary'> = {
      admin: 'default',
      user: 'secondary',
    };
    return variants[role] ?? 'secondary';
  };

  return (
    <div className="space-y-4">
      <h2 className="text-3xl font-bold tracking-tight">用户管理</h2>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>邮箱</TableHead>
              <TableHead>昵称</TableHead>
              <TableHead>角色</TableHead>
              <TableHead className="text-right">Token (输入/输出)</TableHead>
              <TableHead>最后登录</TableHead>
              <TableHead>注册时间</TableHead>
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
            ) : users?.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.email}</TableCell>
                <TableCell>{user.nickname}</TableCell>
                <TableCell>
                  <Badge variant={roleBadgeVariant(user.role)}>{user.role}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {(user.total_input_tokens || 0).toLocaleString()} / {(user.total_output_tokens || 0).toLocaleString()}
                </TableCell>
                <TableCell>
                  {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : '-'}
                </TableCell>
                <TableCell>
                  {user.created_at ? new Date(user.created_at).toLocaleString() : '-'}
                </TableCell>
                <TableCell className="text-right">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="icon">
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
