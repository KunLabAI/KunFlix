import React, { useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
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
} from "@/components/ui/select";
import { LLMProvider } from '@/types';

// Gemini 3.1 配置选项（使用映射表避免 if-else）
const THINKING_LEVELS = [
  { value: "high", label: "高 (High) - 深度推理" },
  { value: "medium", label: "中 (Medium) - 平衡" },
  { value: "low", label: "低 (Low) - 快速响应" },
  { value: "minimal", label: "最小 (Minimal) - 仅Flash支持" },
];

const MEDIA_RESOLUTIONS = [
  { value: "high", label: "高 - 图片1120 tokens" },
  { value: "medium", label: "中 - 图片560 tokens" },
  { value: "low", label: "低 - 图片280 tokens" },
  { value: "ultra_high", label: "超高 - 最高精度 (v1alpha)" },
];

const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9 (宽屏)" },
  { value: "4:3", label: "4:3 (标准)" },
  { value: "1:1", label: "1:1 (方形)" },
  { value: "3:4", label: "3:4 (竖屏)" },
  { value: "9:16", label: "9:16 (手机)" },
];

const IMAGE_SIZES = [
  { value: "auto", label: "自动" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K (最高质量)" },
];

// 积分定价维度映射表（避免 if-else）
const COST_DIMENSIONS = [
  { key: 'input', label: '输入价格', unit: '积分/1M tokens', costUnit: '/1M tokens', formField: 'input_credit_per_1m', step: 0.01, group: 'base' },
  { key: 'text_output', label: '输出价格', unit: '积分/1M tokens', costUnit: '/1M tokens', formField: 'output_credit_per_1m', step: 0.01, group: 'base' },
  { key: 'image_output', label: '图片输出价格', unit: '积分/1M tokens', costUnit: '/1M tokens', formField: 'image_output_credit_per_1m', step: 0.01, group: 'gemini' },
  { key: 'search', label: '搜索查询价格', unit: '积分/次', costUnit: '/次', formField: 'search_credit_per_query', step: 0.1, group: 'gemini_search' },
] as const;

// 维度组可见性规则映射（避免 if-else 分支）
const GROUP_VISIBILITY: Record<string, (ctx: { isGemini: boolean; searchEnabled: boolean }) => boolean> = {
  base: () => true,
  gemini: ({ isGemini }) => isGemini,
  gemini_search: ({ isGemini, searchEnabled }) => isGemini && searchEnabled,
};

interface ParametersProps {
  disabled?: boolean;
  providers?: LLMProvider[];
}

const Parameters: React.FC<ParametersProps> = ({ disabled, providers }) => {
  const { control, watch, setValue } = useFormContext();
  const temperature = watch('temperature');
  const contextWindow = watch('context_window');
  const providerId = watch('provider_id');
  const model = watch('model');
  const searchEnabled = watch('gemini_config.google_search_enabled');
  const [markupMultiplier, setMarkupMultiplier] = useState(1.5);

  // 当前选中的供应商
  const currentProvider = useMemo(() =>
    providers?.find(p => p.id === providerId),
    [providerId, providers]
  );

  // 判断当前供应商是否为 Gemini
  const isGeminiProvider = currentProvider?.provider_type?.toLowerCase() === 'gemini';

  // 获取当前模型的 API 成本数据
  const modelCosts: Record<string, number> = currentProvider?.model_costs?.[model] ?? {};
  const hasAnyCost = Object.keys(modelCosts).length > 0;

  // 根据可见性规则过滤定价维度（映射表驱动，避免 if-else）
  const visibilityCtx = { isGemini: !!isGeminiProvider, searchEnabled: !!searchEnabled };
  const visibleDimensions = COST_DIMENSIONS.filter(
    dim => GROUP_VISIBILITY[dim.group]?.(visibilityCtx) ?? true
  );

  // 格式化显示 context_window (如 128K)
  const formatContextWindow = (value: number) => {
    return value >= 1000 ? `${Math.round(value / 1024)}K` : value.toString();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
         <div className="flex justify-between items-center mb-4">
           <Label className="text-sm font-medium">思考模式</Label>
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
                      <span className="text-xs text-muted-foreground">{field.value ? '开启' : '关闭'}</span>
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />
         </div>
         <p className="text-xs text-muted-foreground">开启后，模型会在回答前进行思考过程（Chain of Thought）。</p>
      </div>

      {/* Gemini 3.1 配置区块 - 仅在选择 Gemini 供应商时显示 */}
      {isGeminiProvider && (
        <div className="rounded-xl border bg-card p-5 shadow-sm border-blue-200 dark:border-blue-800">
          <Label className="text-sm font-medium mb-4 block text-blue-600 dark:text-blue-400">Gemini 3.1 高级配置</Label>
          <div className="space-y-4">
            {/* 思考等级 */}
            <FormField
              control={control}
              name="gemini_config.thinking_level"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-xs text-muted-foreground">思考等级</FormLabel>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ""}
                        disabled={disabled}
                      >
                        <SelectTrigger className="w-48 bg-background">
                          <SelectValue placeholder="选择等级" />
                        </SelectTrigger>
                        <SelectContent>
                          {THINKING_LEVELS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 媒体分辨率 */}
            <FormField
              control={control}
              name="gemini_config.media_resolution"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-xs text-muted-foreground">媒体分辨率</FormLabel>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || ""}
                        disabled={disabled}
                      >
                        <SelectTrigger className="w-48 bg-background">
                          <SelectValue placeholder="选择分辨率" />
                        </SelectTrigger>
                        <SelectContent>
                          {MEDIA_RESOLUTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="pt-2 border-t">
              {/* 图片生成开关 */}
              <div className="flex justify-between items-center mb-3">
                <Label className="text-xs font-medium text-muted-foreground">图片生成</Label>
                <FormField
                  control={control}
                  name="gemini_config.image_generation_enabled"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={field.value || false}
                            onCheckedChange={field.onChange}
                            disabled={disabled}
                          />
                          <span className="text-xs text-muted-foreground">{field.value ? '开启' : '关闭'}</span>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              
              {/* 图片配置 - 仅在开启时显示 */}
              {watch('gemini_config.image_generation_enabled') && (
                <div className="grid grid-cols-2 gap-4">
                  {/* 宽高比 */}
                  <FormField
                    control={control}
                    name="gemini_config.image_config.aspect_ratio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">宽高比</FormLabel>
                        <FormControl>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || ""}
                            disabled={disabled}
                          >
                            <SelectTrigger className="bg-background">
                              <SelectValue placeholder="选择" />
                            </SelectTrigger>
                            <SelectContent>
                              {ASPECT_RATIOS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 图片尺寸 */}
                  <FormField
                    control={control}
                    name="gemini_config.image_config.image_size"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">图片尺寸</FormLabel>
                        <FormControl>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || ""}
                            disabled={disabled}
                          >
                            <SelectTrigger className="bg-background">
                              <SelectValue placeholder="选择" />
                            </SelectTrigger>
                            <SelectContent>
                              {IMAGE_SIZES.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                </div>
              )}
            </div>

            {/* Google 搜索开关 */}
            <div className="flex justify-between items-center pt-2 border-t">
              <Label className="text-xs font-medium text-muted-foreground">Google 搜索</Label>
              <FormField
                control={control}
                name="gemini_config.google_search_enabled"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                          disabled={disabled}
                        />
                        <span className="text-xs text-muted-foreground">{field.value ? '开启' : '关闭'}</span>
                      </div>
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">这些配置仅对 Gemini 3.1 系列模型生效。</p>
        </div>
      )}

      <div className="rounded-xl border bg-card p-5 shadow-sm">
         <div className="mb-4">
           <div className="flex justify-between items-center mb-2">
             <Label className="text-sm font-medium">上下文窗口</Label>
             <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
               {formatContextWindow(contextWindow || 4096)} ({contextWindow || 4096} tokens)
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
                        max={262144}
                        step={1024}
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
                        step={1024}
                        min={4096}
                        max={262144}
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
             <span>4K</span>
             <span>256K</span>
           </div>
         </div>
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <Label className="text-sm font-medium">温度 (Temperature)</Label>
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
          <span>0 (精确)</span>
          <span>1 (创造性)</span>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <Label className="text-sm font-medium mb-2 block">积分定价</Label>

        {/* 成本倍率 - 仅在有 API 成本数据时显示 */}
        {hasAnyCost && (
          <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
            <Label className="text-xs text-blue-700 dark:text-blue-300 whitespace-nowrap">成本倍率</Label>
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
              应用全部建议
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
                      <FormLabel className="text-xs text-muted-foreground">{dim.label} ({dim.unit})</FormLabel>
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
                          API 成本: ${apiCost}{dim.costUnit}
                        </span>
                        <button
                          type="button"
                          className="text-xs text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-200 disabled:opacity-50"
                          onClick={() => setValue(dim.formField, suggestedCredit!)}
                          disabled={disabled}
                        >
                          建议: {suggestedCredit} 积分
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

        <p className="text-xs text-muted-foreground mt-3">设置为 0 表示免费，不消耗用户积分。</p>

        {/* 利润概览 */}
        {hasAnyCost && (
          <div className="mt-4 pt-4 border-t">
            <Label className="text-xs font-medium mb-2 block text-muted-foreground">利润概览</Label>
            <div className="space-y-1.5">
              {visibleDimensions.map(dim => {
                const apiCost = modelCosts[dim.key] as number | undefined;
                const creditRate = watch(dim.formField) ?? 0;
                const revenueUsd = creditRate * 0.01;
                const margin = apiCost && apiCost > 0 ? ((revenueUsd - apiCost) / apiCost * 100) : null;
                return apiCost != null ? (
                  <div key={dim.key} className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">{dim.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground font-mono">${apiCost} → {creditRate}积分 → ${revenueUsd.toFixed(2)}</span>
                      <span className={
                        margin == null ? 'text-muted-foreground' :
                        margin > 0 ? 'text-green-600 dark:text-green-400 font-medium' :
                        margin < 0 ? 'text-red-600 dark:text-red-400 font-medium' :
                        'text-yellow-600 dark:text-yellow-400'
                      }>
                        {margin != null ? `${margin > 0 ? '+' : ''}${margin.toFixed(1)}%` : 'N/A'}
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
