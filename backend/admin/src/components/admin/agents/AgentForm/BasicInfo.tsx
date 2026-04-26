import React, { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import Image from 'next/image';
import {
  FormControl,
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
import { Textarea } from '@/components/ui/textarea';
import { LLMProvider } from '@/types';
import { parseProviderModelsWithMeta } from '@/lib/api-utils';

// 供应商品牌 Logo 映射（与 LLM schema 保持一致）
const PROVIDER_ICONS: Record<string, string> = {
  openai: '/provider/openai.svg',
  azure: '/provider/azureai-color.svg',
  dashscope: '/provider/qwen-color.svg',
  anthropic: '/provider/claude-color.svg',
  gemini: '/provider/gemini-color.svg',
  deepseek: '/provider/deepseek-color.svg',
  minimax: '/provider/minimax-color.svg',
  xai: '/provider/grok.svg',
  doubao: '/provider/doubao-color.svg',
  kling: '/provider/kling-color.svg',
  meta: '/provider/meta-color.svg',
  microsoft: '/provider/microsoft-color.svg',
  openrouter: '/provider/openrouter.svg',
  sora: '/provider/sora-color.svg',
  ark: '/provider/volcengine-color.svg',
};

interface BasicInfoProps {
  providers: LLMProvider[];
  loading?: boolean;
  isFormInitialized?: React.RefObject<boolean>;
}

const BasicInfo: React.FC<BasicInfoProps> = ({ 
  providers, 
  loading,
  isFormInitialized
}) => {
  const { control, watch, setValue } = useFormContext();
  const selectedProviderId = watch('provider_id');
  const selectedModel = watch('model');

  const availableModels = useMemo(() => {
    if (!selectedProviderId || !providers) return [];
    const provider = providers.find(p => p.id === selectedProviderId);
    return provider ? parseProviderModelsWithMeta(provider.models, provider.model_metadata) : [];
  }, [selectedProviderId, providers]);

  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>名称 <span className="text-destructive">*</span></FormLabel>
            <FormControl>
              <Input placeholder="给智能体起个名字，例如: 故事导演" disabled={loading} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>描述 <span className="text-destructive">*</span></FormLabel>
            <FormControl>
              <Textarea 
                placeholder="简要描述智能体的职责和功能..." 
                disabled={loading} 
                className="resize-none" 
                rows={3}
                {...field} 
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="p-4 bg-muted/50 rounded-xl border">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">模型配置</div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={control}
            name="provider_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">供应商 <span className="text-destructive">*</span></FormLabel>
                <Select 
                  onValueChange={(value) => {
                    field.onChange(value);
                    // 只在初始化完成后才重置 model
                    if (isFormInitialized?.current) {
                      setValue('model', '');
                    }
                  }} 
                  value={field.value} 
                  disabled={loading}
                >
                  <FormControl>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="选择供应商" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {providers.map((p) => {
                      const icon = PROVIDER_ICONS[p.provider_type?.toLowerCase()];
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          <div className="flex items-center gap-2">
                            {icon && (
                              <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded-sm">
                                <Image src={icon} alt={p.name} fill className="object-contain" />
                              </div>
                            )}
                            <span>{p.name}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="model"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs">模型 <span className="text-destructive">*</span></FormLabel>
                <Select 
                  onValueChange={(value) => {
                    // 防止意外清空：只有当新值非空或用户主动选择时才更新
                    if (value || !availableModels.some(m => m.value === field.value)) {
                      field.onChange(value);
                    }
                  }} 
                  value={field.value} 
                  disabled={!selectedProviderId || loading}
                >
                  <FormControl>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={selectedProviderId ? "选择模型" : "先选择供应商"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {availableModels.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
};

export default BasicInfo;
