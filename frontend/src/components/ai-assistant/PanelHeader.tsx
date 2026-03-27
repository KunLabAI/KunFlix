'use client';

import React from 'react';
import { X, Trash2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PanelHeaderProps {
  onClearSession: () => void;
  onClose: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  className?: string;
}

export function PanelHeader({
  onClearSession,
  onClose,
  onDragStart,
  className,
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 border-b bg-secondary/30 cursor-grab active:cursor-grabbing',
        className
      )}
      onPointerDown={onDragStart}
    >
      {/* 左侧：简洁的AI助手标识 */}
      <div className="flex items-center gap-2 pointer-events-none">
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-sm font-medium text-foreground">AI 助手</span>
      </div>

      <div className="flex items-center gap-1 pointer-events-auto">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-muted"
          onClick={async (e) => {
            e.stopPropagation();
            onClearSession();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="清空对话"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive z-50"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
