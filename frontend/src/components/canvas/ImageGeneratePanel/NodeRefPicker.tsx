'use client';

import React, { useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { NodePickerDropdown, type NodePickerItem } from '../NodePickerDropdown';
import type { CanvasNode, CharacterNodeData } from '@/store/useCanvasStore';
import { useDropdownOutside } from '@/hooks/useDropdownOutside';

interface PickableItem {
  node: CanvasNode;
  url: string | null;
}

interface Props {
  pickableNodes: PickableItem[];
  referencesCount: number;
  maxRefs: number;
  taskActive: boolean;
  onSelect: (node: CanvasNode) => boolean; // true 表示选择后应关闭
}

export function NodeRefPicker({ pickableNodes, referencesCount, maxRefs, taskActive, onSelect }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useDropdownOutside([[open, ref, setOpen]]);

  const handleSelect = (node: CanvasNode) => {
    const shouldClose = onSelect(node);
    shouldClose && setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={taskActive || pickableNodes.length === 0}
        className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center',
          'text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          open && 'bg-accent text-foreground',
          referencesCount > 0 && 'text-primary',
        )}
        title={t('canvas.node.image.pickRefNode', '选择参考图节点')}
      >
        <Paperclip className="w-4 h-4" />
      </button>
      {open && (
        <NodePickerDropdown
          open={open}
          anchor="bottom"
          align="right"
          title={t('canvas.node.image.pickRefNodeHint', '已选 {{c}}/{{m}}', { c: referencesCount, m: maxRefs })}
          emptyText={t('canvas.node.image.noPickableNodes', '画布中没有可用的图像节点')}
          items={pickableNodes.map<NodePickerItem>(({ node, url }) => {
            const data = node.data as CharacterNodeData;
            const atLimit = referencesCount >= maxRefs;
            return {
              node,
              label: data.name || node.id.slice(0, 8),
              thumbUrl: url,
              disabled: atLimit,
            };
          })}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}
