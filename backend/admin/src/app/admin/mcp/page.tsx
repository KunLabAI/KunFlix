'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ServerCog } from 'lucide-react';

export default function MCPPage() {
  const { t } = useTranslation();
  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('mcp.title')}</h2>
          <p className="text-muted-foreground mt-2">{t('mcp.subtitle')}</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 py-20">
        <ServerCog className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground mb-1">{t('mcp.inDevelopment.title')}</h3>
        <p className="text-sm text-muted-foreground/60">{t('mcp.inDevelopment.desc')}</p>
      </div>
    </div>
  );
}
