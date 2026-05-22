'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { useTranslation } from 'react-i18next';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { Pencil, Trash2, Loader2, Plus } from 'lucide-react';

// 日期格式化辅助函数
const formatTime = (iso?: string | null): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface PricingItem {
  id: string;
  provider_id: string;
  provider_name?: string;
  model: string;
  dimensions: Record<string, number>;
  api_costs: Record<string, number>;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

const fetcher = (url: string) => api.get(url).then(r => r.data);

export function PricingList() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();

  const { data: items, error, isLoading } = useSWR<PricingItem[]>('/admin/pricing', fetcher);

  const handleDelete = async (id: string) => {
    const result = await api.delete(`/admin/pricing/${id}`)
      .then(() => ({ ok: true as const }))
      .catch((err: any) => ({ ok: false as const, error: err }));
    result.ok || toast({
      variant: 'destructive',
      title: '删除失败',
      description: result.error?.response?.data?.detail || '未知错误',
    });
    result.ok && (toast({ title: '已删除' }), mutate('/admin/pricing'));
  };

  const renderDimensions = (dims: Record<string, number>) => {
    const entries = Object.entries(dims).filter(([, v]) => v != null);
    if (entries.length === 0) return <span className="text-xs text-muted-foreground">未配置</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {entries.slice(0, 3).map(([k, v]) => (
          <Badge key={k} variant="outline" className="text-xs font-mono">{k}={v}</Badge>
        ))}
        {entries.length > 3 && (
          <Badge variant="outline" className="text-xs">+{entries.length - 3}</Badge>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center text-destructive">
        加载失败
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 定价表 */}
      {!items || items.length === 0 ? (
        <div className="flex h-[300px] w-full flex-col items-center justify-center space-y-4 rounded-lg border border-dashed bg-muted/50">
          <div className="text-base text-muted-foreground">尚未配置任何计费定价</div>
          <Button onClick={() => router.push('/admin/pricing/new')}>
            <Plus className="mr-2 h-4 w-4" />
            新建定价
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">供应商</TableHead>
                  <TableHead className="w-[200px]">模型</TableHead>
                  <TableHead>维度卖价</TableHead>
                  <TableHead className="w-[80px]">状态</TableHead>
                  <TableHead className="w-[150px]">创建时间</TableHead>
                  <TableHead className="w-[150px]">更新时间</TableHead>
                  <TableHead className="w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.provider_name || item.provider_id}</TableCell>
                    <TableCell><Badge variant="secondary" className="font-mono text-xs">{item.model}</Badge></TableCell>
                    <TableCell>{renderDimensions(item.dimensions || {})}</TableCell>
                    <TableCell>
                      {item.is_active
                        ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" variant="outline">启用</Badge>
                        : <Badge variant="outline" className="text-muted-foreground">停用</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {formatTime(item.created_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {formatTime(item.updated_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/admin/pricing/${item.id}`)}
                          title="编辑"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="删除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>删除该定价?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {item.provider_name || item.provider_id} / {item.model} 的所有维度定价将被删除。删除后该模型将不计费。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(item.id)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                确认删除
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
