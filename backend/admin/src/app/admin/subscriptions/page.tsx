'use client';

import React, { useState, useMemo } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslation } from 'react-i18next';
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

// 基准积分成本（1 积分 = $0.01 USD）
const CREDIT_BASE_COST_USD = 0.01;

const BILLING_CYCLE_KEYS = ['monthly', 'yearly', 'lifetime'] as const;
type BillingCycleKey = typeof BILLING_CYCLE_KEYS[number];

function formatStorageQuota(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  return gb >= 1 ? `${gb} GB` : `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

export default function SubscriptionsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { plans, isLoading, mutate } = useSubscriptions();
  const { createPlan } = useCreatePlan();
  const { updatePlan } = useUpdatePlan();
  const { deletePlan } = useDeletePlan();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const formSchema = useMemo(() => z.object({
    name: z.string().min(1, t('subscriptions.validation.nameRequired')),
    description: z.string().optional(),
    price_usd: z.number().positive(t('subscriptions.validation.pricePositive')),
    credits: z.number().positive(t('subscriptions.validation.creditsPositive')),
    billing_period: z.enum(['monthly', 'yearly', 'lifetime']),
    storage_quota_gb: z.number().min(0.1, t('subscriptions.validation.storagePositive')),
    features: z.array(z.object({ value: z.string().min(1, t('subscriptions.validation.featureRequired')) })),
    is_active: z.boolean(),
    sort_order: z.number().int().min(0),
  }), [t]);

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      price_usd: 9.99,
      credits: 1000,
      billing_period: 'monthly',
      storage_quota_gb: 2,
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

  const unitPrice = watchCredits > 0 ? watchPrice / watchCredits : 0;
  const baseCost = watchCredits * CREDIT_BASE_COST_USD;
  const profitMargin = baseCost > 0 ? ((watchPrice - baseCost) / baseCost * 100) : 0;

  const getCycleLabel = (key: string) =>
    BILLING_CYCLE_KEYS.includes(key as BillingCycleKey) ? t(`subscriptions.billingCycle.${key}`) : key;

  const handleAdd = () => {
    setEditing(null);
    form.reset({
      name: '',
      description: '',
      price_usd: 9.99,
      credits: 1000,
      billing_period: 'monthly',
      storage_quota_gb: 2,
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
      storage_quota_gb: (plan.storage_quota_bytes || 2147483648) / (1024 ** 3),
      features: plan.features.map(f => ({ value: f })),
      is_active: plan.is_active,
      sort_order: plan.sort_order,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (plan: SubscriptionPlan) => {
    try {
      await deletePlan(plan.id);
      toast({ title: t('subscriptions.toast.deleteSuccess'), description: t('subscriptions.toast.deleteSuccessDesc', { name: plan.name }) });
      mutate();
    } catch {
      toast({ title: t('subscriptions.toast.deleteFailed'), variant: 'destructive' });
    }
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        features: values.features.map(f => f.value),
        storage_quota_bytes: Math.round(values.storage_quota_gb * 1024 ** 3),
      };
      delete (payload as any).storage_quota_gb;

      editing
        ? await updatePlan(editing.id, payload)
        : await createPlan(payload);

      toast({ title: editing ? t('subscriptions.toast.updateSuccess') : t('subscriptions.toast.createSuccess') });
      setDialogOpen(false);
      mutate();
    } catch (err: any) {
      toast({
        title: editing ? t('subscriptions.toast.updateFailed') : t('subscriptions.toast.createFailed'),
        description: err?.response?.data?.detail ?? t('subscriptions.toast.retryLater'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('subscriptions.title')}</h2>
          <p className="text-muted-foreground text-sm mt-1">{t('subscriptions.subtitle')}</p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" /> {t('subscriptions.newPlan')}
        </Button>
      </div>

      <div className="rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">{t('subscriptions.table.order')}</TableHead>
              <TableHead>{t('subscriptions.table.name')}</TableHead>
              <TableHead>{t('subscriptions.table.billingCycle')}</TableHead>
              <TableHead className="text-right">{t('subscriptions.table.price')}</TableHead>
              <TableHead className="text-right">{t('subscriptions.table.credits')}</TableHead>
              <TableHead className="text-right">{t('subscriptions.table.storage')}</TableHead>
              <TableHead className="text-right">{t('subscriptions.table.unitPrice')}</TableHead>
              <TableHead className="text-right">{t('subscriptions.table.margin')}</TableHead>
              <TableHead>{t('subscriptions.table.status')}</TableHead>
              <TableHead className="w-24">{t('subscriptions.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">{t('subscriptions.table.loading')}</TableCell>
              </TableRow>
            )}
            {!isLoading && (!plans || plans.length === 0) && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">{t('subscriptions.table.empty')}</TableCell>
              </TableRow>
            )}
            {plans?.map((plan) => {
              const credits = Number(plan.credits || 0);
              const up = credits > 0 ? plan.price_usd / credits : 0;
              const bc = credits * CREDIT_BASE_COST_USD;
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
                    <Badge variant="outline">{getCycleLabel(plan.billing_period)}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">${plan.price_usd.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{plan.credits.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatStorageQuota(plan.storage_quota_bytes || 2147483648)}</TableCell>
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
                      {plan.is_active ? t('subscriptions.status.active') : t('subscriptions.status.inactive')}
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
                            <AlertDialogTitle>{t('subscriptions.delete.title')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('subscriptions.delete.description', { name: plan.name })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('subscriptions.delete.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(plan)}>{t('subscriptions.delete.confirm')}</AlertDialogAction>
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
            <DialogTitle>{editing ? t('subscriptions.dialog.editTitle') : t('subscriptions.dialog.createTitle')}</DialogTitle>
            <DialogDescription>
              {editing ? t('subscriptions.dialog.editDescription') : t('subscriptions.dialog.createDescription')}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('subscriptions.form.name')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('subscriptions.form.namePlaceholder')} {...field} />
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
                    <FormLabel>{t('subscriptions.form.description')}</FormLabel>
                    <FormControl>
                      <Textarea placeholder={t('subscriptions.form.descriptionPlaceholder')} rows={2} {...field} />
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
                      <FormLabel>{t('subscriptions.form.price')}</FormLabel>
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
                      <FormLabel>{t('subscriptions.form.credits')}</FormLabel>
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
                  <span className="text-muted-foreground">{t('subscriptions.metrics.unitPrice')}</span>
                  <span className="font-mono">{t('subscriptions.metrics.unitPriceValue', { value: unitPrice.toFixed(4) })}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t('subscriptions.metrics.baseCost')}</span>
                  <span className="font-mono">{t('subscriptions.metrics.baseCostValue', { value: baseCost.toFixed(2) })}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{t('subscriptions.metrics.margin')}</span>
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
                      <FormLabel>{t('subscriptions.form.billingCycle')}</FormLabel>
                      <FormControl>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BILLING_CYCLE_KEYS.map((key) => (
                              <SelectItem key={key} value={key}>{t(`subscriptions.billingCycle.${key}`)}</SelectItem>
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
                      <FormLabel>{t('subscriptions.form.sortOrder')}</FormLabel>
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

              <FormField
                control={form.control}
                name="storage_quota_gb"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('subscriptions.form.storageQuota')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step={0.5}
                        min={0.1}
                        value={field.value}
                        onChange={e => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 特性列表 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <FormLabel>{t('subscriptions.form.features')}</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => append({ value: '' })}
                  >
                    <Plus className="mr-1 h-3 w-3" /> {t('subscriptions.form.featureAdd')}
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
                              <Input placeholder={t('subscriptions.form.featurePlaceholder')} {...inputField} />
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
                    <p className="text-xs text-muted-foreground text-center py-2">{t('subscriptions.form.featuresEmpty')}</p>
                  )}
                </div>
              </div>

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>{t('subscriptions.form.isActive')}</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('subscriptions.form.cancel')}</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? t('subscriptions.form.submitting') : (editing ? t('subscriptions.form.save') : t('subscriptions.form.create'))}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
