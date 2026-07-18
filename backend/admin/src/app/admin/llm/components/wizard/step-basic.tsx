'use client';

import React, { useState } from 'react';
import Image from 'next/image';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PROVIDER_OPTIONS, FormValues } from '../../schema';

interface StepBasicProps {
  form: UseFormReturn<FormValues>;
  actions?: React.ReactNode;
}

export function StepBasic({ form, actions }: StepBasicProps) {
  const { t } = useTranslation();
  const [tagInput, setTagInput] = useState("");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t('llm.form.basic.title')}</CardTitle>
            <CardDescription>{t('llm.form.basic.description')}</CardDescription>
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <FormField
          control={form.control}
          name="provider_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('llm.form.basic.brand')}</FormLabel>
              <FormControl>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                  {PROVIDER_OPTIONS.map((option) => {
                    const selected = field.value === option.value;
                    return (
                      <div key={option.value} className="relative group">
                        <button
                          type="button"
                          onClick={() => {
                            field.onChange(option.value);
                            // 名称为空或仍是上一品牌的自动填充值时，跟随新品牌覆盖；手动改过的名称保留
                            const currentName = form.getValues('name');
                            const isAutoFilled = PROVIDER_OPTIONS.some((o) => o.label === currentName);
                            (currentName && !isAutoFilled) || form.setValue('name', option.label, { shouldValidate: true });
                          }}
                          className={cn(
                            "flex w-full flex-col items-center gap-2 rounded-lg border bg-background p-3 text-sm transition-all hover:border-primary/60 hover:bg-muted/50",
                            selected && "border-primary ring-2 ring-primary/30 bg-primary/5 hover:bg-primary/5"
                          )}
                        >
                          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md">
                            <Image src={option.icon} alt={option.label} fill className="object-contain" />
                          </div>
                          <span className="text-xs font-medium text-center leading-tight">{option.label}</span>
                        </button>
                        <a
                          href={option.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={t('llm.form.basic.brandDocs', { name: option.label })}
                          title={t('llm.form.basic.brandDocs', { name: option.label })}
                          className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 opacity-70 transition-all hover:bg-background hover:text-primary hover:opacity-100 hover:shadow-sm focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group-hover:opacity-100"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    );
                  })}
                </div>
              </FormControl>
              <FormDescription>{t('llm.form.basic.brandHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('llm.form.basic.name')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('llm.form.basic.namePlaceholder')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('llm.form.basic.tags')}</FormLabel>
                <FormControl>
                  <div className="flex flex-wrap items-center gap-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 min-h-[2.5rem]">
                    {field.value?.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="flex items-center gap-1">
                        {tag}
                        <X
                          className="h-3 w-3 cursor-pointer hover:text-destructive"
                          onClick={() => {
                            const newTags = [...(field.value || [])];
                            newTags.splice(index, 1);
                            field.onChange(newTags);
                          }}
                        />
                      </Badge>
                    ))}
                    <input
                      className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground min-w-[120px]"
                      placeholder={field.value?.length ? "" : t('llm.form.basic.tagsPlaceholder')}
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = tagInput.trim();
                          if (val) {
                            const currentTags = field.value || [];
                            if (!currentTags.includes(val)) {
                              field.onChange([...currentTags, val]);
                            }
                            setTagInput("");
                          }
                        } else if (e.key === 'Backspace' && !tagInput && field.value?.length) {
                          const newTags = [...(field.value || [])];
                          newTags.pop();
                          field.onChange(newTags);
                        }
                      }}
                    />
                  </div>
                </FormControl>
                <FormDescription>{t('llm.form.basic.tagsDescription')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}
