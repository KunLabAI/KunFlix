'use client';

import React from 'react';
import { ArrowRight, ImageIcon, Film, Music, UserRound, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { RefImage } from '../RefTagInput';
import type { PickerMode } from './types';

interface Props {
  pickerMode: PickerMode;
  imageUrl: string;
  lastFrameImageUrl: string;
  referenceImages: RefImage[];
  extensionVideoUrl: string;
  maxTotalRefs: number;
  showLastFrame: boolean;
  onOpenPicker: () => void;
  onClearImage: () => void;
  onClearFirstLast: () => void;
  onClearLastFrame: () => void;
  onClearExtensionVideo: () => void;
  onRemoveRefImage: (idx: number) => void;
}

/**
 * 附件预览区（位于输入框顶部）
 * 按 pickerMode 渲染 4 种不同布局：
 *  - single_image
 *  - first_last_frame
 *  - multi_image
 *  - video
 */
export function AttachmentPreviews(props: Props) {
  const { t } = useTranslation();
  const {
    pickerMode,
    imageUrl,
    lastFrameImageUrl,
    referenceImages,
    extensionVideoUrl,
    maxTotalRefs,
    showLastFrame,
    onOpenPicker,
    onClearImage,
    onClearFirstLast,
    onClearLastFrame,
    onClearExtensionVideo,
    onRemoveRefImage,
  } = props;

  // ── single_image ──
  if (pickerMode === 'single_image' && imageUrl) {
    return (
      <div className="px-3 pt-2.5 pb-0">
        <div className="relative inline-block group/imgpreview">
          <img
            src={imageUrl}
            alt="Reference"
            draggable={false}
            className="h-16 w-16 rounded-lg object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <button
            type="button"
            onClick={onClearImage}
            className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center opacity-0 group-hover/imgpreview:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
          >
            <X className="h-2.5 w-2.5" />
          </button>
          <div className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-black/60 text-white backdrop-blur-sm">
            {t('canvas.node.video.firstFrameImage')}
          </div>
        </div>
      </div>
    );
  }

  // ── first_last_frame (with imageUrl) ──
  if (pickerMode === 'first_last_frame' && imageUrl) {
    return (
      <div className="px-3 pt-2.5 pb-0 flex items-center gap-1.5">
        <div className="relative inline-block group/firstframe">
          <img
            src={imageUrl}
            alt="First frame"
            draggable={false}
            className="h-16 w-16 rounded-lg object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <button
            type="button"
            onClick={onClearFirstLast}
            className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center opacity-0 group-hover/firstframe:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
          >
            <X className="h-2.5 w-2.5" />
          </button>
          <div className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded text-[8px] font-semibold bg-emerald-600/80 text-white backdrop-blur-sm">
            {t('canvas.node.video.firstFrame')}
          </div>
        </div>

        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />

        {lastFrameImageUrl ? (
          <div className="relative inline-block group/lastframe">
            <img
              src={lastFrameImageUrl}
              alt="Last frame"
              draggable={false}
              className="h-16 w-16 rounded-lg object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <button
              type="button"
              onClick={onClearLastFrame}
              className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center opacity-0 group-hover/lastframe:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
            >
              <X className="h-2.5 w-2.5" />
            </button>
            <div className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded text-[8px] font-semibold bg-amber-600/80 text-white backdrop-blur-sm">
              {t('canvas.node.video.lastFrame')}
            </div>
          </div>
        ) : showLastFrame ? (
          <button
            type="button"
            onClick={onOpenPicker}
            className="h-16 w-16 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/40 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer group/addlast"
          >
            <ImageIcon className="w-3.5 h-3.5 text-muted-foreground/50 group-hover/addlast:text-primary/60 transition-colors" />
            <span className="text-[8px] text-muted-foreground/60 group-hover/addlast:text-primary/60 transition-colors">
              {t('canvas.node.video.addLastFrame')}
            </span>
          </button>
        ) : null}
      </div>
    );
  }

  // ── first_last_frame (empty placeholders) ──
  if (pickerMode === 'first_last_frame' && !imageUrl) {
    return (
      <div className="px-3 pt-2.5 pb-0 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenPicker}
          className="h-16 w-16 rounded-lg border-2 border-dashed border-border/60 hover:border-emerald-500/40 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer group/addfirst"
        >
          <ImageIcon className="w-3.5 h-3.5 text-muted-foreground/50 group-hover/addfirst:text-emerald-500/60 transition-colors" />
          <span className="text-[8px] text-muted-foreground/60 group-hover/addfirst:text-emerald-500/60 transition-colors">
            {t('canvas.node.video.firstFrame')}
          </span>
        </button>
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
        <button
          type="button"
          disabled
          className="h-16 w-16 rounded-lg border-2 border-dashed border-border/40 flex flex-col items-center justify-center gap-0.5 opacity-40 cursor-not-allowed"
        >
          <ImageIcon className="w-3.5 h-3.5 text-muted-foreground/50" />
          <span className="text-[8px] text-muted-foreground/60">{t('canvas.node.video.lastFrame')}</span>
        </button>
      </div>
    );
  }

  // ── multi_image ──
  if (pickerMode === 'multi_image' && referenceImages.length > 0) {
    return (
      <div className="px-3 pt-2.5 pb-0 flex gap-1.5 flex-wrap">
        {referenceImages.map((ref, idx) => {
          const isImg = ref.refType === 'image';
          const isVid = ref.refType === 'video';
          const isAud = ref.refType === 'audio';
          const isVirtualHuman = isImg && ref.url.startsWith('asset://');
          const imgIdx = isImg ? referenceImages.slice(0, idx).filter((r) => r.refType === 'image').length + 1 : 0;
          const tagColor = isVid ? 'text-amber-300'
            : isAud ? 'text-teal-300'
            : isVirtualHuman ? 'text-purple-300'
            : 'text-blue-300';
          const tagLabel = isVid
            ? `VIDEO_${referenceImages.slice(0, idx).filter((r) => r.refType === 'video').length + 1}`
            : isAud
              ? `AUDIO_${referenceImages.slice(0, idx).filter((r) => r.refType === 'audio').length + 1}`
              : `IMAGE_${imgIdx}`;
          const TypeIcon = isVid ? Film : isAud ? Music : isVirtualHuman ? UserRound : ImageIcon;

          return (
            <div key={idx} className="relative inline-block group/imgpreview">
              {isVid ? (
                <div className="h-14 w-14 rounded-lg border border-border/50 bg-muted overflow-hidden">
                  <video src={ref.url} draggable={false} className="w-full h-full object-cover" preload="metadata" muted />
                </div>
              ) : isAud ? (
                <div className="h-14 w-14 rounded-lg border border-border/50 bg-muted flex items-center justify-center">
                  <Music className="w-6 h-6 text-teal-400/60" />
                </div>
              ) : (ref.previewUrl || ref.url) && !(ref.url.startsWith('asset://') && !ref.previewUrl) ? (
                <img
                  src={ref.previewUrl || ref.url}
                  alt={ref.name}
                  draggable={false}
                  className="h-14 w-14 rounded-lg object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              {isImg && (
                <div className={cn(
                  'h-14 w-14 rounded-lg border border-border/50 bg-muted flex items-center justify-center',
                  (ref.previewUrl || (!ref.url.startsWith('asset://') && ref.url)) ? 'hidden absolute inset-0' : '',
                )}>
                  <UserRound className="w-6 h-6 text-muted-foreground/50" />
                </div>
              )}
              <button
                type="button"
                onClick={() => onRemoveRefImage(idx)}
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center opacity-0 group-hover/imgpreview:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
              >
                <X className="h-2.5 w-2.5" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 px-0.5 py-0.5 rounded-b-lg text-[7px] font-semibold bg-black/70 text-white backdrop-blur-sm text-center leading-tight truncate">
                <span className={tagColor}>&lt;{tagLabel}&gt;</span>
                <br />
                <span className="opacity-80">{ref.name}</span>
              </div>
              <div className="absolute top-0.5 left-0.5">
                <TypeIcon className={cn(
                  'w-3 h-3',
                  isVid ? 'text-amber-400'
                    : isAud ? 'text-teal-400'
                    : isVirtualHuman ? 'text-purple-400'
                    : 'text-emerald-400',
                )} />
              </div>
            </div>
          );
        })}
        <span className="text-[9px] text-muted-foreground self-end pb-1">
          {referenceImages.length}/{maxTotalRefs}
        </span>
      </div>
    );
  }

  // ── video (extension) ──
  if (pickerMode === 'video' && extensionVideoUrl) {
    return (
      <div className="px-3 pt-2.5 pb-0">
        <div className="relative inline-block group/vidpreview">
          <div className="h-16 w-24 rounded-lg bg-muted border border-border/50 flex items-center justify-center overflow-hidden">
            <video src={extensionVideoUrl} draggable={false} className="w-full h-full object-cover" preload="metadata" muted />
          </div>
          <button
            type="button"
            onClick={onClearExtensionVideo}
            className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-background border border-border/50 shadow-sm flex items-center justify-center opacity-0 group-hover/vidpreview:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
          >
            <X className="h-2.5 w-2.5" />
          </button>
          <div className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-black/60 text-white backdrop-blur-sm">
            {t('canvas.node.video.sourceVideo')}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
