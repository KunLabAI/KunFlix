import React, { useMemo } from 'react';
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

interface ParametersProps {
  disabled?: boolean;
  providers?: LLMProvider[];
}

const Parameters: React.FC<ParametersProps> = ({ disabled, providers }) => {
  const { control, watch } = useFormContext();
  const temperature = watch('temperature');
  const contextWindow = watch('context_window');
  const providerId = watch('provider_id');

  // 判断当前供应商是否为 Gemini
  const isGeminiProvider = useMemo(() => {
    const provider = providers?.find(p => p.id === providerId);
    return provider?.provider_type?.toLowerCase() === 'gemini';
  }, [providerId, providers]);

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
        <Label className="text-sm font-medium mb-4 block">积分定价</Label>
        <div className="space-y-4">
          <FormField
            control={control}
            name="input_credit_per_1k"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="text-xs text-muted-foreground">输入价格 (积分/1K tokens)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      value={field.value ?? 0}
                      onChange={e => field.onChange(Number(e.target.value))}
                      step={0.01}
                      min={0}
                      className="w-24 font-mono"
                      disabled={disabled}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="output_credit_per_1k"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="text-xs text-muted-foreground">输出价格 (积分/1K tokens)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      value={field.value ?? 0}
                      onChange={e => field.onChange(Number(e.target.value))}
                      step={0.01}
                      min={0}
                      className="w-24 font-mono"
                      disabled={disabled}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-3">设置为 0 表示免费，不消耗用户积分。</p>
      </div>
    </div>
  );
};

export default Parameters;
