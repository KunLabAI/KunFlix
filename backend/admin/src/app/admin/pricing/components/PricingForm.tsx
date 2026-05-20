'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useTranslation } from 'react-i18next';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Save } from 'lucide-react';

// 全维度表（与后端 schemas.ModelPricingDimensions 对齐）
const ALL_DIMS = [
  { key: 'input', label: '文本输入', unit: 'credits / 1M tokens' },
  { key: 'text_output', label: '文本输出', unit: 'credits / 1M tokens' },
  { key: 'image_output', label: '图像输出（多模态）', unit: 'credits / 1M tokens' },
  { key: 'search', label: '搜索查询', unit: 'credits / query' },
  { key: 'image_generation', label: '图像生成', unit: 'credits / image' },
  { key: 'video_input_image', label: '视频首帧图片', unit: 'credits / image' },
  { key: 'video_input_second', label: '视频输入秒数', unit: 'credits / second' },
  { key: 'video_output_480p', label: '视频 480p 输出', unit: 'credits / second' },
  { key: 'video_output_720p', label: '视频 720p 输出', unit: 'credits / second' },
  { key: 'audio_generation', label: '音频生成', unit: 'credits / second' },
] as const;

const fetcher = (url: string) => api.get(url).then(r => r.data);

interface PricingFormProps {
  pricingId?: string;        // 编辑时传入
  initialProviderId?: string; // 新建时预填
  initialModel?: string;
}

