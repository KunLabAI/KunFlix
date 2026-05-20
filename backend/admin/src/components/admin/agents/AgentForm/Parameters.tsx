import React, { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ExternalLink, HelpCircle } from 'lucide-react';
import { LLMProvider } from '@/types';
import { getModelDisplayName } from '@/lib/api-utils';
import api from '@/lib/axios';

// 定价维度显示映射（只读展示用，表驱动避免 if-else）
const PRICING_DIMENSION_LABELS: Record<string, { labelKey: string; unitKey: string; costUnitKey: string }> = {
  input: { labelKey: 'agents.form.parameters.costDimensions.input', unitKey: 'agents.form.parameters.units.per_1m', costUnitKey: 'agents.form.parameters.costUnits.per_1m' },
  text_output: { labelKey: 'agents.form.parameters.costDimensions.text_output', unitKey: 'agents.form.parameters.units.per_1m', costUnitKey: 'agents.form.parameters.costUnits.per_1m' },
  image_output: { labelKey: 'agents.form.parameters.costDimensions.image_output', unitKey: 'agents.form.parameters.units.per_1m', costUnitKey: 'agents.form.parameters.costUnits.per_1m' },
  search: { labelKey: 'agents.form.parameters.costDimensions.search', unitKey: 'agents.form.parameters.units.per_query', costUnitKey: 'agents.form.parameters.costUnits.per_query' },
  image_generation: { labelKey: 'agents.form.parameters.costDimensions.image_generation', unitKey: 'agents.form.parameters.units.per_image', costUnitKey: 'agents.form.parameters.costUnits.per_image' },
  video_input_image: { labelKey: 'agents.form.parameters.costDimensions.video_input_image', unitKey: 'agents.form.parameters.units.per_image', costUnitKey: 'agents.form.parameters.costUnits.per_image' },
  video_input_second: { labelKey: 'agents.form.parameters.costDimensions.video_input_second', unitKey: 'agents.form.parameters.units.per_second', costUnitKey: 'agents.form.parameters.costUnits.per_second' },
  video_output_480p: { labelKey: 'agents.form.parameters.costDimensions.video_output_480p', unitKey: 'agents.form.parameters.units.per_second', costUnitKey: 'agents.form.parameters.costUnits.per_second' },
  video_output_720p: { labelKey: 'agents.form.parameters.costDimensions.video_output_720p', unitKey: 'agents.form.parameters.units.per_second', costUnitKey: 'agents.form.parameters.costUnits.per_second' },
  audio_generation: { labelKey: 'agents.form.parameters.costDimensions.audio_generation', unitKey: 'agents.form.parameters.units.per_second', costUnitKey: 'agents.form.parameters.costUnits.per_second' },
};

// 二级分组小标题（板块内的子区块视觉分隔）
// 描述以帮助图标呈现，hover 显示 tooltip
const SubGroup: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  first?: boolean;
}> = ({ title, description, action, children, first }) => (
  <div className={first ? '' : 'pt-5 mt-5 border-t'}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 min-w-0">
        <Label className="text-sm font-medium">{title}</Label>
        {description && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground transition-colors shrink-0" aria-label={description}>
                  <HelpCircle className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs leading-relaxed">{description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    {children}
  </div>
);

interface ParamsProps {
  disabled?: boolean;
}

interface PricingProps extends ParamsProps {
  providers?: LLMProvider[];
}

// ============================================================================
// 1. 生成参数：思考模式 / 上下文窗口 / 温度
// ============================================================================
export const GenerationParams: React.FC<ParamsProps> = ({ disabled }) => {
  const { control } = useFormContext();
  const { t } = useTranslation();

  return (
    <div className="space-y-0">
      {/* 思考模式 */}
      <SubGroup
        title={t('agents.form.parameters.thinkingMode')}
        description={t('agents.form.parameters.thinkingModeDesc')}
        first
        action={
          <FormField
            control={control}
            name="thinking_mode"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />
                </FormControl>
              </FormItem>
            )}
          />
        }
      />

      {/* 上下文窗口 */}
      <SubGroup title={t('agents.form.parameters.contextWindow')}>
        <FormField
          control={control}
          name="context_window"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="flex items-center gap-4">
                  <Slider
                    min={4096}
                    max={1048576}
                    step={4096}
                    value={[field.value ?? 4096]}
                    onValueChange={(vals) => field.onChange(vals[0])}
                    disabled={disabled}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={field.value ?? 4096}
                    onChange={e => {
                      const val = e.target.value;
                      field.onChange(val === '' ? 4096 : Number(val));
                    }}
                    step={4096}
                    min={4096}
                    max={1048576}
                    className="w-24 font-mono"
                    disabled={disabled}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{t('agents.form.parameters.contextWindowMin')}</span>
          <span>{t('agents.form.parameters.contextWindowMax')}</span>
        </div>
      </SubGroup>

      {/* 温度 */}
      <SubGroup title={t('agents.form.parameters.temperature')}>
        <FormField
          control={control}
          name="temperature"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="flex items-center gap-4">
                  <Slider
                    min={0}
                    max={1}
                    step={0.1}
                    value={[field.value]}
                    onValueChange={(vals) => field.onChange(vals[0])}
                    disabled={disabled}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={field.value}
                    onChange={e => field.onChange(Number(e.target.value))}
                    step={0.1}
                    min={0}
                    max={1}
                    className="w-16 font-mono"
                    disabled={disabled}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{t('agents.form.parameters.temperatureLow')}</span>
          <span>{t('agents.form.parameters.temperatureHigh')}</span>
        </div>
      </SubGroup>
    </div>
  );
};

