
'use client';

import React from 'react';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import api from '@/lib/axios';
import { ProviderForm } from '../components/provider-form';
import { Loader2 } from 'lucide-react';
import { LLMProvider } from '../schema';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function EditLLMProviderPage() {
  const params = useParams();
  const id = params?.id as string;
  
  // 尝试获取列表并在前端查找，以兼容可能不支持单条查询的后端
  // 如果后端支持 /admin/llm-providers/:id，可以直接用那个接口
  // 为了保险起见，这里先用列表接口
  const { data: providers, error, isLoading } = useSWR('/admin/llm-providers/', fetcher);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center text-destructive">
        加载失败，请刷新重试
      </div>
    );
  }

  const provider = providers?.find((p: LLMProvider) => String(p.id) === id);

  if (!provider) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center text-muted-foreground">
        未找到该供应商
      </div>
    );
  }

  return <ProviderForm initialData={provider} />;
}
