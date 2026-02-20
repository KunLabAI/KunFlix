import React from 'react';
import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';

const SystemPrompt: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const { control } = useFormContext();

  return (
    <FormField
      control={control}
      name="system_prompt"
      render={({ field }) => (
        <FormItem>
          <FormLabel>系统提示词 (System Prompt)</FormLabel>
          <FormControl>
            <Textarea 
              placeholder="你是一个专业的助手..." 
              disabled={disabled} 
              className="font-mono text-sm min-h-[300px] resize-y" 
              {...field} 
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

export default SystemPrompt;
