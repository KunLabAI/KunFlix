'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import api from '@/lib/axios';
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, X, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { PRESET_COST_DIMENSIONS, MODEL_TYPE_OPTIONS, FormValues } from '../../schema';

interface StepModelsProps {
  form: UseFormReturn<FormValues>;
  modelCosts: Record<string, Record<string, number>>;
  setModelCosts: React.Dispatch<React.SetStateAction<Record<string, Record<string, number>>>>;
  actions?: React.ReactNode;
}

export function StepModels({ form, modelCosts, setModelCosts, actions }: StepModelsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isSyncingOllama, setIsSyncingOllama] = useState(false);
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "models",
  });

  // 同步本地 Ollama 模型列表：调用后端代理 GET /api/tags，
  // 合并保留已有同名条目的别名/类型配置；cost 配置仍由 modelCosts state 按名匹配。
  const handleSyncOllamaModels = async () => {
    try {
      setIsSyncingOllama(true);
      const baseUrl = (form.getValues('base_url') || '').trim() || 'http://localhost:11434';
      const res = await api.post('/admin/llm-providers/ollama-models', { base_url: baseUrl });
      if (!res.data?.success) {
        toast({
          variant: 'destructive',
          title: '同步失败',
          description: res.data?.message || '未能连接本地 Ollama 服务',
        });
        return;
      }
      const remoteNames: string[] = res.data.models || [];
      if (remoteNames.length === 0) {
        toast({
          variant: 'destructive',
          title: '本地未发现模型',
          description: '请先使用 `ollama pull <model>` 拉取至少一个模型',
        });
        return;
      }
      // 按 value 合并：本地列表为准，同名条目保留已有 type/display_name
      const existing = new Map(
        (form.getValues('models') || []).map((m: { value: string; type?: string; display_name?: string }) => [m.value, m]),
      );
      const merged = remoteNames.map((name) => existing.get(name) || { value: name, type: 'language', display_name: '' });
      replace(merged);
      toast({
        title: '同步成功',
        description: `已从 Ollama 拉取 ${remoteNames.length} 个模型`,
      });
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: '同步出错',
        description: err?.message || '请检查 Base URL 与后端服务',
      });
    } finally {
      setIsSyncingOllama(false);
    }
  };

  const updateCost = (modelName: string, key: string, rawValue: string) => {
    setModelCosts((prev) => {
      const modelEntry = { ...(prev[modelName] || {}) };
      if (rawValue === '') {
        delete modelEntry[key];
      } else {
        modelEntry[key] = Number(rawValue);
      }
      return { ...prev, [modelName]: modelEntry };
    });
  };

  const removeCost = (modelName: string, key: string) => {
    setModelCosts((prev) => {
      const modelEntry = { ...(prev[modelName] || {}) };
      delete modelEntry[key];
      return { ...prev, [modelName]: modelEntry };
    });
  };

  const hasNamedModel = fields.some((_, index) => form.watch(`models.${index}.value`));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{t('llm.form.models.title')}</CardTitle>
            <CardDescription>{t('llm.form.models.description')}</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            {form.watch('provider_type') === 'ollama' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleSyncOllamaModels}
                    disabled={isSyncingOllama}
                    className="rounded-full shrink-0"
                  >
                    {isSyncingOllama ? (
                      <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('llm.form.models.syncOllama')}</TooltipContent>
              </Tooltip>
            )}
            {actions}
          </div>
        </div>
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
        {hasNamedModel && (
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
                const customKeys = Object.keys(costs).filter((k) => !(k in PRESET_COST_DIMENSIONS));

                return (
                  <div key={field.id + '-cost'} className="rounded-lg border bg-card text-card-foreground">
                    <button
                      type="button"
                      className="flex items-center gap-3 w-full p-3 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
                      onClick={() => setExpandedModels((prev) => ({ ...prev, [modelName]: !prev[modelName] }))}
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
                                onChange={(e) => updateCost(modelName, dimKey, e.target.value)}
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
                                    onChange={(e) => updateCost(modelName, customKey, e.target.value)}
                                    className="font-mono h-8"
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeCost(modelName, customKey)}
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
                            if (name in PRESET_COST_DIMENSIONS || costs[name] !== undefined) {
                              toast({ variant: "destructive", title: t('llm.form.models.customParamExists') });
                              return;
                            }
                            setModelCosts((prev) => ({
                              ...prev,
                              [modelName]: { ...(prev[modelName] || {}), [name]: 0 },
                            }));
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
  );
}
