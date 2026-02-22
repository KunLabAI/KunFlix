import React from 'react';
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

// I'll assume RadioGroup is available or use native input type="radio" styled, or shadcn RadioGroup.
// I'll implement a simple button group for thinking mode or use ToggleGroup if available.
// For now I'll use a simple flex container with buttons or just a Switch for boolean.
// The original used Radio.Group with buttons.

const Parameters: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const { control, watch } = useFormContext();
  const temperature = watch('temperature');
  const contextWindow = watch('context_window');

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
