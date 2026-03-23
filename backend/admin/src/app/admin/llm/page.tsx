
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ProviderList } from './components/provider-list';

export default function LLMPage() {
  const router = useRouter();

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">AI 供应商</h2>
          <p className="text-muted-foreground mt-1">
            管理和配置 AI 供应商及其模型参数
          </p>
        </div>
        <Button onClick={() => router.push('/admin/llm/create')}>
          <Plus className="mr-2 h-4 w-4" /> 添加供应商
        </Button>
      </div>

      <ProviderList />
    </>
  );
}
