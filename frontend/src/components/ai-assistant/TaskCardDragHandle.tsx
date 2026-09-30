'use client';

import React from 'react';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface TaskCardDragHandleProps {
  /** 是否有可拖拽媒体（completed 且有 url）；否则不渲染手柄 */
  active: boolean;
  /** 拖拽进行中：手柄保持可见 */
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  className?: string;
}

/**
 * 媒体任务卡头部居中的拖拽手柄（AI 助手面板 → 画布）。
 *
 * 绝对定位于 header（需 relative）正中，默认 opacity-0 + pointer-events-none，
 * 仅在卡片 hover（外层需带 group 类）时显现并可交互；拖拽中保持可见。
 * 单色主题：background 胶囊 + border + muted 图标，随深浅主题自适应。
 */
export function TaskCardDragHandle({ active, isDragging, onDragStart, onDragEnd, className }: TaskCardDragHandleProps) {
  const { t } = useTranslation();

  return (
    <div
      draggable={active}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={t('ai.mediaTask.dragToCanvas', '拖拽到画布')}
      className={cn(
        'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10',
        'flex items-center rounded-full border border-border bg-background/90 px-1.5 py-0.5 shadow-sm backdrop-blur-sm',
        'cursor-grab active:cursor-grabbing transition-opacity',
        'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto',
        isDragging && 'opacity-100 pointer-events-auto',
        !active && 'hidden',
        className,
      )}
    >
      <GripVertical className="size-3.5 text-muted-foreground" />
    </div>
  );
}

export default TaskCardDragHandle;
