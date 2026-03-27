'use client';

import React from 'react';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';

function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : `${tokens}`;
}

const COLOR_MAP = [
  { threshold: 80, color: 'bg-red-500' },
  { threshold: 50, color: 'bg-amber-500' },
  { threshold: 0, color: 'bg-green-500' },
] as const;

export function ContextUsageBar() {
  const contextUsage = useAIAssistantStore((state) => state.contextUsage);

  if (!contextUsage) return null;

  const { usedTokens, contextWindow } = contextUsage;
  const percentage = contextWindow > 0 ? (usedTokens / contextWindow) * 100 : 0;
  const barColor = COLOR_MAP.find((c) => percentage >= c.threshold)?.color || 'bg-green-500';

  return (
    <div className="px-3 py-1.5 border-t border-border/50 shrink-0">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
        <span>上下文: {percentage.toFixed(1)}%</span>
        <span>
          {formatTokens(usedTokens)} / {formatTokens(contextWindow)} tokens
        </span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-300`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}
