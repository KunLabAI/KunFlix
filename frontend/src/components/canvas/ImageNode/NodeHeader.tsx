'use client';

import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';
import { MAX_IMAGES } from './constants';

interface Props {
  name: string;
  isEditing: boolean;
  editValue: string;
  imageCount: number;
  imageDimensions: { width: number; height: number } | null;
  lastDurationMs: number | null;
  taskActive: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onEdit: (v: string) => void;
  onEnterEdit: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * 节点顶部信息条：图标 + 标题（可双击编辑）+ 分辨率/张数 + 最近一次生成耗时
 */
export function NodeHeader({
  name,
  isEditing,
  editValue,
  imageCount,
  imageDimensions,
  lastDurationMs,
  taskActive,
  inputRef,
  onEdit,
  onEnterEdit,
  onKeyDown,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 px-1 flex items-center justify-between gap-2 min-h-[28px] nodrag">
      <div className="flex-1 min-w-0 flex items-center">
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => onEdit(e.target.value)}
            className="font-bold text-sm h-7 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-0 focus:outline-none px-0 shadow-none cursor-text select-text rounded-none leading-none"
            placeholder={t('canvas.node.unnamedImageCard')}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={onKeyDown}
            autoFocus
          />
        ) : (
          <h3
            className="font-bold text-sm h-7 flex items-center truncate text-foreground/90 cursor-text select-text hover:text-primary leading-none"
            title={name}
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={onEnterEdit}
          >
            <ImageIcon className="w-4 h-4 text-node-green mr-2 shrink-0" />
            {name || t('canvas.node.unnamedImageCard')}
          </h3>
        )}
      </div>

      {imageDimensions && imageCount === 1 && (
        <div className="text-xs font-medium text-muted-foreground/60 flex-shrink-0 select-none">
          {imageDimensions.width}×{imageDimensions.height}
        </div>
      )}

      {imageCount > 1 && (
        <div className="text-xs font-medium text-muted-foreground/60 flex-shrink-0 select-none">
          {imageCount}/{MAX_IMAGES}
        </div>
      )}

      {!taskActive && lastDurationMs !== null && (
        <div
          className="text-xs font-mono text-blue-400/80 flex-shrink-0 select-none tabular-nums ml-1"
          title={t('canvas.node.image.lastDuration', '本次生成耗时')}
        >
          {(lastDurationMs / 1000).toFixed(1)}s
        </div>
      )}
    </div>
  );
}
