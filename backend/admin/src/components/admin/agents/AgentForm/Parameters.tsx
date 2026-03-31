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
import { useImageCapabilities } from '@/hooks/useToolRegistry';

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

// 宽高比显示标签映射表（避免 if-else）
const ASPECT_RATIO_LABELS: Record<string, string> = {
  "auto": "自动", "1:1": "1:1 (方形)", "16:9": "16:9 (宽屏)", "9:16": "9:16 (手机)",
  "4:3": "4:3 (标准)", "3:4": "3:4 (竖屏)", "3:2": "3:2", "2:3": "2:3",
  "2:1": "2:1 (超宽)", "1:2": "1:2 (超高)", "19.5:9": "19.5:9", "9:19.5": "9:19.5",
  "20:9": "20:9", "9:20": "9:20",
};

// 画质显示标签映射表
const QUALITY_LABELS: Record<string, string> = {
  "standard": "标准 (Standard)", "hd": "高清 (HD)", "ultra": "超高清 (Ultra)",
};

// 输出格式显示标签映射表
const OUTPUT_FORMAT_LABELS: Record<string, string> = {
  "png": "PNG", "jpeg": "JPEG", "webp": "WebP",
};

// 积分定价维度映射表（避免 if-else）
const COST_DIMENSIONS = [
  { key: 'input', label: '输入价格', unit: '积分/1M tokens', costUnit: '/1M tokens', formField: 'input_credit_per_1m', step: 0.01, group: 'base' },
  { key: 'text_output', label: '输出价格', unit: '积分/1M tokens', costUnit: '/1M tokens', formField: 'output_credit_per_1m', step: 0.01, group: 'base' },
  { key: 'image_output', label: '图片输出价格', unit: '积分/1M tokens', costUnit: '/1M tokens', formField: 'image_output_credit_per_1m', step: 0.01, group: 'gemini' },
  { key: 'search', label: '搜索查询价格', unit: '积分/次', costUnit: '/次', formField: 'search_credit_per_query', step: 0.1, group: 'gemini_search' },
  { key: 'image_generation', label: 'xAI图片生成价格', unit: '积分/张', costUnit: '/张', formField: 'image_credit_per_image', step: 0.1, group: 'xai_image' },
  { key: 'video_input_image', label: '视频-输入图片', unit: '积分/张', costUnit: '/张', formField: 'video_input_image_credit', step: 0.001, group: 'video' },
  { key: 'video_input_second', label: '视频-输入时长', unit: '积分/秒', costUnit: '/秒', formField: 'video_input_second_credit', step: 0.001, group: 'video' },
  { key: 'video_output_480p', label: '视频输出(480p)', unit: '积分/秒', costUnit: '/秒', formField: 'video_output_480p_credit', step: 0.001, group: 'video' },
  { key: 'video_output_720p', label: '视频输出(720p)', unit: '积分/秒', costUnit: '/秒', formField: 'video_output_720p_credit', step: 0.001, group: 'video' },
] as const;

