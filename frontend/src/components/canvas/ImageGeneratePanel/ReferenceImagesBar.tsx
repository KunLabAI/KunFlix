'use client';

import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ImageRef } from './types';

interface Props {
  referenceImages: ImageRef[];
  taskActive: boolean;
  onRemove: (idx: number) => void;
}

export function ReferenceImagesBar({ referenceImages, taskActive, onRemove }: Props) {
  const { t } = useTranslation();
  if (referenceImages.length === 0) return null;

  return (
    <div className="px-3 pt-2.5 pb-0 flex gap-1.5 flex-wrap">
      {referenceImages.map((r, i) => (
        <div key={`${r.sourceNodeId}-${i}`} className="relative inline-block group/imgpreview">
          <img
            src={r.url}
            alt={r.name}
            draggable={false}
            className="h-14 w-14 rounded-lg object-cover"
          />
          <button
            type="button"
            onClick={() => onRemove(i)}
            disabled={taskActive}
            className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center opacity-0 group-hover/imgpreview:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground disabled:opacity-30"
            title={t('canvas.node.image.removeRef', '移除')}
          >
            <X className="h-2.5 w-2.5" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 px-0.5 py-0.5 rounded-b-lg text-[7px] font-semibold bg-black/70 text-white backdrop-blur-sm text-center leading-tight truncate">
            <span className="text-blue-300">&lt;IMAGE_{i + 1}&gt;</span>
            <br />
            <span className="opacity-80">{r.name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
