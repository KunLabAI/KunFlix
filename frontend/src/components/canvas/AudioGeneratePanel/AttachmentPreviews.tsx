'use client';

import React from 'react';
import { X, ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface ReferenceImage {
  id: string;
  url: string;            // 规范化后的 URL
  sourceNodeId?: string;  // 若来自画布节点则保留
  name?: string;
}

interface Props {
  references: ReferenceImage[];
  maxImages: number;
  onRemove: (id: string) => void;
  onOpenPicker: () => void;
  taskActive: boolean;
}

/**
 * 参考图附件预览：横向排列缩略图 + 删除按钮 + "添加"槽位。
 * 仅在 Lyria 模型且存在参考时显示。
 */
export function AttachmentPreviews({
  references,
  maxImages,
  onRemove,
  onOpenPicker,
  taskActive,
}: Props) {
  const { t } = useTranslation();
  const full = references.length >= maxImages;

  if (references.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 overflow-x-auto custom-scrollbar">
      {references.map((r) => (
        <div key={r.id} className="relative shrink-0 group/item">
          <img
            src={r.url}
            alt={r.name || ''}
            className="h-12 w-12 rounded-md object-cover border border-border/50"
          />
          <button
            type="button"
            onClick={() => onRemove(r.id)}
            disabled={taskActive}
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity disabled:opacity-0"
            title={t('canvas.node.audio.removeRefImage', '移除参考图')}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      ))}
      {!full && (
        <button
          type="button"
          onClick={onOpenPicker}
          disabled={taskActive}
          className={cn(
            'h-12 w-12 rounded-md border border-dashed border-border/60 flex items-center justify-center shrink-0',
            'text-muted-foreground hover:text-foreground hover:border-border transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          title={t('canvas.node.audio.addRefImage', '添加参考图')}
        >
          <ImageIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
