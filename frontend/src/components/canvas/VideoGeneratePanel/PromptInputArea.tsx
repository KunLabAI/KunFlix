'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import RefTagInput, { type RefTagInputRef, type RefImage } from '../RefTagInput';

interface Props {
  inputRef: React.RefObject<RefTagInputRef | null>;
  prompt: string;
  setPrompt: (v: string) => void;
  referenceImages: RefImage[];
  taskActive: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  maxHeight: number | null;
  resizeHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
  };
}

/**
 * RefTagInput（富文本输入，支持内联 <IMAGE_N> tag）
 * + 底部拖拽缩放柄（结合 useVideoPanelResize hook）。
 */
export function PromptInputArea({
  inputRef,
  prompt,
  setPrompt,
  referenceImages,
  taskActive,
  canSubmit,
  onSubmit,
  maxHeight,
  resizeHandlers,
}: Props) {
  const { t } = useTranslation();

  return (
    <>
      <RefTagInput
        ref={inputRef}
        value={prompt}
        onChange={setPrompt}
        referenceImages={referenceImages}
        placeholder={t('canvas.node.video.promptPlaceholder')}
        disabled={taskActive}
        onSubmit={() => canSubmit && onSubmit()}
        maxHeight={maxHeight ?? undefined}
      />
      <div
        className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center justify-center h-3 w-12 cursor-ns-resize group/resize select-none z-10"
        {...resizeHandlers}
      >
        <div className="w-8 h-[3px] rounded-full bg-border/40 group-hover/resize:bg-border/80 group-active/resize:bg-primary/60 transition-colors" />
      </div>
    </>
  );
}
