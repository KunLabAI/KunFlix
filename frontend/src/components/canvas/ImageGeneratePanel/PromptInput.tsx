'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (v: string) => void;
  taskActive: boolean;
  maxHeight: number;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  resizeHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
  };
  onSubmit: () => void;
  canSubmit: boolean;
}

/**
 * Prompt 文本输入 + 底部拖拽缩放柄（仅 UI，状态由 hook 管理）。
 * Enter 提交、Shift+Enter 换行。
 */
export function PromptInput({
  value,
  onChange,
  taskActive,
  maxHeight,
  textareaRef,
  resizeHandlers,
  onSubmit,
  canSubmit,
}: Props) {
  const { t } = useTranslation();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.key === 'Enter' && !e.shiftKey && (() => {
      e.preventDefault();
      canSubmit && onSubmit();
    })();
  };

  return (
    <>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('canvas.node.image.promptPlaceholder', '描述你想生成的图像内容...')}
        disabled={taskActive}
        rows={2}
        className={cn(
          'w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13px] leading-relaxed',
          'placeholder:text-muted-foreground/60 focus:outline-none',
          'disabled:opacity-60 disabled:cursor-not-allowed',
        )}
        style={{ maxHeight, minHeight: 44 }}
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
