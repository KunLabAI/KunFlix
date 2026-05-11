'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  prompt: string;
  setPrompt: (v: string) => void;
  taskActive: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  maxHeight: number;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  resizeHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
  };
}

/**
 * 音乐生成 prompt 输入区：textarea + 底部拖拽缩放柄（对齐 ImageGeneratePanel/PromptInput）。
 * 不支持 <IMAGE_N> 内联标签——音乐的多模态参考图直接显示在附件预览区。
 * Enter 提交、Shift+Enter 换行（与图像面板一致）。
 */
export function PromptInputArea({
  prompt,
  setPrompt,
  taskActive,
  canSubmit,
  onSubmit,
  maxHeight,
  textareaRef,
  resizeHandlers,
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
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('canvas.node.audio.promptPlaceholder', '描述你想要的音乐风格、情绪或场景...')}
        disabled={taskActive}
        rows={2}
        className={cn(
          'w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13px] leading-relaxed',
          'placeholder:text-muted-foreground/60 focus:outline-none',
          'disabled:opacity-60 disabled:cursor-not-allowed custom-scrollbar',
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
