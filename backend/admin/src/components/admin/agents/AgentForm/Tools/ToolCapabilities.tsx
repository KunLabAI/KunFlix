import React from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { FileText, Image, Video, Table2, Paintbrush, LayoutGrid, AlertCircle, Film, Headphones, Mic, Globe } from 'lucide-react';
import { useToolConfig } from '@/hooks/useToolRegistry';

// 画布节点类型选项（与后端 NODE_TYPE_SCHEMA / 前端 Sidebar 的 7 种规范类型对齐）
const NODE_TYPE_OPTIONS = [
  { value: 'text', labelKey: 'agents.form.tools.capabilities.nodeTypes.text', descKey: 'agents.form.tools.capabilities.nodeTypes.textDesc', icon: FileText },
  { value: 'image', labelKey: 'agents.form.tools.capabilities.nodeTypes.image', descKey: 'agents.form.tools.capabilities.nodeTypes.imageDesc', icon: Image },
  { value: 'video', labelKey: 'agents.form.tools.capabilities.nodeTypes.video', descKey: 'agents.form.tools.capabilities.nodeTypes.videoDesc', icon: Video },
  { value: 'audio', labelKey: 'agents.form.tools.capabilities.nodeTypes.audio', descKey: 'agents.form.tools.capabilities.nodeTypes.audioDesc', icon: Headphones },
  { value: 'tts', labelKey: 'agents.form.tools.capabilities.nodeTypes.tts', descKey: 'agents.form.tools.capabilities.nodeTypes.ttsDesc', icon: Mic },
  { value: 'storyboard', labelKey: 'agents.form.tools.capabilities.nodeTypes.storyboard', descKey: 'agents.form.tools.capabilities.nodeTypes.storyboardDesc', icon: Table2 },
  { value: 'panorama', labelKey: 'agents.form.tools.capabilities.nodeTypes.panorama', descKey: 'agents.form.tools.capabilities.nodeTypes.panoramaDesc', icon: Globe },
] as const;

const ALL_NODE_TYPES = NODE_TYPE_OPTIONS.map(o => o.value);

// 兼容存量智能体配置里的 legacy 节点类型名（与后端 _migrate_node_type 一致）：
// 读取/展示时归一为规范名，交互后回写的也是规范名。
const LEGACY_NODE_TYPE_ALIAS: Record<string, string> = { script: 'text', character: 'image' };
const canonicalNodeTypes = (types: string[] | undefined): string[] =>
  (types || []).map((v) => LEGACY_NODE_TYPE_ALIAS[v] ?? v);

interface ToolCapabilitiesProps {
  disabled?: boolean;
}

const ToolCapabilities: React.FC<ToolCapabilitiesProps> = ({ disabled }) => {
  const { control, watch, setValue } = useFormContext();
  const { t } = useTranslation();

  // 获取全局图像工具配置
  const { config: imageToolConfig } = useToolConfig('generate_image');
  const globalImageEnabled = imageToolConfig?.config?.image_generation_enabled;

  // 获取全局视频工具配置
  const { config: videoToolConfig } = useToolConfig('generate_video');
  const globalVideoEnabled = videoToolConfig?.config?.video_generation_enabled;

  // 智能体级别的图像工具开关
  const agentImageEnabled = watch('image_config.image_generation_enabled');

  // 智能体级别的视频工具开关
  const agentVideoEnabled = watch('video_config.video_generation_enabled');

  // 画布状态
  const targetNodeTypes: string[] = watch('target_node_types') || [];
  const canvasEnabled = targetNodeTypes.length > 0;

  return (
    <div className="mt-4 pt-4 border-t space-y-3">
      <h4 className="text-sm font-medium">{t('agents.form.tools.capabilities.title')}</h4>

      {/* ── 图像工具（generate_image + edit_image）── */}
      <div className="rounded-lg border p-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Paintbrush className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-medium">{t('agents.form.tools.capabilities.image.title')}</span>
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
          {t('agents.form.tools.capabilities.image.desc')}
        </p>

        {/* 全局配置状态提示 */}
        {!globalImageEnabled && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
            <AlertCircle className="h-3 w-3" />
            <span>{t('agents.form.tools.capabilities.image.globalDisabled')}</span>
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
              {t('agents.form.tools.capabilities.image.params')}
            </span>
          </div>
        )}
      </div>

      {/* ── 视频工具（generate_video + edit_video）── */}
      <div className="rounded-lg border p-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-violet-500" />
            <span className="text-sm font-medium">{t('agents.form.tools.capabilities.video.title')}</span>
          </div>
          <FormField
            control={control}
            name="video_config.video_generation_enabled"
            render={({ field }) => (
              <FormItem className="space-y-0">
                <FormControl>
                  <Switch
                    checked={field.value || false}
                    onCheckedChange={field.onChange}
                    disabled={disabled || !globalVideoEnabled}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {t('agents.form.tools.capabilities.video.desc')}
        </p>

        {/* 全局配置状态提示 */}
        {!globalVideoEnabled && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
            <AlertCircle className="h-3 w-3" />
            <span>{t('agents.form.tools.capabilities.video.globalDisabled')}</span>
          </div>
        )}

        {globalVideoEnabled && agentVideoEnabled && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {videoToolConfig?.config?.video_model && (
              <Badge variant="outline" className="text-xs">
                {videoToolConfig.config.video_model}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {t('agents.form.tools.capabilities.video.params')}
            </span>
          </div>
        )}
      </div>

      {/* ── 画布工具 ── */}
      <div className="rounded-lg border p-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">{t('agents.form.tools.capabilities.canvas.title')}</span>
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
          {t('agents.form.tools.capabilities.canvas.desc')}
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
                      const selected = canonicalNodeTypes(field.value);
                      const isSelected = selected.includes(option.value);
                      return (
                        <div
                          key={option.value}
                          onClick={() => {
                            const updated = isSelected
                              ? selected.filter((v) => v !== option.value)
                              : [...selected, option.value];
                            field.onChange(updated);
                          }}
                          className={`flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-all ${
                            isSelected ? 'border-foreground bg-accent' : 'border-border hover:bg-accent/50'
                          } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                          <Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`} />
                          <div>
                            <span className={`text-xs font-medium block ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {t(option.labelKey)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{t(option.descKey)}</span>
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