export default function PricingForm({ pricingId, initialProviderId, initialModel }: PricingFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();

  const isEdit = !!pricingId;

  // 加载现有记录
  const { data: existing } = useSWR<any>(
    isEdit ? `/admin/pricing/${pricingId}` : null,
    fetcher,
  );

  // 加载所有供应商
  const { data: providers } = useSWR<any[]>('/admin/llm-providers/', fetcher);

  // 新建时加载已有定价列表，用于过滤已创建的 (provider, model) 组合
  const { data: existingPricings } = useSWR<any[]>(
    isEdit ? null : '/admin/pricing',
    fetcher,
  );

  // 表单状态
  const [providerId, setProviderId] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [dimensions, setDimensions] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<boolean>(false);

  // 初始化表单
  useEffect(() => {
    if (isEdit && existing) {
      setProviderId(existing.provider_id || '');
      setModel(existing.model || '');
      setIsActive(existing.is_active ?? true);
      setNotes(existing.notes || '');
      setDimensions({ ...(existing.dimensions || {}) });
      return;
    }
    if (!isEdit) {
      initialProviderId && setProviderId(initialProviderId);
      initialModel && setModel(initialModel);
    }
  }, [isEdit, existing, initialProviderId, initialModel]);

  // 当前供应商/模型的 API 进价
  const apiCosts: Record<string, number> = useMemo(() => {
    if (isEdit && existing?.api_costs) return existing.api_costs;
    const provider = providers?.find(p => p.id === providerId);
    const costs = provider?.model_costs?.[model] || {};
    return Object.fromEntries(
      Object.entries(costs).filter(([, v]) => typeof v === 'number'),
    ) as Record<string, number>;
  }, [isEdit, existing, providers, providerId, model]);

  const currentProvider = useMemo(
    () => providers?.find(p => p.id === providerId),
    [providers, providerId],
  );

  const modelOptions: string[] = useMemo(() => {
    const m = currentProvider?.models;
    const allModels: string[] = Array.isArray(m) ? m : (m || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    // 新建时过滤掉已存在定价的模型
    const usedModels = new Set(
      (existingPricings || [])
        .filter(p => p.provider_id === providerId)
        .map(p => p.model),
    );
    return isEdit ? allModels : allModels.filter(name => !usedModels.has(name));
  }, [currentProvider, existingPricings, providerId, isEdit]);

  const updateDim = (key: string, value: number | null) => {
    setDimensions(prev => {
      const next = { ...prev };
      value == null || Number.isNaN(value) ? delete next[key] : (next[key] = value);
      return next;
    });
  };

  // 倍率快速应用：apiCost * multiplier * 100 -> credits
  const [multiplier, setMultiplier] = useState<number>(1.5);
  const applyMultiplier = () => {
    const next: Record<string, number> = {};
    ALL_DIMS.forEach(d => {
      const cost = apiCosts[d.key];
      cost != null && (next[d.key] = Math.round(cost * multiplier * 100 * 100) / 100);
    });
    setDimensions(next);
    toast({ title: '已按倍率回填', description: `已根据 ${multiplier}x 设置 ${Object.keys(next).length} 个维度` });
  };

  const handleSave = async () => {
    if (!providerId || !model) {
      toast({ variant: 'destructive', title: '请选择供应商与模型' });
      return;
    }
    setSaving(true);
    const payload: any = {
      dimensions,
      is_active: isActive,
      notes: notes || null,
    };
    const result = await (isEdit
      ? api.put(`/admin/pricing/${pricingId}`, payload)
      : api.post('/admin/pricing', { ...payload, provider_id: providerId, model })
    ).then(r => ({ ok: true as const, data: r.data }))
      .catch((err: any) => ({ ok: false as const, error: err }));
    setSaving(false);

    result.ok || toast({
      variant: 'destructive',
      title: isEdit ? '更新失败' : '创建失败',
      description: result.error?.response?.data?.detail || result.error?.message || '未知错误',
    });
    result.ok && (toast({ title: isEdit ? '已更新' : '已创建' }), router.push('/admin/pricing'));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{isEdit ? '编辑计费定价' : '新建计费定价'}</h2>
          <p className="text-muted-foreground mt-1">为 (供应商, 模型) 配置积分卖价</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/admin/pricing')} disabled={saving}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            保存
          </Button>
        </div>
      </div>

      {/* 基本信息 */}
      <Card>
        <CardHeader><CardTitle className="text-base">基本信息</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>供应商</Label>
              <Select value={providerId} onValueChange={setProviderId} disabled={isEdit}>
                <SelectTrigger><SelectValue placeholder="选择供应商" /></SelectTrigger>
                <SelectContent>
                  {providers?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.provider_type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>模型</Label>
              <Select value={model} onValueChange={setModel} disabled={isEdit || !providerId}>
                <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
                <SelectContent>
                  {modelOptions.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label>启用（关闭后此 (供应商, 模型) 视为不计费）</Label>
          </div>
          <div className="space-y-2">
            <Label>备注</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="可选：定价依据、调整记录等" />
          </div>
        </CardContent>
      </Card>

      {/* 倍率快速回填 */}
      {Object.keys(apiCosts).length > 0 && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
          <CardContent className="pt-6 flex flex-wrap items-center gap-3">
            <Label className="text-sm">倍率回填（USD 进价 × 倍率 × 100 → credits）</Label>
            <Input
              type="number"
              value={multiplier}
              onChange={e => setMultiplier(Math.max(1.0, Number(e.target.value) || 1.0))}
              step={0.1}
              min={1.0}
              className="w-24 font-mono"
            />
            <span className="text-xs text-muted-foreground">×</span>
            <Button type="button" variant="outline" size="sm" onClick={applyMultiplier}>一键应用所有维度</Button>
            <p className="text-xs text-muted-foreground basis-full">
              提示：仅作用于已存在 API 进价的维度。1 USD ≈ 100 credits。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 维度积分卖价 */}
      <Card>
        <CardHeader><CardTitle className="text-base">维度积分卖价</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {ALL_DIMS.map(d => {
            const apiCost = apiCosts[d.key];
            const credits = dimensions[d.key];
            const revenueUsd = credits != null ? credits * 0.01 : null;
            const margin = (apiCost && apiCost > 0 && revenueUsd != null)
              ? ((revenueUsd - apiCost) / apiCost * 100) : null;
            return (
              <div key={d.key} className="grid grid-cols-12 gap-3 items-center py-2 border-b last:border-b-0">
                <div className="col-span-4">
                  <div className="text-sm font-medium">{d.label}</div>
                  <div className="text-xs text-muted-foreground">{d.unit}</div>
                </div>
                <div className="col-span-3 text-xs text-muted-foreground font-mono">
                  {apiCost != null ? `进价 $${apiCost}` : '-'}
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    value={credits ?? ''}
                    onChange={e => updateDim(d.key, e.target.value === '' ? null : Number(e.target.value))}
                    step={0.01}
                    min={0}
                    placeholder="未配置"
                    className="font-mono"
                  />
                </div>
                <div className="col-span-2 text-xs text-right font-mono">
                  {margin != null ? (
                    <span className={
                      margin > 0 ? 'text-green-600 dark:text-green-400' :
                      margin < 0 ? 'text-red-600 dark:text-red-400' :
                      'text-yellow-600 dark:text-yellow-400'
                    }>
                      {margin > 0 ? '+' : ''}{margin.toFixed(1)}%
                    </span>
                  ) : <span className="text-muted-foreground">-</span>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
