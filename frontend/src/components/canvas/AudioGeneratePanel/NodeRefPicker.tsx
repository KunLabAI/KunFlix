'use client';

import React, { useRef } from 'react';
import { Paperclip } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useDropdownOutside } from '@/hooks/useDropdownOutside';
import { NodePickerDropdown, type NodePickerItem } from '../NodePickerDropdown';
import type { CanvasNode } from '@/store/useCanvasStore';
import { getImageNodeUrl } from './utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 仅返回图像/角色节点，供 Lyria 多模态参考图使用 */
  imageNodes: CanvasNode[];
  taskActive: boolean;
  /** 是否已选择过参考图（图标高亮） */
  hasSelection: boolean;
  imageRefCount: number;
  maxImages: number;
  /** 返回 true 表示选择后应关闭 picker */
  onSelect: (node: CanvasNode) => boolean;
}

/** 画布图像节点选择器，用于向 Lyria 多模态输入添加参考图 */
export function NodeRefPicker({
  open,
  onOpenChange,
  imageNodes,
  taskActive,
  hasSelection,
  imageRefCount,
  maxImages,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useDropdownOutside([[open, ref, onOpenChange]]);

  const handleSelect = (node: CanvasNode) => {
    const shouldClose = onSelect(node);
    shouldClose && onOpenChange(false);
  };

  const disabled = taskActive || imageNodes.length === 0;
  const atLimit = imageRefCount >= maxImages;
  const title = t('canvas.node.audio.selectRefImages', { max: maxImages });

  const items = imageNodes.map<NodePickerItem>((node) => {
    const data = node.data as Record<string, unknown>;
    const label = (data.name || node.id.slice(0, 8)) as string;
    return {
      node,
      label,
      thumbUrl: getImageNodeUrl(node),
      disabled: atLimit,
    };
  });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        disabled={disabled}
        className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center',
          'text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          open && 'bg-accent text-foreground',
          hasSelection && 'text-primary',
        )}
        title={title}
      >
        <Paperclip className="w-4 h-4" />
      </button>

      {open && (
        <NodePickerDropdown
          open={open}
          anchor="top"
          align="right"
          title={title}
          emptyText={t('canvas.node.audio.noImageNodes', '画布上暂无图像节点')}
          items={items}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}
