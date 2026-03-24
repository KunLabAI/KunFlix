'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormMessage } from '@/components/ui/form';
import { FileText, Image, Video, Table2 } from 'lucide-react';

const NODE_TYPE_OPTIONS = [
  {
    value: 'script',
    label: '文本节点',
    description: '控制富文本内容生成与编辑',
    icon: FileText,
  },
  {
    value: 'character',
    label: '图像节点',
    description: '控制图片生成与管理',
    icon: Image,
  },
  {
    value: 'video',
    label: '视频节点',
    description: '控制视频生成与管理',
    icon: Video,
  },
  {
    value: 'storyboard',
    label: '多维表格',
    description: '控制数据表格与透视分析',
    icon: Table2,
  },
] as const;

interface NodeTypesProps {
  disabled?: boolean;
}

const NodeTypes: React.FC<NodeTypesProps> = ({ disabled }) => {
  const { control } = useFormContext();

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4">
        <span className="text-sm font-medium">画布节点控制</span>
        <p className="text-xs text-muted-foreground mt-1">
          选择该智能体可以控制的画布节点类型
        </p>
      </div>

      <FormField
        control={control}
        name="target_node_types"
        render={({ field }) => (
          <FormItem>
            <div className="grid grid-cols-2 gap-3">
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
                    className={`
                      flex flex-col items-start p-4 rounded-lg border cursor-pointer
                      transition-all duration-150
                      ${isSelected
                        ? 'border-foreground bg-accent'
                        : 'border-border hover:border-muted-foreground hover:bg-accent/50'
                      }
                      ${disabled ? 'opacity-50 pointer-events-none' : ''}
                    `}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`} />
                      <span className={`text-sm font-medium ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {option.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {option.description}
                    </p>
                  </div>
                );
              })}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

export default NodeTypes;
