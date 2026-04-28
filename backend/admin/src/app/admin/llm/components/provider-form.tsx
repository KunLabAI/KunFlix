'use client';

import React, { useMemo, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import api from '@/lib/axios';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Plug, X, ChevronDown, ChevronRight, Save, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PRESET_COST_DIMENSIONS, MODEL_TYPE_OPTIONS, PROVIDER_OPTIONS, createFormSchema, FormValues, LLMProvider } from '../schema';

interface ProviderFormProps {
  initialData?: LLMProvider;
}

export function ProviderForm({ initialData }: ProviderFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [modelCosts, setModelCosts] = useState<Record<string, Record<string, number>>>(initialData?.model_costs || {});
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});

  const formSchema = useMemo(() => createFormSchema(t), [t]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: initialData?.name || "",
      provider_type: initialData?.provider_type || "",
      tags: initialData?.tags || [],
      models: initialData?.models.map(m => {
        const meta = initialData?.model_metadata?.[m];
        return { value: m, type: meta?.model_type || "", display_name: meta?.display_name || "" };
      }) || [{ value: "", type: "", display_name: "" }],
      base_url: initialData?.base_url || "",
      api_key: initialData?.api_key || "",
      config_json: initialData?.config_json && typeof initialData.config_json === 'object' ? JSON.stringify(initialData.config_json, null, 2) : (initialData?.config_json || "{}"),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "models",
  });

  const handleTestConnection = async () => {
    try {
      const values = await form.trigger();
      if (!values) return;

      const data = form.getValues();
      if (!data.models || data.models.length === 0 || !data.models[0].value) {
        toast({
          variant: "destructive",
          title: t('llm.form.toast.selectModelForTest'),
        });
        return;
      }

      setIsTesting(true);
      const testModel = data.models[0].value;

      const payload = {
        provider_type: data.provider_type,
        api_key: data.api_key,
        base_url: data.base_url,
        model: testModel,
        config_json: JSON.parse(data.config_json || '{}')
      };

      const res = await api.post('/admin/llm-providers/test-connection', payload);

      if (res.data.success) {
        toast({
          title: t('llm.form.toast.testSuccess'),
          description: t('llm.form.toast.testSuccessDesc', { response: res.data.response }),
        });
      } else {
        toast({
          variant: "destructive",
          title: t('llm.form.toast.testFailed'),
          description: res.data.message,
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t('llm.form.toast.testError'),
        description: err.message || t('llm.form.toast.unknownError'),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSaving(true);
    try {
      const modelNames = values.models.map(m => m.value);
      const cleanedCosts: Record<string, Record<string, number>> = {};
      modelNames.forEach(name => {
        if (modelCosts[name]) {
          cleanedCosts[name] = modelCosts[name];
        }
      });

      const configJsonObj = JSON.parse(values.config_json || '{}');

      const modelMetadata: Record<string, { model_type?: string; display_name?: string }> = {};
      values.models.forEach(m => {
        const entry: { model_type?: string; display_name?: string } = {};
        if (m.type) entry.model_type = m.type;
        if (m.display_name) entry.display_name = m.display_name;
        if (Object.keys(entry).length > 0) {
          modelMetadata[m.value] = entry;
        }
      });

      const submitValues = {
        ...values,
        models: modelNames,
        config_json: configJsonObj,
        model_costs: cleanedCosts,
        model_metadata: modelMetadata,
        is_active: true,
        is_default: false,
      };

      if (initialData) {
        await api.put(`/admin/llm-providers/${initialData.id}`, submitValues);
        toast({ title: t('llm.form.toast.updateSuccess') });
      } else {
        await api.post('/admin/llm-providers', submitValues);
        toast({ title: t('llm.form.toast.createSuccess') });
      }
      mutate('/admin/llm-providers/');
      router.push('/admin/llm');
    } catch {
      toast({
        variant: "destructive",
        title: t('llm.form.toast.submitFailed'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    form.handleSubmit(onSubmit as any)();
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{initialData ? t('llm.form.editTitle') : t('llm.form.createTitle')}</h2>
          <p className="text-muted-foreground mt-1">{t('llm.form.subtitle')}</p>
        </div>
        <div className="flex gap-3 items-center">
          {initialData && <span className="text-xs text-muted-foreground mr-2">{t('llm.form.idLabel', { id: initialData.id })}</span>}
          <Button type="button" variant="outline" onClick={handleTestConnection} disabled={isTesting}>
            {isTesting ? <div className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" /> : <Plug className="mr-2 h-4 w-4" />}
            {t('llm.form.testConnection')}
          </Button>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> {t('llm.form.back')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? t('llm.form.saving') : <><Save className="mr-2 h-4 w-4" /> {t('llm.form.save')}</>}
          </Button>
        </div>
      </div>

      {/* Content: Left-Right layout */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit as any)}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ==================== Left Column ==================== */}
            <div className="space-y-6">
              {/* 基本信息 */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('llm.form.basic.title')}</CardTitle>
                  <CardDescription>{t('llm.form.basic.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
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
                      name="provider_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('llm.form.basic.brand')}</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={t('llm.form.basic.brandPlaceholder')} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {PROVIDER_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  <div className="flex items-center gap-2">
                                    <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-sm">
                                      <Image src={option.icon} alt={option.label} fill className="object-contain" />
                                    </div>
                                    <span>{option.label}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

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
                </CardContent>
              </Card>

              {/* 连接与认证 */}
              <Card>
                <CardHeader>
                  <CardTitle>{t('llm.form.connection.title')}</CardTitle>
                  <CardDescription>{t('llm.form.connection.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="base_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('llm.form.connection.baseUrl')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('llm.form.connection.baseUrlPlaceholder')} {...field} />
                        </FormControl>
                        <FormDescription>{t('llm.form.connection.baseUrlDescription')}</FormDescription>
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
                          <Input type="password" placeholder={t('llm.form.connection.apiKeyPlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="config_json"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('llm.form.connection.advancedConfig')}</FormLabel>
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
                </CardContent>
              </Card>
            </div>

            {/* ==================== Right Column ==================== */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('llm.form.models.title')}</CardTitle>
                  <CardDescription>{t('llm.form.models.description')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    {fields.map((field, index) => (
                      <div key={field.id} className="flex gap-3 items-start">
                        <FormField
                          control={form.control}
                          name={`models.${index}.value`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormControl>
                                <Input placeholder={t('llm.form.models.modelNamePlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`models.${index}.display_name`}
                          render={({ field }) => (
                            <FormItem className="w-[140px]">
                              <FormControl>
                                <Input placeholder={t('llm.form.models.aliasPlaceholder')} {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`models.${index}.type`}
                          render={({ field }) => (
                            <FormItem className="w-[120px]">
                              <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder={t('llm.form.models.typePlaceholder')} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {MODEL_TYPE_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
                          className="mt-1"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ value: "", type: "", display_name: "" })}
                      className="w-full border-dashed"
                    >
                      <Plus className="mr-2 h-4 w-4" /> {t('llm.form.models.addModel')}
                    </Button>
                    {form.formState.errors.models?.message && (
                      <p className="text-sm font-medium text-destructive">{String(form.formState.errors.models.message)}</p>
                    )}
                  </div>

                  {/* 模型成本配置 */}
                  {fields.length > 0 && fields.some(f => form.getValues(`models.${fields.indexOf(f)}.value`)) && (
                    <div className="space-y-4 pt-4 border-t">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">{t('llm.form.models.costsTitle')}</h4>
                        <span className="text-xs text-muted-foreground">{t('llm.form.models.costsUnit')}</span>
                      </div>

                      <div className="space-y-3">
                        {fields.map((field, index) => {
                          const modelName = form.watch(`models.${index}.value`);
                          if (!modelName) return null;
                          const isExpanded = expandedModels[modelName] || false;
                          const costs = modelCosts[modelName] || {};
                          const customKeys = Object.keys(costs).filter(k => !(k in PRESET_COST_DIMENSIONS));

                          return (
                            <div key={field.id + '-cost'} className="rounded-lg border bg-card text-card-foreground shadow-sm">
                              <button
                                type="button"
                                className="flex items-center gap-3 w-full p-3 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
                                onClick={() => setExpandedModels(prev => ({ ...prev, [modelName]: !prev[modelName] }))}
                              >
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                <span className="font-mono text-sm font-medium">{modelName}</span>
                                {Object.keys(costs).length > 0 && (
                                  <Badge variant="secondary" className="ml-auto text-xs font-normal">
                                    {t('llm.form.models.configCount', { count: Object.keys(costs).length })}
                                  </Badge>
                                )}
                              </button>

                              {isExpanded && (
                                <div className="p-4 pt-0 space-y-4 border-t bg-muted/10">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    {Object.entries(PRESET_COST_DIMENSIONS).map(([dimKey, dimConfig]) => (
                                      <div key={dimKey} className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground flex justify-between">
                                          {t(dimConfig.labelKey)}
                                          <span className="opacity-70">{dimConfig.unit}</span>
                                        </label>
                                        <Input
                                          type="number"
                                          step="0.000001"
                                          min={0}
                                          placeholder="0"
                                          value={costs[dimKey] ?? ''}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setModelCosts(prev => {
                                              const updated = { ...prev };
                                              const modelEntry = { ...(updated[modelName] || {}) };
                                              if (val === '') {
                                                delete modelEntry[dimKey];
                                              } else {
                                                modelEntry[dimKey] = Number(val);
                                              }
                                              updated[modelName] = modelEntry;
                                              return updated;
                                            });
                                          }}
                                          className="font-mono h-9 bg-background"
                                        />
                                      </div>
                                    ))}
                                  </div>

                                  {/* 自定义参数 */}
                                  {customKeys.length > 0 && (
                                    <div className="space-y-3 pt-2">
                                      <h5 className="text-xs font-semibold text-muted-foreground">{t('llm.form.models.customParamsTitle')}</h5>
                                      {customKeys.map((customKey) => (
                                        <div key={customKey} className="flex gap-3 items-end p-2 bg-background rounded-md border">
                                          <div className="flex-1 space-y-1">
                                            <label className="text-xs text-muted-foreground">{t('llm.form.models.customParamName')}</label>
                                            <div className="font-mono text-sm px-2 py-1 bg-muted rounded">{customKey}</div>
                                          </div>
                                          <div className="flex-1 space-y-1">
                                            <label className="text-xs text-muted-foreground">{t('llm.form.models.customParamCost')}</label>
                                            <Input
                                              type="number"
                                              step="0.000001"
                                              min={0}
                                              value={costs[customKey] ?? ''}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                setModelCosts(prev => {
                                                  const updated = { ...prev };
                                                  const modelEntry = { ...(updated[modelName] || {}) };
                                                  if (val === '') {
                                                    delete modelEntry[customKey];
                                                  } else {
                                                    modelEntry[customKey] = Number(val);
                                                  }
                                                  updated[modelName] = modelEntry;
                                                  return updated;
                                                });
                                              }}
                                              className="font-mono h-8"
                                            />
                                          </div>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                            onClick={() => {
                                              setModelCosts(prev => {
                                                const updated = { ...prev };
                                                const modelEntry = { ...(updated[modelName] || {}) };
                                                delete modelEntry[customKey];
                                                updated[modelName] = modelEntry;
                                                return updated;
                                              });
                                            }}
                                          >
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-full border-dashed text-xs"
                                    onClick={() => {
                                      const name = prompt(t('llm.form.models.customParamPrompt'));
                                      if (!name) return;
                                      if (!name.match(/^[a-z_][a-z0-9_]*$/)) {
                                        toast({ variant: "destructive", title: t('llm.form.models.customParamFormatError'), description: t('llm.form.models.customParamFormatErrorDesc') });
                                        return;
                                      }
                                      if (name in PRESET_COST_DIMENSIONS || (costs[name] !== undefined)) {
                                        toast({ variant: "destructive", title: t('llm.form.models.customParamExists') });
                                        return;
                                      }
                                      setModelCosts(prev => {
                                        const updated = { ...prev };
                                        updated[modelName] = { ...(updated[modelName] || {}), [name]: 0 };
                                        return updated;
                                      });
                                    }}
                                  >
                                    <Plus className="mr-1 h-3 w-3" /> {t('llm.form.models.addCustomParam')}
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </>
  );
}
