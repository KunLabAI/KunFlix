import React, { useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
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
import { LLMProvider } from '@/types';
import { getModelDisplayName } from '@/lib/api-utils';

// 积分定价维度映射表（避免 if-else），label/unit 改为 i18n key
const COST_DIMENSIONS = [
  { key: 'input', labelKey: 'agents.form.parameters.costDimensions.input', unitKey: 'agents.form.parameters.units.per_1m', costUnitKey: 'agents.form.parameters.costUnits.per_1m', formField: 'input_credit_per_1m', step: 0.01, group: 'base' },
  { key: 'text_output', labelKey: 'agents.form.parameters.costDimensions.text_output', unitKey: 'agents.form.parameters.units.per_1m', costUnitKey: 'agents.form.parameters.costUnits.per_1m', formField: 'output_credit_per_1m', step: 0.01, group: 'base' },
  { key: 'image_output', labelKey: 'agents.form.parameters.costDimensions.image_output', unitKey: 'agents.form.parameters.units.per_1m', costUnitKey: 'agents.form.parameters.costUnits.per_1m', formField: 'image_output_credit_per_1m', step: 0.01, group: 'gemini' },
  { key: 'search', labelKey: 'agents.form.parameters.costDimensions.search', unitKey: 'agents.form.parameters.units.per_query', costUnitKey: 'agents.form.parameters.costUnits.per_query', formField: 'search_credit_per_query', step: 0.1, group: 'gemini_search' },
  { key: 'image_generation', labelKey: 'agents.form.parameters.costDimensions.image_generation', unitKey: 'agents.form.parameters.units.per_image', costUnitKey: 'agents.form.parameters.costUnits.per_image', formField: 'image_credit_per_image', step: 0.1, group: 'image_gen' },
  { key: 'video_input_image', labelKey: 'agents.form.parameters.costDimensions.video_input_image', unitKey: 'agents.form.parameters.units.per_image', costUnitKey: 'agents.form.parameters.costUnits.per_image', formField: 'video_input_image_credit', step: 0.001, group: 'video' },
  { key: 'video_input_second', labelKey: 'agents.form.parameters.costDimensions.video_input_second', unitKey: 'agents.form.parameters.units.per_second', costUnitKey: 'agents.form.parameters.costUnits.per_second', formField: 'video_input_second_credit', step: 0.001, group: 'video' },
  { key: 'video_output_480p', labelKey: 'agents.form.parameters.costDimensions.video_output_480p', unitKey: 'agents.form.parameters.units.per_second', costUnitKey: 'agents.form.parameters.costUnits.per_second', formField: 'video_output_480p_credit', step: 0.001, group: 'video' },
  { key: 'video_output_720p', labelKey: 'agents.form.parameters.costDimensions.video_output_720p', unitKey: 'agents.form.parameters.units.per_second', costUnitKey: 'agents.form.parameters.costUnits.per_second', formField: 'video_output_720p_credit', step: 0.001, group: 'video' },
] as const;

// 维度组可见性规则映射（避免 if-else 分支）
const GROUP_VISIBILITY: Record<string, (ctx: { isGemini: boolean; searchEnabled: boolean; imageEnabled: boolean; agentType: string }) => boolean> = {
  base: () => true,
  gemini: ({ isGemini }) => isGemini,
  gemini_search: ({ isGemini, searchEnabled }) => isGemini && searchEnabled,
  image_gen: ({ imageEnabled }) => imageEnabled,
  video: ({ agentType }) => agentType === 'video',
};

interface ParametersProps {
  disabled?: boolean;
  providers?: LLMProvider[];
}

const Parameters: React.FC<ParametersProps> = ({ disabled, providers }) => {
  const { control, watch, setValue } = useFormContext();
  const { t } = useTranslation();
  const temperature = watch('temperature');
  const contextWindow = watch('context_window');
  const providerId = watch('provider_id');
  const model = watch('model');
  const searchEnabled = watch('gemini_config.google_search_enabled');
  const imageEnabled = watch('image_config.image_generation_enabled');
  const compactionEnabled = watch('compaction_config.enabled');
  const compactionProviderId = watch('compaction_config.provider_id');
  const [markupMultiplier, setMarkupMultiplier] = useState(1.5);

  // 当前选中的供应商
  const currentProvider = useMemo(() =>
    providers?.find(p => p.id === providerId),
    [providerId, providers]
  );

  // 供应商类型判断
  const providerType = currentProvider?.provider_type?.toLowerCase() || '';
  const isGeminiProvider = providerType === 'gemini';

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

  // 获取当前模型的 API 成本数据
  const modelCosts: Record<string, number> = currentProvider?.model_costs?.[model] ?? {};
  const hasAnyCost = Object.keys(modelCosts).length > 0;

  // 根据可见性规则过滤定价维度（映射表驱动，避免 if-else）
  const visibilityCtx = { isGemini: !!isGeminiProvider, searchEnabled: !!searchEnabled, imageEnabled: !!imageEnabled, agentType: watch('agent_type') || 'text' };
  const visibleDimensions = COST_DIMENSIONS.filter(
    dim => GROUP_VISIBILITY[dim.group]?.(visibilityCtx) ?? true
  );

  // 格式化显示 context_window (如 128K)
  const formatContextWindow = (value: number) => {
    return value >= 1048576 ? `${(value / 1048576).toFixed(1)}M` : value >= 1024 ? `${Math.round(value / 1024)}K` : value.toString();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5">
         <div className="flex justify-between items-center mb-4">
           <Label className="text-sm font-medium">{t('agents.form.parameters.thinkingMode')}</Label>
           <FormField
              control={control}
              name="thinking_mode"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={disabled}
                      />
                      <span className="text-xs text-muted-foreground">{field.value ? t('agents.form.parameters.on') : t('agents.form.parameters.off')}</span>
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />
         </div>
         <p className="text-xs text-muted-foreground">{t('agents.form.parameters.thinkingModeDesc')}</p>
      </div>

      <div className="rounded-xl border bg-card p-5">
         <div className="mb-4">
           <div className="flex justify-between items-center mb-2">
             <Label className="text-sm font-medium">{t('agents.form.parameters.contextWindow')}</Label>
             <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
               {t('agents.form.parameters.contextWindowValue', { display: formatContextWindow(contextWindow || 4096), tokens: contextWindow || 4096 })}
             </span>
           </div>
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
         </div>
      </div>

      {/* 上下文压缩配置 */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex justify-between items-center mb-2">
          <div>
            <Label className="text-sm font-medium">{t('agents.form.parameters.compaction.title')}</Label>
            <p className="text-xs text-muted-foreground mt-1">{t('agents.form.parameters.compaction.desc')}</p>
          </div>
          <FormField
            control={control}
            name="compaction_config.enabled"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={disabled}
                    />
                    <span className="text-xs text-muted-foreground">{field.value ? t('agents.form.parameters.compaction.on') : t('agents.form.parameters.compaction.off')}</span>
                  </div>
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {compactionEnabled && (
          <div className="space-y-4 pt-3 border-t mt-3">
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
      </div>

      {/* 工具调用轮次限制 */}
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <div>
              <Label className="text-sm font-medium">{t('agents.form.parameters.maxToolRounds.title')}</Label>
              <p className="text-xs text-muted-foreground mt-1">{t('agents.form.parameters.maxToolRounds.desc')}</p>
            </div>
            <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
              {watch('max_tool_rounds') ?? 100} {t('agents.form.parameters.maxToolRounds.times')}
            </span>
          </div>
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
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="flex justify-between items-center mb-4">
          <Label className="text-sm font-medium">{t('agents.form.parameters.temperature')}</Label>
          <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
             {temperature}
          </span>
        </div>
        
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
      </div>

      <div className="rounded-xl border bg-card p-5">
        <Label className="text-sm font-medium mb-2 block">{t('agents.form.parameters.pricing.title')}</Label>

        {/* 成本倍率 - 仅在有 API 成本数据时显示 */}
        {hasAnyCost && (
          <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <Label className="text-xs text-blue-700 dark:text-blue-300 whitespace-nowrap">{t('agents.form.parameters.pricing.markupMultiplier')}</Label>
            <Input
              type="number"
              value={markupMultiplier}
              onChange={e => setMarkupMultiplier(Math.max(1.0, Number(e.target.value) || 1.0))}
              step={0.1}
              min={1.0}
              className="w-20 font-mono"
              disabled={disabled}
            />
            <span className="text-xs text-blue-600 dark:text-blue-400 flex-shrink-0">×</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-7 flex-shrink-0"
              disabled={disabled}
              onClick={() => {
                visibleDimensions.forEach(dim => {
                  const cost = modelCosts[dim.key];
                  cost != null && setValue(dim.formField, Math.round(cost * markupMultiplier * 100 * 100) / 100);
                });
              }}
            >
              {t('agents.form.parameters.pricing.applyAll')}
            </Button>
          </div>
        )}

        {/* 动态渲染可见的定价维度（映射表驱动，避免 if-else） */}
        <div className="space-y-4">
          {visibleDimensions.map((dim) => {
            const apiCost = modelCosts[dim.key] as number | undefined;
            const suggestedCredit = apiCost != null ? Math.round(apiCost * markupMultiplier * 100 * 100) / 100 : undefined;
            return (
              <FormField
                key={dim.key}
                control={control}
                name={dim.formField}
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-xs text-muted-foreground">{t(dim.labelKey)} ({t(dim.unitKey)})</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          value={field.value ?? 0}
                          onChange={e => field.onChange(Number(e.target.value))}
                          step={dim.step}
                          min={0}
                          className="w-24 font-mono"
                          disabled={disabled}
                        />
                      </FormControl>
                    </div>
                    {apiCost != null && (
                      <div className="flex items-center justify-between mt-1 px-1">
                        <span className="text-xs text-blue-600 dark:text-blue-400">
                          {t('agents.form.parameters.pricing.apiCost', { cost: apiCost, unit: t(dim.costUnitKey) })}
                        </span>
                        <button
                          type="button"
                          className="text-xs text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-200 disabled:opacity-50"
                          onClick={() => setValue(dim.formField, suggestedCredit!)}
                          disabled={disabled}
                        >
                          {t('agents.form.parameters.pricing.suggestion', { value: suggestedCredit })}
                        </button>
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-3">{t('agents.form.parameters.pricing.freeDesc')}</p>

        {/* 利润概览 */}
        {hasAnyCost && (
          <div className="mt-4 pt-4 border-t">
            <Label className="text-xs font-medium mb-2 block text-muted-foreground">{t('agents.form.parameters.pricing.profitOverview')}</Label>
            <div className="space-y-1.5">
              {visibleDimensions.map(dim => {
                const apiCost = modelCosts[dim.key] as number | undefined;
                const creditRate = watch(dim.formField) ?? 0;
                const revenueUsd = creditRate * 0.01;
                const margin = apiCost && apiCost > 0 ? ((revenueUsd - apiCost) / apiCost * 100) : null;
                return apiCost != null ? (
                  <div key={dim.key} className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">{t(dim.labelKey)}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-mono">${apiCost} → {creditRate}{t('agents.form.parameters.pricing.credits')} → ${revenueUsd.toFixed(2)}</span>
                      <span className={
                        margin == null ? 'text-muted-foreground' :
                        margin > 0 ? 'text-green-600 dark:text-green-400 font-medium' :
                        margin < 0 ? 'text-red-600 dark:text-red-400 font-medium' :
                        'text-yellow-600 dark:text-yellow-400'
                      }>
                        {margin != null ? `${margin > 0 ? '+' : ''}${margin.toFixed(1)}%` : t('agents.form.parameters.pricing.naLabel')}
                      </span>
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Parameters;
