
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ProviderList } from './components/provider-list';

export default function LLMPage() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('llm.title')}</h2>
          <p className="text-muted-foreground mt-1">
            {t('llm.subtitle')}
          </p>
        </div>
        <Button onClick={() => router.push('/admin/llm/create')}>
          <Plus className="mr-2 h-4 w-4" /> {t('llm.addProvider')}
        </Button>
      </div>

      <ProviderList />
    </>
  );
}