// 维度组可见性规则映射（避免 if-else 分支）
const GROUP_VISIBILITY: Record<string, (ctx: { isGemini: boolean; isXAI: boolean; searchEnabled: boolean; imageEnabled: boolean; agentType: string }) => boolean> = {
  base: () => true,
  gemini: ({ isGemini }) => isGemini,
  gemini_search: ({ isGemini, searchEnabled }) => isGemini && searchEnabled,
  xai_image: ({ imageEnabled }) => imageEnabled,
  video: ({ agentType }) => agentType === 'video',
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
  const unifiedImageEnabled = watch('image_config.image_generation_enabled');
  const [markupMultiplier, setMarkupMultiplier] = useState(1.5);

  // 图像供应商能力（动态加载）
  const { capabilities: imageCapabilities } = useImageCapabilities();

  // 当前选中的图像供应商类型
  const imageProviderId = watch('image_config.image_provider_id');
  const imageProviderType = useMemo(() => {
    const p = (providers || []).find(p => p.id === imageProviderId);
    return p?.provider_type?.toLowerCase() || '';
  }, [imageProviderId, providers]);

  // 当前图像供应商的能力
  const currentImageCaps = useMemo(
    () => imageCapabilities?.[imageProviderType],
    [imageCapabilities, imageProviderType],
  );

  // 当前选中的供应商
  const currentProvider = useMemo(() =>
    providers?.find(p => p.id === providerId),
    [providerId, providers]
  );

  // 供应商类型判断
  const providerType = currentProvider?.provider_type?.toLowerCase() || '';
  const isGeminiProvider = providerType === 'gemini';
  const isXAIProvider = providerType === 'xai';

  // 获取当前模型的 API 成本数据
  const modelCosts: Record<string, number> = currentProvider?.model_costs?.[model] ?? {};
  const hasAnyCost = Object.keys(modelCosts).length > 0;

  // 根据可见性规则过滤定价维度（映射表驱动，避免 if-else）
  const visibilityCtx = { isGemini: !!isGeminiProvider, isXAI: !!isXAIProvider, searchEnabled: !!searchEnabled, imageEnabled: !!unifiedImageEnabled, agentType: watch('agent_type') || 'text' };
  const visibleDimensions = COST_DIMENSIONS.filter(
    dim => GROUP_VISIBILITY[dim.group]?.(visibilityCtx) ?? true
  );

  // 格式化显示 context_window (如 128K)
  const formatContextWindow = (value: number) => {
    return value >= 1000 ? `${Math.round(value / 1024)}K` : value.toString();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5">
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
        <div className="rounded-xl border bg-card p-5 border-blue-200 dark:border-blue-800">
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

      {/* 统一图像生成配置 - 所有供应商通用 */}
      <div className="rounded-xl border bg-card p-5 border-emerald-200 dark:border-emerald-800">
        <Label className="text-sm font-medium mb-4 block text-emerald-600 dark:text-emerald-400">统一图像生成配置（generate_image 工具）</Label>
        <div className="space-y-4">
          {/* 图片生成开关 */}
          <div className="flex justify-between items-center">
            <Label className="text-xs font-medium text-muted-foreground">图片生成工具</Label>
            <FormField
              control={control}
              name="image_config.image_generation_enabled"
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
          {unifiedImageEnabled && (
            <div className="space-y-4 pt-2 border-t">
              {/* 图像供应商选择 */}
              <FormField
                control={control}
                name="image_config.image_provider_id"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-xs text-muted-foreground">图像供应商</FormLabel>
                      <FormControl>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            setValue('image_config.image_model', null);
                          }}
                          value={field.value || ""}
                          disabled={disabled}
                        >
                          <SelectTrigger className="w-48 bg-background">
                            <SelectValue placeholder="选择图像供应商" />
                          </SelectTrigger>
                          <SelectContent>
                            {(providers || []).filter(p => p.is_active).map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.provider_type})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 图像模型选择 */}
              <FormField
                control={control}
                name="image_config.image_model"
                render={({ field }) => {
                  const imageProviderId = watch('image_config.image_provider_id');
                  const imageProvider = (providers || []).find(p => p.id === imageProviderId);
                  const imageModels = imageProvider
                    ? (Array.isArray(imageProvider.models) ? imageProvider.models : (imageProvider.models || '').split(',').map((s: string) => s.trim()).filter(Boolean))
                    : [];
                  return (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="text-xs text-muted-foreground">图像模型</FormLabel>
                        <FormControl>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || ""}
                            disabled={disabled || !imageProviderId}
                          >
                            <SelectTrigger className="w-48 bg-background">
                              <SelectValue placeholder={imageProviderId ? "选择模型" : "请先选择供应商"} />
                            </SelectTrigger>
                            <SelectContent>
                              {imageModels.map((m: string) => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <div className="grid grid-cols-2 gap-4">
                {/* 宽高比 — 根据供应商能力动态渲染 */}
                <FormField
                  control={control}
                  name="image_config.image_config.aspect_ratio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">宽高比</FormLabel>
                      <FormControl>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || ""}
                          disabled={disabled || !currentImageCaps}
                        >
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder={currentImageCaps ? "选择" : "请先选择供应商"} />
                          </SelectTrigger>
                          <SelectContent>
                            {(currentImageCaps?.aspect_ratios || []).map(v => (
                              <SelectItem key={v} value={v}>{ASPECT_RATIO_LABELS[v] || v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 画质 — 根据供应商能力动态渲染 */}
                <FormField
                  control={control}
                  name="image_config.image_config.quality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">画质</FormLabel>
                      <FormControl>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || ""}
                          disabled={disabled || !currentImageCaps}
                        >
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder={currentImageCaps ? "选择" : "请先选择供应商"} />
                          </SelectTrigger>
                          <SelectContent>
                            {(currentImageCaps?.qualities || []).map(v => (
                              <SelectItem key={v} value={v}>{QUALITY_LABELS[v] || v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* 批量生成张数 — 根据供应商能力动态限制 */}
                <FormField
                  control={control}
                  name="image_config.image_config.batch_count"
                  render={({ field }) => {
                    const batchMax = currentImageCaps?.batch_count?.max ?? 10;
                    return (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">每次生成张数 (1-{batchMax})</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            value={field.value ?? ""}
                            onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                            min={1}
                            max={batchMax}
                            className="bg-background"
                            disabled={disabled}
                            placeholder="默认 1"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                {/* 输出格式 — 根据供应商能力动态渲染，无选项时隐藏 */}
                {(currentImageCaps?.output_formats?.length ?? 0) > 0 && (
                  <FormField
                    control={control}
                    name="image_config.image_config.output_format"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">输出格式</FormLabel>
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
                              {(currentImageCaps?.output_formats || []).map(v => (
                                <SelectItem key={v} value={v}>{OUTPUT_FORMAT_LABELS[v] || v}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">开启后，文本模型可通过 generate_image 工具调用图像生成。支持跨供应商（如 Gemini 文本 + xAI 图像）。</p>
      </div>

      <div className="rounded-xl border bg-card p-5">
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

      <div className="rounded-xl border bg-card p-5">
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

      <div className="rounded-xl border bg-card p-5">
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
