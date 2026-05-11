'use client';

import React from 'react';
import { Music } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';

interface Props {
  name: string;
  isEditing: boolean;
  editValue: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onEdit: (v: string) => void;
  onEnterEdit: (e: React.MouseEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * 节点顶部信息条：Music 图标 + 标题（可双击编辑）
 */
export function NodeHeader({
  name,
  isEditing,
  editValue,
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
            className="font-bold text-sm h-7 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-0 focus:outline-none px-0 cursor-text select-text rounded-none leading-none"
            placeholder={t('canvas.node.unnamedAudioCard', '未命名音频')}
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
            <Music className="w-4 h-4 text-node-purple mr-2 shrink-0" />
            {name || t('canvas.node.unnamedAudioCard', '未命名音频')}
          </h3>
        )}
      </div>
    </div>
  );
}
