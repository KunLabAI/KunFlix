
'use client';

import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, Plug, X, ChevronDown, ChevronRight, Save, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PRESET_COST_DIMENSIONS, MODEL_TYPE_TAGS, PROVIDER_OPTIONS, formSchema, LLMProvider } from '../schema';

interface ProviderFormProps {
  initialData?: LLMProvider;
}

export function ProviderForm({ initialData }: ProviderFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [modelCosts, setModelCosts] = useState<Record<string, Record<string, number>>>(initialData?.model_costs || {});
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || "",
      provider_type: initialData?.provider_type || "",
      tags: initialData?.tags || [],
      models: initialData?.models.map(m => {
        // 不再从 config_json 恢复 model_tags
        return { value: m, type: "" };
      }) || [{ value: "", type: "" }],
      base_url: initialData?.base_url || "",
      api_key: initialData?.api_key || "",
      config_json: initialData?.config_json && typeof initialData.config_json === 'object' ? JSON.stringify(initialData.config_json, null, 2) : (initialData?.config_json || "{}"),
      is_active: initialData?.is_active ?? true,
      is_default: initialData?.is_default ?? false,
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
          title: "请至少添加一个模型进行测试",
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
          title: "连接成功",
          description: `回复：${res.data.response}`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "连接失败",
          description: res.data.message,
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "测试失败",
        description: err.message || '未知错误',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSaving(true);
    try {
      const modelNames = values.models.map(m => m.value);
      // 清理 modelCosts 中不在 models 列表中的孤立数据
      const cleanedCosts: Record<string, Record<string, number>> = {};
      modelNames.forEach(name => {
        if (modelCosts[name]) {
          cleanedCosts[name] = modelCosts[name];
        }
      });

      // 提取 model tags 并存入 config_json (已移除)
      // const modelTags: Record<string, string> = {};
      // values.models.forEach(m => {
      //   if (m.value && m.type) {
      //     modelTags[m.value] = m.type;
      //   }
      // });

      const configJsonObj = JSON.parse(values.config_json || '{}');
      // 移除自动添加 model_tags 的逻辑，避免干扰测试连接
      // if (Object.keys(modelTags).length > 0) {
      //   configJsonObj.model_tags = modelTags;
      // } else {
      //   delete configJsonObj.model_tags;
      // }

      const submitValues = {
        ...values,
        models: modelNames,
        config_json: configJsonObj,
        model_costs: cleanedCosts,
      };

      if (initialData) {
        await api.put(`/admin/llm-providers/${initialData.id}`, submitValues);
        toast({ title: "供应商更新成功" });
      } else {
        await api.post('/admin/llm-providers/', submitValues);
        toast({ title: "供应商创建成功" });
      }
      mutate('/admin/llm-providers/');
      router.push('/admin/llm');
    } catch (err) {
      toast({
        variant: "destructive",
        title: "操作失败",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    form.handleSubmit(onSubmit)();
  };

  return (
    <div className="h-full flex flex-col bg-muted/20 overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b flex items-center justify-between px-6 shrink-0 bg-background">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-6 w-[1px] bg-border mx-1" />
          <div className="flex flex-col">
            <span className="font-semibold text-lg leading-tight">{initialData ? "编辑供应商" : "创建供应商"}</span>
            {initialData && <span className="text-xs text-muted-foreground">ID: {initialData.id}</span>}
          </div>
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={handleTestConnection} disabled={isTesting}>
            {isTesting ? <div className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" /> : <Plug className="mr-2 h-4 w-4" />}
            测试连接
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? '保存中...' : <><Save className="mr-2 h-4 w-4" /> 保存</>}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto py-8 px-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight mb-2">{initialData ? "修改配置" : "开始配置"}</h2>
            <p className="text-muted-foreground">配置 LLM 供应商的基础信息、模型参数及连接认证。</p>
          </div>
          
          <div className="bg-card rounded-xl border shadow-sm p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                
                <Card className="border-0 shadow-none">
                  <CardHeader className="px-0 pt-0">
                    <CardTitle>基本信息</CardTitle>
                    <CardDescription>配置供应商的基本连接信息。</CardDescription>
                  </CardHeader>
                  <CardContent className="px-0 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>名称</FormLabel>
                            <FormControl>
                              <Input placeholder="输入名称 (如 OpenAI)" {...field} />
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
                            <FormLabel>品牌</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="选择品牌" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {PROVIDER_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    <div className="flex items-center gap-2">
                                      <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-sm">
                                        <Image
                                          src={option.icon}
                                          alt={option.label}
                                          fill
                                          className="object-contain"
                                        />
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
                          <FormLabel>标签</FormLabel>
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
                                placeholder={field.value?.length ? "" : "输入标签后按回车添加"}
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
                          <FormDescription>用于分类和筛选，支持多个标签。</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-none">
                  <CardHeader className="px-0">
                    <CardTitle>模型配置</CardTitle>
                    <CardDescription>添加支持的模型及其成本信息。</CardDescription>
                  </CardHeader>
                  <CardContent className="px-0 space-y-6">
                    <div className="space-y-4">
                      {fields.map((field, index) => (
                        <div key={field.id} className="flex gap-4 items-start">
                          <FormField
                            control={form.control}
                            name={`models.${index}.value`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormControl>
                                  <Input placeholder="模型名称 (例如 gpt-4)" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          {/* 移除了模型类型下拉框，因为不再将 type 存入 config_json */}
                          {/* <FormField
                            control={form.control}
                            name={`models.${index}.type`}
                            render={({ field }) => (
                              <FormItem className="w-[180px]">
                                <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="模型标签" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {MODEL_TYPE_TAGS.map((tag) => (
                                      <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          /> */}
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
                        onClick={() => append({ value: "", type: "" })}
                        className="w-full border-dashed"
                      >
                        <Plus className="mr-2 h-4 w-4" /> 添加模型
                      </Button>
                      {form.formState.errors.models?.message && (
                        <p className="text-sm font-medium text-destructive">{String(form.formState.errors.models.message)}</p>
                      )}
                    </div>

                    {/* 模型成本配置 */}
                    {fields.length > 0 && fields.some(f => form.getValues(`models.${fields.indexOf(f)}.value`)) && (
                      <div className="space-y-4 pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium">模型成本配置 (选填)</h4>
                          <span className="text-xs text-muted-foreground">USD / Unit</span>
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
                                      {Object.keys(costs).length} 项配置
                                    </Badge>
                                  )}
                                </button>
                                
                                {isExpanded && (
                                  <div className="p-4 pt-0 space-y-4 border-t bg-muted/10">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                      {Object.entries(PRESET_COST_DIMENSIONS).map(([dimKey, dimConfig]) => (
                                        <div key={dimKey} className="space-y-1.5">
                                          <label className="text-xs font-medium text-muted-foreground flex justify-between">
                                            {dimConfig.label}
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
                                        <h5 className="text-xs font-semibold text-muted-foreground">自定义参数</h5>
                                        {customKeys.map((customKey) => (
                                          <div key={customKey} className="flex gap-3 items-end p-2 bg-background rounded-md border">
                                            <div className="flex-1 space-y-1">
                                              <label className="text-xs text-muted-foreground">参数名</label>
                                              <div className="font-mono text-sm px-2 py-1 bg-muted rounded">{customKey}</div>
                                            </div>
                                            <div className="flex-1 space-y-1">
                                              <label className="text-xs text-muted-foreground">成本 (USD)</label>
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
                                        const name = prompt('输入自定义参数名 (英文, 如 reasoning_output)');
                                        if (!name) return;
                                        if (!name.match(/^[a-z_][a-z0-9_]*$/)) {
                                          toast({ variant: "destructive", title: "参数名格式错误", description: "仅支持小写字母、数字和下划线" });
                                          return;
                                        }
                                        if (name in PRESET_COST_DIMENSIONS || (costs[name] !== undefined)) {
                                          toast({ variant: "destructive", title: "参数名已存在" });
                                          return;
                                        }
                                        setModelCosts(prev => {
                                          const updated = { ...prev };
                                          updated[modelName] = { ...(updated[modelName] || {}), [name]: 0 };
                                          return updated;
                                        });
                                      }}
                                    >
                                      <Plus className="mr-1 h-3 w-3" /> 添加自定义成本参数
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

                <Card className="border-0 shadow-none">
                  <CardHeader className="px-0">
                    <CardTitle>连接与认证</CardTitle>
                    <CardDescription>配置 API 密钥和高级选项。</CardDescription>
                  </CardHeader>
                  <CardContent className="px-0 space-y-4">
                    <FormField
                      control={form.control}
                      name="base_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>基础 URL (选填)</FormLabel>
                          <FormControl>
                            <Input placeholder="例如 https://api.openai.com/v1" {...field} />
                          </FormControl>
                          <FormDescription>如果使用代理或自定义端点，请填写此项。</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="api_key"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>API 密钥 (选填)</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="sk-..." {...field} />
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
                          <FormLabel>高级配置 (JSON)</FormLabel>
                          <FormControl>
                            {/* 移除了自动注入 model_tags 的行为，避免连接测试报错 */}
                            <Textarea 
                              rows={5} 
                              placeholder='{"timeout": 30, "max_retries": 3}' 
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

                <Card className="border-0 shadow-none">
                  <CardHeader className="px-0">
                    <CardTitle>状态设置</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 px-0">
                     <FormField
                      control={form.control}
                      name="is_active"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-background">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">启用状态</FormLabel>
                            <FormDescription>
                              禁用后将无法在系统中使用此供应商。
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={form.control}
                      name="is_default"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-background">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">默认供应商</FormLabel>
                            <FormDescription>
                              设为默认后将优先使用此供应商。
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
