'use client';

import React, { useRef } from 'react';
import { Paperclip } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useDropdownOutside } from '@/hooks/useDropdownOutside';
import { NodePickerDropdown, type NodePickerItem } from '../NodePickerDropdown';
import type { CanvasNode } from '@/store/useCanvasStore';
import type { PickerMode } from './types';
import { getImageNodeUrl, getVideoNodeUrl } from './utils';

interface Props {
  /** 受控展开状态 —— 允许外部按钮（如附件预览中的"添加首帧"）触发打开 */
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pickerMode: PickerMode;
  pickerNodes: CanvasNode[];
  imageNodes: CanvasNode[];
  imageUrl: string;
  hasPickerSelection: boolean;
  taskActive: boolean;
  imageRefCount: number;
  videoRefCount: number;
  audioRefCount: number;
  maxRefImages: number;
  maxRefVideos: number;
  maxRefAudios: number;
  maxTotalRefs: number;
  /** 返回 true 表示选择后应关闭 picker */
  onSelect: (node: CanvasNode) => boolean;
}

/**
 * 画布节点选择器按钮 + 下拉。
 * - first_last_frame：总是在 imageNodes 中选择
 * - 其他模式：在 pickerNodes 中选择，按类型判断是否达到上限
 */
export function NodeRefPicker({
  open,
  onOpenChange,
  pickerMode,
  pickerNodes,
  imageNodes,
  imageUrl,
  hasPickerSelection,
  taskActive,
  imageRefCount,
  videoRefCount,
  audioRefCount,
  maxRefImages,
  maxRefVideos,
  maxRefAudios,
  maxTotalRefs,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useDropdownOutside([[open, ref, onOpenChange]]);

  const handleSelect = (node: CanvasNode) => {
    const shouldClose = onSelect(node);
    shouldClose && onOpenChange(false);
  };

  const isFirstLast = pickerMode === 'first_last_frame';
  const sourceNodes = isFirstLast ? imageNodes : pickerNodes;
  const disabled = taskActive || sourceNodes.length === 0;

  const triggerTitle = isFirstLast
    ? (!imageUrl ? t('canvas.node.video.selectFirstFrame') : t('canvas.node.video.selectLastFrame'))
    : (pickerMode === 'video' ? t('canvas.node.video.selectVideoNode') : t('canvas.node.video.selectImageNode'));

  const dropdownTitle = isFirstLast
    ? (!imageUrl ? t('canvas.node.video.selectFirstFrame') : t('canvas.node.video.selectLastFrame'))
    : pickerMode === 'video'
      ? t('canvas.node.video.selectVideoNode')
      : pickerMode === 'multi_image'
        ? t('canvas.node.video.selectRefImages', { max: maxTotalRefs })
        : t('canvas.node.video.selectImageNode');

  const emptyText = isFirstLast || pickerMode !== 'video'
    ? t('canvas.node.video.noImageNodes')
    : t('canvas.node.video.noVideoNodes');

  const items = sourceNodes.map<NodePickerItem>((node) => {
    const data = node.data as Record<string, unknown>;
    const label = (data.name || node.id.slice(0, 8)) as string;

    // first_last_frame：全部视为图像
    if (isFirstLast) {
      return { node, label, thumbUrl: getImageNodeUrl(node) };
    }

    const nt = node.type as string;
    const isVideo = pickerMode === 'video' || nt === 'video';
    const isAudio = nt === 'audio';
    const thumbUrl = isVideo ? getVideoNodeUrl(node) : isAudio ? null : getImageNodeUrl(node);
    const atLimit = isVideo ? videoRefCount >= maxRefVideos
      : isAudio ? audioRefCount >= maxRefAudios
      : imageRefCount >= maxRefImages;

    return {
      node,
      label,
      thumbUrl,
      disabled: pickerMode === 'multi_image' && atLimit,
    };
  });

  const highlightActive = isFirstLast ? !!imageUrl : hasPickerSelection;

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
          highlightActive && 'text-primary',
        )}
        title={triggerTitle}
      >
        <Paperclip className="w-4 h-4" />
      </button>

      {open && (
        <NodePickerDropdown
          open={open}
          anchor="bottom"
          align="right"
          title={dropdownTitle}
          emptyText={emptyText}
          items={items}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}
