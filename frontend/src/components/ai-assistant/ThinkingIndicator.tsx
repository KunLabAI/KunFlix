'use client';

import React, { useState, useEffect } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import { LoadingDots } from './LoadingDots';
import { cn } from '@/lib/utils';

interface ThinkingIndicatorProps {
  className?: string;
  showTimer?: boolean;
}

export function ThinkingIndicator({ className, showTimer = true }: ThinkingIndicatorProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg',
        'bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5',
        'border border-primary/20',
        className
      )}
    >
      <div className="relative">
        <Bot className="h-5 w-5 text-primary" />
        <Sparkles className="h-3 w-3 text-primary/60 absolute -top-1 -right-1 animate-pulse" />
      </div>
      <div className="flex items-center gap-2 flex-1">
        <span className="text-sm text-muted-foreground">AI 正在思考</span>
        <LoadingDots size="sm" className="text-primary/60" />
      </div>
      {showTimer && (
        <span className="text-xs text-muted-foreground/60 tabular-nums">
          {formatTime(elapsedTime)}
        </span>
      )}
    </div>
  );
}
