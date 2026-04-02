'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * 画布自定义光标组件
 * 显示当前操作模式下的光标状态
 */
export function CanvasCursor() {
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [cursorMode, setCursorMode] = useState<'default' | 'pan' | 'select'>('default');

  useEffect(() => {
    const handleMouseMove = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      setCursorPos({ x: mouseEvent.clientX, y: mouseEvent.clientY });
      if (!isVisible) setIsVisible(true);
    };

    const handleMouseLeave = () => {
      setIsVisible(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.ctrlKey || e.metaKey) {
        setCursorMode('pan');
      } else if (e.shiftKey) {
        setCursorMode('select');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || (!e.ctrlKey && !e.metaKey && !e.shiftKey)) {
        setCursorMode('default');
      }
    };

    // 监听画布区域的鼠标事件
    const canvas = document.querySelector('.react-flow__pane');
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseleave', handleMouseLeave);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseleave', handleMouseLeave);
      }
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        'fixed pointer-events-none z-[9999] transition-transform duration-75',
        cursorMode === 'pan' && 'scale-110'
      )}
        style={{
        left: cursorPos.x,
        top: cursorPos.y,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* 默认/框选模式 - 十字准星 */}
      {cursorMode !== 'pan' && (
        <div className="relative w-6 h-6">
          {/* 外圆环 */}
          <div className="absolute inset-0 rounded-full border-2 border-primary/30" />
          {/* 十字线 */}
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-primary -translate-y-1/2" />
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-primary -translate-x-1/2" />
          {/* 中心点 */}
          <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-primary rounded-full -translate-x-1/2 -translate-y-1/2" />
        </div>
      )}

      {/* 拖拽模式 - 手型 */}
      {cursorMode === 'pan' && (
        <div className="relative">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className="text-primary drop-shadow-md"
          >
            <path
              d="M8.5 8.5L6 11V17C6 18.1046 6.89543 19 8 19H16C17.1046 19 18 18.1046 18 17V11L15.5 8.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="rgba(var(--primary), 0.2)"
            />
            <path
              d="M12 5V14M12 14L9 11M12 14L15 11"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

/**
 * 画布操作提示组件
 * 显示当前可用的操作提示
 */
export function CanvasHints() {
  const [showHints, setShowHints] = useState(true);

  useEffect(() => {
    // 3秒后自动隐藏提示
    const timer = setTimeout(() => {
      setShowHints(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  if (!showHints) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="flex items-center gap-4 px-4 py-2 bg-card/90 backdrop-blur-sm border border-border/50 rounded-full shadow-lg text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span>左键拖拽</span>
          <span className="text-foreground">框选</span>
        </span>
        <span className="w-px h-3 bg-border" />
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Space</kbd>
          <span>+ 拖拽</span>
          <span className="text-foreground">移动画布</span>
        </span>
        <span className="w-px h-3 bg-border" />
        <span className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Shift</kbd>
          <span>+ 点击</span>
          <span className="text-foreground">多选</span>
        </span>
      </div>
    </div>
  );
}
