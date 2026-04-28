
'use client';

import React from 'react';
import useSWR from 'swr';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import api from '@/lib/axios';
import { ProviderForm } from '../components/provider-form';
import { Loader2 } from 'lucide-react';
import { LLMProvider } from '../schema';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function EditLLMProviderPage() {
  const params = useParams();
  const id = params?.id as string;
  const { t } = useTranslation();

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
        {t('llm.edit.loadFailed')}
      </div>
    );
  }

  const provider = providers?.find((p: LLMProvider) => String(p.id) === id);

  if (!provider) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center text-muted-foreground">
        {t('llm.edit.notFound')}
      </div>
    );
  }

  return <ProviderForm initialData={provider} />;
}
