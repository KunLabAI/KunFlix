'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UseFormReturn } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Eye, EyeOff, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FormValues, PROVIDERS_REQUIRE_BASE_URL } from '../../schema';

interface StepConnectionProps {
  form: UseFormReturn<FormValues>;
  actions?: React.ReactNode;
}

export function StepConnection({ form, actions }: StepConnectionProps) {
  const { t } = useTranslation();
  const [showApiKey, setShowApiKey] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // DashScope 百炼: base_url 为同地域 Endpoint 必填, 展示专属引导文案与必填标记
  const isDashscope = PROVIDERS_REQUIRE_BASE_URL(form.watch('provider_type') || '');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t('llm.form.connection.title')}</CardTitle>
            <CardDescription>{t('llm.form.connection.description')}</CardDescription>
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={form.control}
          name="base_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {isDashscope ? t('llm.form.connection.baseUrlRequiredLabel') : t('llm.form.connection.baseUrl')}
                {isDashscope && <span className="ml-1 text-destructive">*</span>}
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={
                    isDashscope
                      ? t('llm.form.connection.baseUrlPlaceholderDashscope')
                      : t('llm.form.connection.baseUrlPlaceholder')
                  }
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {isDashscope
                  ? t('llm.form.connection.baseUrlDescriptionDashscope')
                  : t('llm.form.connection.baseUrlDescription')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="api_key"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('llm.form.connection.apiKey')}</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    placeholder={t('llm.form.connection.apiKeyPlaceholder')}
                    autoComplete="off"
                    className="pr-10"
                    {...field}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                    aria-label={showApiKey ? t('llm.form.connection.hideApiKey') : t('llm.form.connection.showApiKey')}
                    title={showApiKey ? t('llm.form.connection.hideApiKey') : t('llm.form.connection.showApiKey')}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:border-muted-foreground/50"
            >
              <Settings2 className="h-4 w-4" />
              <span className="flex-1 text-left">{t('llm.form.connection.advancedConfig')}</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <FormField
              control={form.control}
              name="config_json"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      rows={5}
                      placeholder={t('llm.form.connection.advancedConfigPlaceholder')}
                      className="font-mono text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
