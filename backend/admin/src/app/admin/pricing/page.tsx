'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Wand2, Loader2 } from 'lucide-react';
import { PricingList } from './components/PricingList';

const fetcher = (url: string) => api.get(url).then(r => r.data);

export default function PricingPage() {
  const router = useRouter();
  const { toast } = useToast();

  const { data: providers } = useSWR<any[]>('/admin/llm-providers/', fetcher);

  // 快捷定价弹窗状态
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickProvider, setQuickProvider] = useState<string>('');
  const [quickMultiplier, setQuickMultiplier] = useState<number>(1.5);
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  const handleQuickApply = async () => {
    const isAll = quickProvider === '__all__';
    const selectedIds = isAll
      ? (providers || []).map(p => p.id)
      : [quickProvider];

    setQuickSubmitting(true);
    let totalCount = 0;
    let hasError = false;

    for (const pid of selectedIds) {
      const result = await api.post('/admin/pricing/bulk-apply', {
        provider_id: pid,
        markup_multiplier: quickMultiplier,
      }).then(r => ({ ok: true as const, data: r.data }))
        .catch((err: any) => ({ ok: false as const, error: err }));

      result.ok
        ? (totalCount += (result.data as any[]).length)
        : (hasError = true);
    }

    setQuickSubmitting(false);
    hasError && toast({ variant: 'destructive', title: '部分供应商应用失败' });
    totalCount > 0 && (
      toast({ title: '已应用', description: `更新 ${totalCount} 条定价` }),
      setQuickOpen(false),
      mutate('/admin/pricing')
    );
    !hasError && totalCount === 0 && toast({ title: '无可更新的定价' });
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">计费定价管理</h2>
          <p className="text-muted-foreground mt-1">
            按 (供应商, 模型) 维度统一管理积分卖价，覆盖文本/图像/视频/音频全部维度。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setQuickOpen(true)}>
            <Wand2 className="mr-2 h-4 w-4" /> 快捷定价
          </Button>
          <Button onClick={() => router.push('/admin/pricing/new')}>
            <Plus className="mr-2 h-4 w-4" /> 新建定价
          </Button>
        </div>
      </div>

      <PricingList />

      {/* 快捷定价弹窗 */}
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>快捷定价</DialogTitle>
            <DialogDescription>
              按倍率将供应商的 USD 进价自动换算为积分卖价。已存在则更新，不存在则新建。1 USD ≈ 100 credits。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>供应商</Label>
              <Select value={quickProvider} onValueChange={setQuickProvider}>
                <SelectTrigger><SelectValue placeholder="选择供应商" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">全部供应商</SelectItem>
                  {providers?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.provider_type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>倍率</Label>
              <Input
                type="number"
                value={quickMultiplier}
                onChange={e => setQuickMultiplier(Math.max(1.0, Number(e.target.value) || 1.0))}
                step={0.1}
                min={1.0}
                className="w-32 font-mono"
              />
              <p className="text-xs text-muted-foreground">卖价 = USD 进价 × 倍率 × 100 → credits（最低 1.0）</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickOpen(false)} disabled={quickSubmitting}>
              取消
            </Button>
            <Button onClick={handleQuickApply} disabled={quickSubmitting || !quickProvider}>
              {quickSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              应用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
