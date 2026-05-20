'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { PricingList } from './components/PricingList';

export default function PricingPage() {
  const router = useRouter();

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">计费定价管理</h2>
          <p className="text-muted-foreground mt-1">
            按 (供应商, 模型) 维度统一管理积分卖价，覆盖文本/图像/视频/音频全部维度。
          </p>
        </div>
        <Button onClick={() => router.push('/admin/pricing/new')}>
          <Plus className="mr-2 h-4 w-4" /> 新建定价
        </Button>
      </div>

      <PricingList />
    </>
  );
}
