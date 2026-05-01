'use client';

import React from 'react';
import { Wand2, Images } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ImageMode } from '@/hooks/useImageGeneration';
import { normalizeImageUrl } from './utils';

interface Props {
  imageList: string[];
  showEditPicker: boolean;
  pickerRef: React.RefObject<HTMLDivElement | null>;
  onQuickMode: (mode: ImageMode, e?: React.MouseEvent) => void;
  onPickEditImage: (url: string, e?: React.MouseEvent) => void;
}

/**
 * 节点内右下角快捷模式切换器：
 * - Wand2：切到 edit 模式（多图时先弹出缩略图选择）
 * - Images：切到 reference_images 模式（所有图作为参考）
 */
export function QuickModeSwitcher({
  imageList,
  showEditPicker,
  pickerRef,
  onQuickMode,
  onPickEditImage,
}: Props) {
  const { t } = useTranslation();
  return (
    <div
      ref={pickerRef}
      className={cn(
        'absolute bottom-2 right-2 z-[22] flex items-end gap-1 nodrag pointer-events-auto transition-opacity duration-200',
        showEditPicker ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}
    >
      {showEditPicker && imageList.length > 1 && (
        <div
          className="flex items-center gap-1 p-1 rounded-xl bg-background/95 backdrop-blur-md border border-border/60 shadow-lg animate-in fade-in slide-in-from-bottom-1 duration-150"
          role="listbox"
          aria-label={t('canvas.node.image.pickEditImage', '选择要编辑的图片')}
        >
          {imageList.map((url, i) => {
            const displayUrl = normalizeImageUrl(url);
            return (
              <button
                key={`edit-pick-${i}`}
                type="button"
                role="option"
                onClick={(e) => onPickEditImage(url, e)}
                onPointerDown={(e) => e.stopPropagation()}
                title={`${t('canvas.node.image.currentImage', '当前图像')} #${i + 1}`}
                className="relative h-10 w-10 rounded-md overflow-hidden border border-border/50 hover:border-primary hover:ring-2 hover:ring-primary/40 transition-all"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayUrl}
                  alt={`image-${i + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
                <span className="absolute bottom-0 right-0 px-1 text-[9px] font-semibold bg-black/70 text-white rounded-tl leading-[1.2]">
                  {i + 1}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={(e) => onQuickMode('edit', e)}
          onPointerDown={(e) => e.stopPropagation()}
          title={t('canvas.node.image.switchToEdit', '用此图进行图像编辑')}
          aria-expanded={showEditPicker}
          className={cn(
            'h-7 w-7 rounded-full bg-background/90 backdrop-blur-md border shadow-sm hover:text-foreground hover:bg-secondary active:scale-90 transition-all flex items-center justify-center',
            showEditPicker ? 'border-primary text-primary' : 'border-border/60 text-muted-foreground',
          )}
        >
          <Wand2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => onQuickMode('reference_images', e)}
          onPointerDown={(e) => e.stopPropagation()}
          title={t('canvas.node.image.switchToReference', '用此图作为多图参考')}
          className="h-7 w-7 rounded-full bg-background/90 backdrop-blur-md border border-border/60 shadow-sm text-muted-foreground hover:text-foreground hover:bg-secondary active:scale-90 transition-all flex items-center justify-center"
        >
          <Images className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
