import React from 'react';
import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { AVAILABLE_TOOLS } from '@/constants/agent';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from "@/components/ui/checkbox"; // Need Checkbox component

// I need to create Checkbox component or use something else.
// I'll use a simple custom checkbox or create the component.
// I'll create `src/components/ui/checkbox.tsx` quickly.

const Tools: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const { control, watch } = useFormContext();
  const toolsEnabled = watch('tools_enabled');

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-medium">工具能力</span>
        <FormField
          control={control}
          name="tools_enabled"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={disabled}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

      {toolsEnabled ? (
        <FormField
          control={control}
          name="tools"
          render={({ field }) => (
            <FormItem>
              <div className="grid grid-cols-1 gap-2">
                {AVAILABLE_TOOLS.map((tool) => (
                  <FormField
                    key={tool.value}
                    control={control}
                    name="tools"
                    render={({ field: innerField }) => {
                      return (
                        <FormItem
                          key={tool.value}
                          className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-2 shadow-sm"
                        >
                          <FormControl>
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                checked={field.value?.includes(tool.value)}
                                onChange={(checked) => {
                                    const current = field.value || [];
                                    const updated = checked.target.checked
                                        ? [...current, tool.value]
                                        : current.filter((value: string) => value !== tool.value);
                                    field.onChange(updated);
                                }}
                                disabled={disabled}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer flex-1">
                            {tool.label}
                          </FormLabel>
                        </FormItem>
                      )
                    }}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          启用工具以允许智能体访问外部数据或执行操作。
        </p>
      )}
    </div>
  );
};

export default Tools;
