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
import { Trash2 } from 'lucide-react';
import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';
import { useToast } from '@/components/ui/use-toast';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function PlayersPage() {
  const { data: players, error, isLoading } = useSWR('/admin/players', fetcher);
  const { toast } = useToast();

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/admin/players/${id}`);
      toast({
        title: "玩家删除成功",
        description: "玩家已从系统中移除",
      });
      mutate('/admin/players');
    } catch (err) {
      toast({
        variant: "destructive",
        title: "删除玩家失败",
        description: "请稍后重试",
      });
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-3xl font-bold tracking-tight">玩家列表</h2>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
               <TableRow>
                 <TableCell colSpan={4} className="h-24 text-center">
                   加载中...
                 </TableCell>
               </TableRow>
            ) : players?.map((player: any) => (
              <TableRow key={player.id}>
                <TableCell className="font-medium">{player.id}</TableCell>
                <TableCell>{player.name}</TableCell>
                <TableCell>{new Date(player.created_at).toLocaleString()}</TableCell>
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
                          此操作不可撤销。这将永久删除该玩家账号及相关数据。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(player.id)}>确认删除</AlertDialogAction>
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
