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
            <FormLabel>名称</FormLabel>
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
            <FormLabel>描述</FormLabel>
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

      <FormField
        control={control}
        name="agent_type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>智能体类型</FormLabel>
            <Select onValueChange={field.onChange} value={field.value} disabled={loading}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="text">📝 文本处理（故事、角色、分镜脚本）</SelectItem>
                <SelectItem value="image">🎨 图像处理（角色立绘、场景图）</SelectItem>
                <SelectItem value="multimodal">✨ 多模态（文本 + 图像）</SelectItem>
                <SelectItem value="video">🎬 视频生成（xAI Video）</SelectItem>
              </SelectContent>
            </Select>
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
                <FormLabel className="text-xs">供应商</FormLabel>
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
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
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
                <FormLabel className="text-xs">模型</FormLabel>
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
