'use client';

import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import useSWR, { mutate } from 'swr';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, Plug, X, ChevronDown, ChevronRight } from 'lucide-react';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

// 成本维度映射表 (避免 if-else)
const PRESET_COST_DIMENSIONS: Record<string, { label: string; unit: string }> = {
  input:        { label: '输入',     unit: 'USD/1M tokens' },
  text_output:  { label: '文本输出', unit: 'USD/1M tokens' },
  image_output: { label: '图片输出', unit: 'USD/1M tokens' },
  search:       { label: '搜索查询', unit: 'USD/次' },
};

const formSchema = z.object({
  name: z.string().min(1, "请输入名称"),
  provider_type: z.string().min(1, "请选择平台"),
  tags: z.array(z.string()).optional(), // Assuming simple array of strings for now, or comma separated? Original was select mode="tags"
  models: z.array(z.object({ value: z.string().min(1, "请输入模型名称") })).min(1, "至少需要一个模型"),
  base_url: z.string().optional(),
  api_key: z.string().optional(),
  config_json: z.string().refine((val) => {
    if (!val) return true;
    try {
      JSON.parse(val);
      return true;
    } catch (e) {
      return false;
    }
  }, "请输入有效的 JSON 格式").optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

type LLMProvider = {
  id: string;
  name: string;
  provider_type: string;
  models: string[];
  tags?: string[];
  is_active: boolean;
  is_default: boolean;
  base_url?: string;
  api_key?: string;
  config_json?: any;
  model_costs?: Record<string, Record<string, number>>;
};

export default function LLMPage() {
  const { data: providers, error, isLoading } = useSWR('/admin/llm-providers/', fetcher);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [modelCosts, setModelCosts] = useState<Record<string, Record<string, number>>>({});
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      provider_type: "",
      tags: [],
      models: [{ value: "" }],
      base_url: "",
      api_key: "",
      config_json: "{}",
      is_active: true,
      is_default: false,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "models",
  });

  const handleAdd = () => {
    setEditingProvider(null);
    setTagInput("");
    setModelCosts({});
    setExpandedModels({});
    form.reset({
      name: "",
      provider_type: "",
      tags: [],
      models: [{ value: "" }],
      base_url: "",
      api_key: "",
      config_json: "{}",
      is_active: true,
      is_default: false,
    });
    setIsModalOpen(true);
  };

  const handleEdit = (record: LLMProvider) => {
    setEditingProvider(record);
    setTagInput("");
    setModelCosts(record.model_costs || {});
    setExpandedModels({});
    form.reset({
      name: record.name,
      provider_type: record.provider_type,
      tags: record.tags || [],
      models: record.models.map(m => ({ value: m })),
      base_url: record.base_url || "",
      api_key: record.api_key || "",
      config_json: record.config_json && typeof record.config_json === 'object' ? JSON.stringify(record.config_json, null, 2) : (record.config_json || "{}"),
      is_active: record.is_active,
      is_default: record.is_default,
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/admin/llm-providers/${id}`);
      toast({
        title: "供应商删除成功",
      });
      mutate('/admin/llm-providers/');
    } catch (err) {
      toast({
        variant: "destructive",
        title: "删除失败",
      });
    }
  };

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
    try {
      const modelNames = values.models.map(m => m.value);
      // 清理 modelCosts 中不在 models 列表中的孤立数据
      const cleanedCosts: Record<string, Record<string, number>> = {};
      modelNames.forEach(name => {
        if (modelCosts[name]) {
          cleanedCosts[name] = modelCosts[name];
        }
      });

      const submitValues = {
        ...values,
        models: modelNames,
        config_json: JSON.parse(values.config_json || '{}'),
        model_costs: cleanedCosts,
      };

      if (editingProvider) {
        await api.put(`/admin/llm-providers/${editingProvider.id}`, submitValues);
        toast({ title: "供应商更新成功" });
      } else {
        await api.post('/admin/llm-providers/', submitValues);
        toast({ title: "供应商创建成功" });
      }
      setIsModalOpen(false);
      mutate('/admin/llm-providers/');
    } catch (err) {
      toast({
        variant: "destructive",
        title: "操作失败",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">AI 供应商</h2>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" /> 添加供应商
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>平台名称</TableHead>
              <TableHead>标签</TableHead>
              <TableHead>模型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>默认</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
               <TableRow>
                 <TableCell colSpan={7} className="h-24 text-center">
                   加载中...
                 </TableCell>
               </TableRow>
            ) : providers?.map((provider: LLMProvider) => (
              <TableRow key={provider.id}>
                <TableCell className="font-medium">{provider.name}</TableCell>
                <TableCell><Badge variant="secondary">{provider.provider_type}</Badge></TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {provider.tags?.map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {provider.models?.map(model => (
                      <Badge key={model} variant="outline" className="text-xs">{model}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={provider.is_active ? "default" : "destructive"}>
                    {provider.is_active ? '启用' : '禁用'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {provider.is_default && <Badge variant="secondary">默认</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(provider)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>确认删除？</AlertDialogTitle>
                          <AlertDialogDescription>
                            此操作不可撤销。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(provider.id)}>确认删除</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProvider ? "编辑供应商" : "添加供应商"}</DialogTitle>
            <DialogDescription>
              配置 LLM 供应商参数
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>名称</FormLabel>
                      <FormControl>
                        <Input placeholder="输入名称" {...field} />
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
                      <FormLabel>平台名称</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="选择平台" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="azure">Azure</SelectItem>
                          <SelectItem value="dashscope">Dashscope</SelectItem>
                          <SelectItem value="anthropic">Anthropic</SelectItem>
                          <SelectItem value="gemini">Gemini</SelectItem>
                          <SelectItem value="deepseek">DeepSeek</SelectItem>
                          <SelectItem value="minimax">MiniMax</SelectItem>
                          <SelectItem value="xai">xAI (Grok)</SelectItem>
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
                              // 当输入框为空且按删除键时，删除最后一个标签
                              const newTags = [...(field.value || [])];
                              newTags.pop();
                              field.onChange(newTags);
                            }
                          }}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>模型列表</FormLabel>
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2">
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => append({ value: "" })}
                >
                  <Plus className="mr-2 h-4 w-4" /> 添加模型
                </Button>
                {form.formState.errors.models?.message && (
                  <p className="text-sm font-medium text-destructive">{String(form.formState.errors.models.message)}</p>
                )}
              </div>

              {/* 模型成本配置 */}
              {fields.length > 0 && fields.some(f => form.getValues(`models.${fields.indexOf(f)}.value`)) && (
                <div className="space-y-2">
                  <FormLabel>模型成本配置 (选填)</FormLabel>
                  <p className="text-xs text-muted-foreground mb-2">为每个模型输入 API 成本 (USD)，用于智能体定价时参考。</p>
                  {fields.map((field, index) => {
                    const modelName = form.watch(`models.${index}.value`);
                    if (!modelName) return null;
                    const isExpanded = expandedModels[modelName] || false;
                    const costs = modelCosts[modelName] || {};
                    const customKeys = Object.keys(costs).filter(k => !(k in PRESET_COST_DIMENSIONS));

                    return (
                      <div key={field.id + '-cost'} className="rounded-lg border p-3">
                        <button
                          type="button"
                          className="flex items-center gap-2 w-full text-left text-sm font-medium"
                          onClick={() => setExpandedModels(prev => ({ ...prev, [modelName]: !prev[modelName] }))}
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <span className="font-mono">{modelName}</span>
                          {Object.keys(costs).length > 0 && (
                            <Badge variant="secondary" className="ml-auto text-xs">
                              {Object.keys(costs).length} 项
                            </Badge>
                          )}
                        </button>
                        {isExpanded && (
                          <div className="mt-3 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              {Object.entries(PRESET_COST_DIMENSIONS).map(([dimKey, dimConfig]) => (
                                <div key={dimKey} className="space-y-1">
                                  <label className="text-xs text-muted-foreground">{dimConfig.label} ({dimConfig.unit})</label>
                                  <Input
                                    type="number"
                                    step="0.001"
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
                                    className="font-mono h-8"
                                  />
                                </div>
                              ))}
                            </div>
                            {/* 自定义参数 */}
                            {customKeys.map((customKey) => (
                              <div key={customKey} className="flex gap-2 items-end">
                                <div className="flex-1 space-y-1">
                                  <label className="text-xs text-muted-foreground">参数名</label>
                                  <Input value={customKey} disabled className="font-mono h-8" />
                                </div>
                                <div className="flex-1 space-y-1">
                                  <label className="text-xs text-muted-foreground">成本 (USD)</label>
                                  <Input
                                    type="number"
                                    step="0.001"
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
                                  className="h-8 w-8 shrink-0"
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
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const name = prompt('输入自定义参数名 (英文, 如 reasoning_output)');
                                if (!name || !name.match(/^[a-z_][a-z0-9_]*$/)) {
                                  if (name) toast({ variant: "destructive", title: "参数名格式错误", description: "仅支持小写字母、数字和下划线" });
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
                              <Plus className="mr-1 h-3 w-3" /> 添加自定义参数
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <FormField
                control={form.control}
                name="base_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>基础 URL (选填)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
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
                      <Input type="password" {...field} />
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
                    <FormLabel>配置 JSON</FormLabel>
                    <FormControl>
                      <Textarea rows={4} placeholder='{"timeout": 30}' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-4">
                 <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm flex-1">
                      <div className="space-y-0.5">
                        <FormLabel>启用</FormLabel>
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
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm flex-1">
                      <div className="space-y-0.5">
                        <FormLabel>默认</FormLabel>
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
              </div>

              <div className="flex justify-between pt-4">
                 <Button type="button" variant="outline" onClick={handleTestConnection} disabled={isTesting}>
                    {isTesting ? <div className="animate-spin mr-2">C</div> : <Plug className="mr-2 h-4 w-4" />}
                    测试连接
                 </Button>
                 <Button type="submit">保存</Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
