'use client';

import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { SubscriptionPlan } from '@/types';
import {
  useSubscriptions,
  useCreatePlan,
  useUpdatePlan,
  useDeletePlan,
} from '@/hooks/useSubscriptions';

// 计费周期映射表（避免 if-else）
const BILLING_PERIODS: Record<string, { label: string; short: string }> = {
  monthly: { label: '月付', short: '月' },
  yearly: { label: '年付', short: '年' },
  lifetime: { label: '终身', short: '终身' },
};

// 基准积分成本（1 积分 = $0.01 USD）
const CREDIT_BASE_COST_USD = 0.01;

const formSchema = z.object({
  name: z.string().min(1, '请输入套餐名称'),
  description: z.string().optional(),
  price_usd: z.number().positive('价格必须大于 0'),
  credits: z.number().positive('积分数量必须大于 0'),
  billing_period: z.enum(['monthly', 'yearly', 'lifetime']),
  features: z.array(z.object({ value: z.string().min(1, '请输入特性描述') })),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0),
});

type FormValues = z.infer<typeof formSchema>;

export default function SubscriptionsPage() {
  const { toast } = useToast();
  const { plans, isLoading, mutate } = useSubscriptions();
  const { createPlan } = useCreatePlan();
  const { updatePlan } = useUpdatePlan();
  const { deletePlan } = useDeletePlan();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      price_usd: 9.99,
      credits: 1000,
      billing_period: 'monthly',
      features: [],
      is_active: true,
      sort_order: 0,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'features',
  });

  const watchPrice = form.watch('price_usd');
  const watchCredits = form.watch('credits');

  // 自动计算指标
  const unitPrice = watchCredits > 0 ? watchPrice / watchCredits : 0;
  const baseCost = watchCredits * CREDIT_BASE_COST_USD;
  const profitMargin = baseCost > 0 ? ((watchPrice - baseCost) / baseCost * 100) : 0;

  const handleAdd = () => {
    setEditing(null);
    form.reset({
      name: '',
      description: '',
      price_usd: 9.99,
      credits: 1000,
      billing_period: 'monthly',
      features: [],
      is_active: true,
      sort_order: (plans?.length ?? 0) * 10,
    });
    setDialogOpen(true);
  };

  const handleEdit = (plan: SubscriptionPlan) => {
    setEditing(plan);
    form.reset({
      name: plan.name,
      description: plan.description ?? '',
      price_usd: plan.price_usd,
      credits: plan.credits,
      billing_period: plan.billing_period,
      features: plan.features.map(f => ({ value: f })),
      is_active: plan.is_active,
      sort_order: plan.sort_order,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (plan: SubscriptionPlan) => {
    try {
      await deletePlan(plan.id);
      toast({ title: '删除成功', description: `套餐 "${plan.name}" 已删除。` });
      mutate();
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    }
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        features: values.features.map(f => f.value),
      };

      editing
        ? await updatePlan(editing.id, payload)
        : await createPlan(payload);

      toast({ title: editing ? '更新成功' : '创建成功' });
      setDialogOpen(false);
      mutate();
    } catch (err: any) {
      toast({
        title: editing ? '更新失败' : '创建失败',
        description: err?.response?.data?.detail ?? '请稍后再试',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">订阅套餐管理</h2>
          <p className="text-muted-foreground text-sm mt-1">管理用户订阅套餐和定价策略</p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" /> 新建套餐
        </Button>
      </div>

      <div className="rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">排序</TableHead>
              <TableHead>套餐名称</TableHead>
              <TableHead>计费周期</TableHead>
              <TableHead className="text-right">价格 (USD)</TableHead>
              <TableHead className="text-right">积分</TableHead>
              <TableHead className="text-right">单价 ($/积分)</TableHead>
              <TableHead className="text-right">利润率</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="w-24">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">加载中...</TableCell>
              </TableRow>
            )}
            {!isLoading && (!plans || plans.length === 0) && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">暂无套餐数据</TableCell>
              </TableRow>
            )}
            {plans?.map((plan) => {
              const up = plan.credits > 0 ? plan.price_usd / plan.credits : 0;
              const bc = plan.credits * CREDIT_BASE_COST_USD;
              const margin = bc > 0 ? ((plan.price_usd - bc) / bc * 100) : 0;
              return (
                <TableRow key={plan.id}>
                  <TableCell className="font-mono text-xs">{plan.sort_order}</TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium">{plan.name}</span>
                      {plan.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{plan.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{BILLING_PERIODS[plan.billing_period]?.label ?? plan.billing_period}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">${plan.price_usd.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{plan.credits.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs">${up.toFixed(4)}</TableCell>
                  <TableCell className="text-right">
                    <span className={
                      margin > 0 ? 'text-green-600 dark:text-green-400 font-medium' :
                      margin < 0 ? 'text-red-600 dark:text-red-400 font-medium' :
                      'text-yellow-600 dark:text-yellow-400'
                    }>
                      {margin > 0 ? '+' : ''}{margin.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={plan.is_active ? 'default' : 'secondary'}>
                      {plan.is_active ? '启用' : '停用'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(plan)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认删除</AlertDialogTitle>
                            <AlertDialogDescription>
                              确定要删除套餐 &quot;{plan.name}&quot; 吗？此操作不可撤销。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(plan)}>确认删除</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* 创建/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑套餐' : '新建套餐'}</DialogTitle>
            <DialogDescription>
              {editing ? '修改订阅套餐信息' : '创建新的订阅套餐'}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>套餐名称</FormLabel>
                    <FormControl>
                      <Input placeholder="例如：基础版" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>描述</FormLabel>
                    <FormControl>
                      <Textarea placeholder="套餐描述（可选）" rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price_usd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>价格 (USD)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step={0.01}
                          min={0.01}
                          value={field.value}
                          onChange={e => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="credits"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>积分数量</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step={1}
                          min={1}
                          value={field.value}
                          onChange={e => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* 自动计算指标 */}
              <div className="rounded-lg border p-3 bg-muted/50 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">单价</span>
                  <span className="font-mono">${unitPrice.toFixed(4)} / 积分</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">基准成本 (1积分=$0.01)</span>
                  <span className="font-mono">${baseCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">利润率</span>
                  <span className={
                    profitMargin > 0 ? 'text-green-600 dark:text-green-400 font-medium font-mono' :
                    profitMargin < 0 ? 'text-red-600 dark:text-red-400 font-medium font-mono' :
                    'text-yellow-600 dark:text-yellow-400 font-mono'
                  }>
                    {profitMargin > 0 ? '+' : ''}{profitMargin.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="billing_period"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>计费周期</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(BILLING_PERIODS).map(([key, val]) => (
                              <SelectItem key={key} value={key}>{val.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sort_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>排序</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step={1}
                          min={0}
                          value={field.value}
                          onChange={e => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* 特性列表 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <FormLabel>套餐特性</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => append({ value: '' })}
                  >
                    <Plus className="mr-1 h-3 w-3" /> 添加
                  </Button>
                </div>
                <div className="space-y-2">
                  {fields.map((field, index) => (
                    <FormField
                      key={field.id}
                      control={form.control}
                      name={`features.${index}.value`}
                      render={({ field: inputField }) => (
                        <FormItem>
                          <div className="flex items-center gap-2">
                            <FormControl>
                              <Input placeholder="例如：每月 1000 积分" {...inputField} />
                            </FormControl>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => remove(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                  {fields.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">暂无特性，点击"添加"按钮</p>
                  )}
                </div>
              </div>

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>启用</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? '提交中...' : (editing ? '保存' : '创建')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
