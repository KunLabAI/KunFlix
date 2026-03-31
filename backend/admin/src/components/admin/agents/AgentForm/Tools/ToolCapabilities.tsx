import React from 'react';
import { useFormContext } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';

const ToolCapabilities: React.FC = () => {
  const { watch } = useFormContext();

  const targetNodeTypes: string[] = watch('target_node_types') || [];
  const imageConfig = watch('image_config') || {};
  const canvasEnabled = targetNodeTypes.length > 0;
  const imageGenEnabled = !!imageConfig.image_generation_enabled;

  const capabilities = [
    { label: '画布工具', enabled: canvasEnabled, detail: canvasEnabled ? `${targetNodeTypes.length} 种节点类型` : '未启用' },
    { label: '图像生成', enabled: imageGenEnabled, detail: imageGenEnabled ? (imageConfig.image_model || '已配置') : '未启用' },
  ];

  return (
    <div className="mt-4 pt-4 border-t">
      <h4 className="text-sm font-medium mb-3">工具能力状态</h4>
      <div className="space-y-2">
        {capabilities.map((cap) => (
          <div key={cap.label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{cap.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{cap.detail}</span>
              <Badge variant={cap.enabled ? 'default' : 'secondary'} className="text-xs">
                {cap.enabled ? '启用' : '关闭'}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ToolCapabilities;
