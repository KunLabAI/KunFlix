'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import { useTranslation } from 'react-i18next';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Pencil, Trash2, Loader2, Plus, Wand2 } from 'lucide-react';

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
  const { data: providers } = useSWR<any[]>('/admin/llm-providers/', fetcher);

  // 倍率快速应用对话框
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkProvider, setBulkProvider] = useState<string>('');
  const [bulkMultiplier, setBulkMultiplier] = useState<number>(1.5);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

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

  const handleBulkApply = async () => {
    if (!bulkProvider) {
      toast({ variant: 'destructive', title: '请先选择供应商' });
      return;
    }
    setBulkSubmitting(true);
    const result = await api.post('/admin/pricing/bulk-apply', {
      provider_id: bulkProvider,
      markup_multiplier: bulkMultiplier,
    }).then(r => ({ ok: true as const, data: r.data }))
      .catch((err: any) => ({ ok: false as const, error: err }));
    setBulkSubmitting(false);
    result.ok || toast({
      variant: 'destructive',
      title: '一键应用失败',
      description: result.error?.response?.data?.detail || '未知错误',
    });
    result.ok && (
      toast({ title: '已应用', description: `更新 ${(result.data as any[]).length} 条定价` }),
      setBulkOpen(false),
      mutate('/admin/pricing')
    );
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
      {/* 顶部操作栏 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            按倍率一键应用
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">供应商</Label>
            <Select value={bulkProvider} onValueChange={setBulkProvider}>
              <SelectTrigger className="w-[260px]"><SelectValue placeholder="选择供应商" /></SelectTrigger>
              <SelectContent>
                {providers?.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.provider_type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">倍率</Label>
            <Input
              type="number"
              value={bulkMultiplier}
              onChange={e => setBulkMultiplier(Math.max(1.0, Number(e.target.value) || 1.0))}
              step={0.1}
              min={1.0}
              className="w-24 font-mono"
            />
          </div>
          <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <AlertDialogTrigger asChild>
              <Button disabled={!bulkProvider}>应用至该供应商所有模型</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认按倍率应用</AlertDialogTitle>
                <AlertDialogDescription>
                  将以 {bulkMultiplier}× 倍率，根据该供应商的 USD 进价覆盖该供应商所有模型的积分卖价（已存在则更新，不存在则新建）。此操作会立刻广播缓存失效。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={bulkSubmitting}>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkApply} disabled={bulkSubmitting}>
                  {bulkSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  确认应用
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <p className="text-xs text-muted-foreground basis-full">
            提示：本操作仅覆盖已知计费维度（input/text_output/image_output/search/image_generation/video_*/audio_generation）。1 USD ≈ 100 credits。
          </p>
        </CardContent>
      </Card>

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
