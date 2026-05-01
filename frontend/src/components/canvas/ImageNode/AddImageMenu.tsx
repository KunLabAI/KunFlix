'use client';

import React from 'react';
import { Upload, FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  menuRef: React.RefObject<HTMLDivElement | null>;
  onUploadClick: (e?: React.MouseEvent) => void;
  onPickFromLibrary: (e?: React.MouseEvent) => void;
}

/**
 * Plus 按钮级联：上传 / 从资产库
 */
export function AddImageMenu({ menuRef, onUploadClick, onPickFromLibrary }: Props) {
  const { t } = useTranslation();
  return (
    <div
      ref={menuRef}
      className="absolute left-1/2 -translate-x-1/2 -top-[108px] flex items-center bg-background/95 backdrop-blur-md border border-border/60 rounded-full px-1 py-1 shadow-lg pointer-events-auto nodrag animate-in fade-in zoom-in-95 duration-150 z-30"
    >
      <button
        className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
        onClick={(e) => { e.stopPropagation(); onUploadClick(e); }}
        title={t('canvas.node.upload.uploadImage')}
      >
        <Upload className="w-3.5 h-3.5" />
      </button>
      <div className="w-px h-4 bg-border/50" />
      <button
        className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
        onClick={(e) => { e.stopPropagation(); onPickFromLibrary(e); }}
        title={t('canvas.node.upload.fromLibrary')}
      >
        <FolderOpen className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
