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
import { parseProviderModels } from '@/lib/api-utils';

interface BasicInfoProps {
  providers: LLMProvider[];
  loading?: boolean;
}

const BasicInfo: React.FC<BasicInfoProps> = ({ 
  providers, 
  loading 
}) => {
  const { control, watch, setValue } = useFormContext();
  const selectedProviderId = watch('provider_id');

  const availableModels = useMemo(() => {
    if (!selectedProviderId || !providers) return [];
    const provider = providers.find(p => p.id === selectedProviderId);
    return provider ? parseProviderModels(provider.models) : [];
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
                    field.onChange(Number(value));
                    setValue('model', ''); // Reset model when provider changes
                  }} 
                  value={field.value?.toString()} 
                  disabled={loading}
                >
                  <FormControl>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="选择供应商" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
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
                  onValueChange={field.onChange} 
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
                      <SelectItem key={m} value={m}>
                        {m}
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
