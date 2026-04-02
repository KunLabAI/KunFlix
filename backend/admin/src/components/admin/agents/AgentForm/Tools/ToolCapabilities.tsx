import React from 'react';
import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { FileText, Image, Video, Table2, Paintbrush, LayoutGrid, AlertCircle } from 'lucide-react';
import { useToolConfig } from '@/hooks/useToolRegistry';

// 画布节点类型选项
const NODE_TYPE_OPTIONS = [
  { value: 'script', label: '文本节点', description: '富文本内容', icon: FileText },
  { value: 'character', label: '图像节点', description: '图片生成与管理', icon: Image },
  { value: 'video', label: '视频节点', description: '视频生成与管理', icon: Video },
  { value: 'storyboard', label: '多维表格', description: '数据表格与分析', icon: Table2 },
] as const;

const ALL_NODE_TYPES = NODE_TYPE_OPTIONS.map(o => o.value);

interface ToolCapabilitiesProps {
  disabled?: boolean;
}

const ToolCapabilities: React.FC<ToolCapabilitiesProps> = ({ disabled }) => {
  const { control, watch, setValue } = useFormContext();

  // 获取全局图像工具配置
  const { config: imageToolConfig } = useToolConfig('generate_image');
  const globalImageEnabled = imageToolConfig?.config?.image_generation_enabled;

  // 智能体级别的图像工具开关
  const agentImageEnabled = watch('image_config.image_generation_enabled');

  // 画布状态
  const targetNodeTypes: string[] = watch('target_node_types') || [];
  const canvasEnabled = targetNodeTypes.length > 0;

  return (
    <div className="mt-4 pt-4 border-t space-y-3">
      <h4 className="text-sm font-medium">工具开关</h4>

      {/* ── 图像工具（generate_image + edit_image）── */}
      <div className="rounded-lg border p-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Paintbrush className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium">图像工具</span>
          </div>
          <FormField
            control={control}
            name="image_config.image_generation_enabled"
            render={({ field }) => (
              <FormItem className="space-y-0">
                <FormControl>
                  <Switch
                    checked={field.value || false}
                    onCheckedChange={field.onChange}
                    disabled={disabled || !globalImageEnabled}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          图像生成 (generate_image) 和图像编辑 (edit_image) 工具。
        </p>
        
        {/* 全局配置状态提示 */}
        {!globalImageEnabled && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
            <AlertCircle className="h-3 w-3" />
            <span>全局配置未启用，请在「工具管理」中先启用图像生成</span>
          </div>
        )}
        
        {globalImageEnabled && agentImageEnabled && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {imageToolConfig?.config?.image_model && (
              <Badge variant="outline" className="text-xs">
                {imageToolConfig.config.image_model}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              参数配置请在「工具管理」中设置
            </span>
          </div>
        )}
      </div>

      {/* ── 画布工具 ── */}
      <div className="rounded-lg border p-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">画布工具</span>
          </div>
          <Switch
            checked={canvasEnabled}
            onCheckedChange={(checked) => {
              setValue('target_node_types', checked ? [...ALL_NODE_TYPES] : []);
            }}
            disabled={disabled}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          开启后，智能体可以控制画布节点内容。
        </p>

        {canvasEnabled && (
          <div className="mt-3 pt-3 border-t">
            <FormField
              control={control}
              name="target_node_types"
              render={({ field }) => (
                <FormItem>
                  <div className="grid grid-cols-2 gap-2">
                    {NODE_TYPE_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isSelected = field.value?.includes(option.value);
                      return (
                        <div
                          key={option.value}
                          onClick={() => {
                            const current: string[] = field.value || [];
                            const updated = isSelected
                              ? current.filter((v) => v !== option.value)
                              : [...current, option.value];
                            field.onChange(updated);
                          }}
                          className={`flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-all ${
                            isSelected ? 'border-foreground bg-accent' : 'border-border hover:bg-accent/50'
                          } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                          <Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`} />
                          <div>
                            <span className={`text-xs font-medium block ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {option.label}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{option.description}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolCapabilities;
