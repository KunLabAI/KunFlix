'use client';

import React, { useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { handleTextDragStart, cleanupDragPreview } from '@/lib/dragToCanvas';

interface DraggableTextWrapperProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * 可拖拽文本包装器
 * 用户选中文本后直接拖拽到画布创建文本节点
 */
export function DraggableTextWrapper({ children, className }: DraggableTextWrapperProps) {
  const dragPreviewRef = useRef<HTMLElement | null>(null);

  // 拦截拖拽开始事件，当有选中文本时设置自定义拖拽数据
  const onDragStart = useCallback((e: React.DragEvent) => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || '';
    
    // 没有选中文本则不处理
    selectedText && (dragPreviewRef.current = handleTextDragStart(e, selectedText));
  }, []);

  const onDragEnd = useCallback(() => {
    cleanupDragPreview(dragPreviewRef.current);
    dragPreviewRef.current = null;
    // 清除选中
    window.getSelection()?.removeAllRanges();
  }, []);

  return (
    <div 
      className={cn('relative', className)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {children}
    </div>
  );
}