// ============================================================================
// 2. 会话管理：上下文压缩 / 标题生成 / 工具调用轮次上限
// ============================================================================
export const SessionManagement: React.FC<PricingProps> = ({ disabled, providers }) => {
  const { control, watch, setValue } = useFormContext();
  const { t } = useTranslation();
  const compactionEnabled = watch('compaction_config.enabled');
  const compactionProviderId = watch('compaction_config.provider_id');
  const titleGenEnabled = watch('title_gen_config.enabled');
  const titleGenProviderId = watch('title_gen_config.provider_id');

  // 压缩供应商的模型列表
  const compactionModelList = useMemo(() => {
    const p = providers?.find(pr => pr.id === compactionProviderId);
    const models = p
      ? (Array.isArray(p.models) ? p.models : (p.models || '').split(',').map((s: string) => s.trim()).filter(Boolean))
      : [];
    return models.map((m: string) => ({
      value: m,
      displayName: getModelDisplayName(m, p?.model_metadata),
    }));
  }, [compactionProviderId, providers]);

  // 标题生成供应商的模型列表
  const titleGenModelList = useMemo(() => {
    const p = providers?.find(pr => pr.id === titleGenProviderId);
    const models = p
      ? (Array.isArray(p.models) ? p.models : (p.models || '').split(',').map((s: string) => s.trim()).filter(Boolean))
      : [];
    return models.map((m: string) => ({
      value: m,
      displayName: getModelDisplayName(m, p?.model_metadata),
    }));
  }, [titleGenProviderId, providers]);

  return (
    <div className="space-y-0">
      {/* 上下文压缩 */}
      <SubGroup
        title={t('agents.form.parameters.compaction.title')}
        description={t('agents.form.parameters.compaction.desc')}
        first
        action={
          <FormField
            control={control}
            name="compaction_config.enabled"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />
                </FormControl>
              </FormItem>
            )}
          />
        }
      >
        {compactionEnabled && (
          <div className="space-y-4">
            {/* 压缩供应商 */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('agents.form.parameters.compaction.compactionProvider')}</Label>
              <FormField
                control={control}
                name="compaction_config.provider_id"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Select
                        value={field.value || '_fallback'}
                        onValueChange={(val) => {
                          field.onChange(val === '_fallback' ? '' : val);
                          setValue('compaction_config.model', '');
                        }}
                        disabled={disabled}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder={t('agents.form.parameters.compaction.selectProvider')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_fallback">{t('agents.form.parameters.compaction.useDefault')}</SelectItem>
                          {providers?.filter(p => p.is_active).map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name} ({p.provider_type})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* 压缩模型 */}
            {compactionProviderId && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('agents.form.parameters.compaction.compactionModel')}</Label>
                <FormField
                  control={control}
                  name="compaction_config.model"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Select value={field.value || ''} onValueChange={field.onChange} disabled={disabled}>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder={t('agents.form.parameters.compaction.selectModel')} />
                          </SelectTrigger>
                          <SelectContent>
                            {compactionModelList.map((m) => (
                              <SelectItem key={m.value} value={m.value}>{m.displayName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* 阈值设置 */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={control}
                name="compaction_config.compact_ratio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">
                      {t('agents.form.parameters.compaction.compactRatio', { percent: Math.round((field.value ?? 0.75) * 100) })}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0.5} max={0.95} step={0.05}
                        value={field.value ?? 0.75}
                        onChange={e => field.onChange(Number(e.target.value))}
                        className="font-mono"
                        disabled={disabled}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="compaction_config.reserve_ratio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">
                      {t('agents.form.parameters.compaction.reserveRatio', { percent: Math.round((field.value ?? 0.15) * 100) })}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0.05} max={0.4} step={0.05}
                        value={field.value ?? 0.15}
                        onChange={e => field.onChange(Number(e.target.value))}
                        className="font-mono"
                        disabled={disabled}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={control}
                name="compaction_config.tool_old_threshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">{t('agents.form.parameters.compaction.toolOldThreshold')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={100} max={5000} step={100}
                        value={field.value ?? 500}
                        onChange={e => field.onChange(Number(e.target.value))}
                        className="font-mono"
                        disabled={disabled}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="compaction_config.tool_recent_n"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">{t('agents.form.parameters.compaction.toolRecentN')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1} max={20} step={1}
                        value={field.value ?? 5}
                        onChange={e => field.onChange(Number(e.target.value))}
                        className="font-mono"
                        disabled={disabled}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={control}
              name="compaction_config.max_summary_tokens"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">{t('agents.form.parameters.compaction.maxSummaryTokens')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={4096} max={131072} step={1024}
                      value={field.value ?? 4096}
                      onChange={e => field.onChange(Number(e.target.value))}
                      className="font-mono"
                      disabled={disabled}
                    />
                  </FormControl>
                  <p className="text-[11px] text-muted-foreground">{t('agents.form.parameters.compaction.maxSummaryTokensDesc')}</p>
                </FormItem>
              )}
            />
          </div>
        )}
      </SubGroup>

      {/* 标题自动生成 */}
      <SubGroup
        title={t('agents.form.parameters.titleGen.title')}
        description={t('agents.form.parameters.titleGen.desc')}
        action={
          <FormField
            control={control}
            name="title_gen_config.enabled"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} disabled={disabled} />
                </FormControl>
              </FormItem>
            )}
          />
        }
      >
        {titleGenEnabled && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('agents.form.parameters.titleGen.titleGenProvider')}</Label>
              <FormField
                control={control}
                name="title_gen_config.provider_id"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Select
                        value={field.value || '_fallback'}
                        onValueChange={(val) => {
                          field.onChange(val === '_fallback' ? '' : val);
                          setValue('title_gen_config.model', '');
                        }}
                        disabled={disabled}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder={t('agents.form.parameters.titleGen.selectProvider')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_fallback">{t('agents.form.parameters.titleGen.useDefault')}</SelectItem>
                          {providers?.filter(p => p.is_active).map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name} ({p.provider_type})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {titleGenProviderId && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('agents.form.parameters.titleGen.titleGenModel')}</Label>
                <FormField
                  control={control}
                  name="title_gen_config.model"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Select value={field.value || ''} onValueChange={field.onChange} disabled={disabled}>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder={t('agents.form.parameters.titleGen.selectModel')} />
                          </SelectTrigger>
                          <SelectContent>
                            {titleGenModelList.map((m) => (
                              <SelectItem key={m.value} value={m.value}>{m.displayName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={control}
              name="title_gen_config.max_length"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">{t('agents.form.parameters.titleGen.maxLength')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={8} max={50} step={1}
                      value={field.value ?? 20}
                      onChange={e => field.onChange(Number(e.target.value))}
                      className="font-mono"
                      disabled={disabled}
                    />
                  </FormControl>
                  <p className="text-[11px] text-muted-foreground">{t('agents.form.parameters.titleGen.maxLengthDesc')}</p>
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="title_gen_config.trigger_rounds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">{t('agents.form.parameters.titleGen.triggerRounds')}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1} max={10} step={1}
                      value={field.value ?? 1}
                      onChange={e => field.onChange(Number(e.target.value))}
                      className="font-mono"
                      disabled={disabled}
                    />
                  </FormControl>
                  <p className="text-[11px] text-muted-foreground">{t('agents.form.parameters.titleGen.triggerRoundsDesc')}</p>
                </FormItem>
              )}
            />
          </div>
        )}
      </SubGroup>

      {/* 工具调用轮次上限 */}
      <SubGroup
        title={t('agents.form.parameters.maxToolRounds.title')}
        description={t('agents.form.parameters.maxToolRounds.desc')}
      >
        <FormField
          control={control}
          name="max_tool_rounds"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="flex items-center gap-4">
                  <Slider
                    min={10}
                    max={200}
                    step={10}
                    value={[field.value ?? 100]}
                    onValueChange={(vals) => field.onChange(vals[0])}
                    disabled={disabled}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={field.value ?? 100}
                    onChange={e => {
                      const val = e.target.value;
                      const num = val === '' ? 100 : Number(val);
                      field.onChange(Math.max(10, Math.min(200, num)));
                    }}
                    step={10}
                    min={10}
                    max={200}
                    className="w-20 font-mono"
                    disabled={disabled}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>{t('agents.form.parameters.maxToolRounds.min')}</span>
          <span>{t('agents.form.parameters.maxToolRounds.max')}</span>
        </div>
      </SubGroup>
    </div>
  );
};

