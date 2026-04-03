'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';

function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : `${tokens}`;
}

function formatTokensFull(tokens: number): string {
  return tokens.toLocaleString();
}

// 获取电池格子的颜色状态
function getCellColor(filled: boolean, percentage: number): string {
  if (!filled) return 'bg-muted/50';
  if (percentage >= 90) return 'bg-[var(--color-status-error-icon)]';
  if (percentage >= 70) return 'bg-[var(--color-status-warning-icon)]';
  return 'bg-[var(--color-status-success-icon)]';
}

export function ContextUsageBar() {
  const contextUsage = useAIAssistantStore((state) => state.contextUsage);
  const [isHovered, setIsHovered] = useState(false);

  if (!contextUsage) return null;

  const { usedTokens, contextWindow } = contextUsage;
  const percentage = contextWindow > 0 ? (usedTokens / contextWindow) * 100 : 0;
  const clampedPercentage = Math.min(percentage, 100);

  // 计算四格电池的填充状态
  const cells = [25, 50, 75, 100];
  const filledCells = cells.map((threshold) => clampedPercentage >= threshold);

  // 计算剩余token
  const remainingTokens = Math.max(0, contextWindow - usedTokens);

  return (
    <div className="px-3 py-2 border-t border-border/50 shrink-0">
      <div className="flex items-center justify-between">
        {/* 左侧：迷你电池图标 + hover展开详细信息 */}
        <div
          className="relative flex items-center"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* 迷你电池图标 */}
          <div className="flex items-center gap-[2px] p-[2px] bg-muted/30 rounded border border-border/20">
            {/* 四格电池 - 缩小版 */}
            {cells.map((_, index) => (
              <div
                key={index}
                className={`
                  w-1.5 h-2.5 rounded-[1px] transition-colors duration-300
                  ${getCellColor(filledCells[index], percentage)}
                `}
              />
            ))}
            {/* 电池头部 */}
            <div className="w-[1.5px] h-1.5 bg-muted-foreground/20 rounded-full ml-[1px]" />
          </div>

          {/* Hover展开的详细信息 */}
          <AnimatePresence>
            {isHovered && (
              <motion.div
                initial={{ opacity: 0, x: -10, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute left-full ml-2 z-50 bg-popover border border-border/50 rounded-lg shadow-lg p-3 min-w-[180px]"
              >
                <div className="space-y-2">
                  {/* 标题 */}
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    上下文使用统计
                  </div>

                  {/* 进度条 */}
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full ${
                        percentage >= 90 ? 'bg-[var(--color-status-error-icon)]' : percentage >= 70 ? 'bg-[var(--color-status-warning-icon)]' : 'bg-[var(--color-status-success-icon)]'
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${clampedPercentage}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>

                  {/* 详细数据 */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                    <div className="text-muted-foreground">已使用</div>
                    <div className="text-right font-medium tabular-nums">
                      {formatTokensFull(usedTokens)}
                    </div>

                    <div className="text-muted-foreground">上限</div>
                    <div className="text-right font-medium tabular-nums">
                      {formatTokensFull(contextWindow)}
                    </div>

                    <div className="text-muted-foreground">剩余</div>
                    <div className="text-right font-medium tabular-nums text-[var(--color-status-success-text)]">
                      {formatTokensFull(remainingTokens)}
                    </div>

                    <div className="text-muted-foreground">使用率</div>
                    <div className={`text-right font-medium tabular-nums ${
                      percentage >= 90 ? 'text-[var(--color-status-error-text)]' : percentage >= 70 ? 'text-[var(--color-status-warning-text)]' : 'text-[var(--color-status-success-text)]'
                    }`}>
                      {percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* 小三角箭头 */}
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-popover border-l border-b border-border/50 rotate-45" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 右侧：简洁的百分比显示 */}
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-medium tabular-nums ${
            percentage >= 90 ? 'text-[var(--color-status-error-text)]' : percentage >= 70 ? 'text-[var(--color-status-warning-text)]' : 'text-muted-foreground'
          }`}>
            {percentage.toFixed(0)}%
          </span>
          <span className="text-[10px] text-muted-foreground/50">
            上下文
          </span>
        </div>
      </div>
    </div>
  );
}
