'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ProviderList } from './components/provider-list';
import { TemplateList } from './components/template-list';

export default function EmailProvidersPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t('systemEmail.title')}</h2>
        <p className="text-muted-foreground mt-1">{t('systemEmail.subtitle')}</p>
      </div>

      <ProviderList />
      <TemplateList />
    </div>
  );
}