// ============================================================================
// 3. 计费定价（只读概览）：实际定价在「计费定价」独立菜单统一维护
// ============================================================================
interface PricingDimensionRow {
  key: string;
  apiCost?: number;       // USD
  creditPrice?: number;   // 积分卖价
}

export const PricingOverview: React.FC<PricingProps> = ({ disabled, providers }) => {
  const { watch } = useFormContext();
  const { t } = useTranslation();
  const providerId = watch('provider_id');
  const model = watch('model');

  const currentProvider = useMemo(
    () => providers?.find(p => p.id === providerId),
    [providerId, providers]
  );
  const modelCosts: Record<string, number> = currentProvider?.model_costs?.[model] ?? {};

  const [pricing, setPricing] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [pricingId, setPricingId] = useState<string | null>(null);

  // 拉取 (provider_id, model) 的积分卖价
  useEffect(() => {
    let cancelled = false;
    const fetchPricing = async () => {
      if (!providerId || !model) {
        setPricing(null);
        setPricingId(null);
        return;
      }
      setLoading(true);
      const params = { provider_id: providerId, model };
      const result = await api
        .get<any[]>('/admin/pricing', { params })
        .then(res => res.data)
        .catch(() => [] as any[]);
      if (cancelled) return;
      const item = (result || [])[0];
      setPricing(item?.dimensions ?? null);
      setPricingId(item?.id ?? null);
      setLoading(false);
    };
    fetchPricing();
    return () => { cancelled = true; };
  }, [providerId, model]);

  // 合并两侧维度（API 进价 ⊕ 积分卖价）
  const dimensions: PricingDimensionRow[] = useMemo(() => {
    const keys = new Set<string>([
      ...Object.keys(modelCosts || {}),
      ...Object.keys(pricing || {}),
    ]);
    return Array.from(keys)
      .filter(k => PRICING_DIMENSION_LABELS[k])
      .map(k => ({
        key: k,
        apiCost: modelCosts?.[k],
        creditPrice: pricing?.[k],
      }));
  }, [modelCosts, pricing]);

  const editHref = pricingId
    ? `/admin/pricing/${pricingId}`
    : (providerId && model ? `/admin/pricing/new?provider_id=${providerId}&model=${encodeURIComponent(model)}` : '/admin/pricing');

  return (
    <div>
      {/* 提示横幅 */}
      <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          {t('agents.form.parameters.pricing.managedHint', '积分卖价现由「计费定价」独立菜单按（供应商, 模型）统一维护。以下全量只读。')}
        </p>
      </div>

      {/* 当前计费概览 */}
      {(!providerId || !model) ? (
        <p className="text-xs text-muted-foreground">{t('agents.form.parameters.pricing.selectProviderModelFirst', '请先选择供应商与模型')}</p>
      ) : loading ? (
        <p className="text-xs text-muted-foreground">{t('common.loading', '加载中...')}</p>
      ) : dimensions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('agents.form.parameters.pricing.noPricing', '该模型尚未配置积分卖价，点击下方按钮前往计费定价页面创建。')}
        </p>
      ) : (
        <div className="space-y-1.5">
          {dimensions.map(d => {
            const meta = PRICING_DIMENSION_LABELS[d.key];
            const credits = d.creditPrice ?? 0;
            const revenueUsd = credits * 0.01;
            const margin = (d.apiCost && d.apiCost > 0) ? ((revenueUsd - d.apiCost) / d.apiCost * 100) : null;
            return (
              <div key={d.key} className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">{t(meta.labelKey)}</span>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-muted-foreground">
                    {d.apiCost != null ? `$${d.apiCost}` : '-'} → {d.creditPrice != null ? `${d.creditPrice}${t('agents.form.parameters.pricing.credits')}` : '-'}
                  </span>
                  {margin != null && (
                    <span className={
                      margin > 0 ? 'text-green-600 dark:text-green-400' :
                      margin < 0 ? 'text-red-600 dark:text-red-400' :
                      'text-yellow-600 dark:text-yellow-400'
                    }>
                      {margin > 0 ? '+' : ''}{margin.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 跳转计费定价页面 */}
      <div className="mt-4 pt-3 border-t flex justify-end">
        <Button asChild type="button" variant="outline" size="sm" disabled={disabled}>
          <Link href={editHref}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            {pricingId ? t('agents.form.parameters.pricing.gotoEdit', '前往编辑定价') : t('agents.form.parameters.pricing.gotoCreate', '前往计费定价')}
          </Link>
        </Button>
      </div>
    </div>
  );
};
