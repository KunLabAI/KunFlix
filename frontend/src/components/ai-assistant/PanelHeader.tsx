'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Battery, BatteryMedium, BatteryLow, BatteryWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ContextUsage } from '@/store/useAIAssistantStore';

interface PanelHeaderProps {
  onClearSession: () => void;
  onClose: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  className?: string;
  contextUsage?: ContextUsage | null;
  isLoading?: boolean;
}

export function PanelHeader({
  onClearSession,
  onClose,
  onDragStart,
  className,
  contextUsage,
  isLoading = false,
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 border-b bg-secondary/30 cursor-grab active:cursor-grabbing',
        className
      )}
      onPointerDown={onDragStart}
    >
      {/* 左侧：上下文窗口使用情况 */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <HeaderContextBattery
          contextUsage={contextUsage}
          isLoading={isLoading}
        />
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

// 头部上下文电池组件（按10%步长显示）
interface HeaderContextBatteryProps {
  contextUsage: ContextUsage | null | undefined;
  isLoading: boolean;
}

function HeaderContextBattery({ contextUsage, isLoading }: HeaderContextBatteryProps) {
  const [isHovered, setIsHovered] = useState(false);

  // 默认值为 0% 状态
  const usedTokens = contextUsage?.usedTokens ?? 0;
  const contextWindow = contextUsage?.contextWindow ?? 0;

  const percentage = contextWindow > 0
    ? (usedTokens / contextWindow) * 100
    : 0;
  const clampedPercentage = Math.min(percentage, 100);
  const remainingTokens = Math.max(0, contextWindow - usedTokens);

  // 按10%步长获取电池图标和颜色
  const getBatteryIcon = () => {
    // 100% 红色警告状态
    if (percentage >= 100) {
      return (
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [1, 0.7, 1],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <BatteryWarning className="h-4 w-4 text-red-500" />
        </motion.div>
      );
    }
    // 90-99%
    if (percentage >= 90) return <BatteryWarning className="h-4 w-4 text-red-500" />;
    // 80-89%
    if (percentage >= 80) return <BatteryLow className="h-4 w-4 text-orange-500" />;
    // 70-79%
    if (percentage >= 70) return <BatteryLow className="h-4 w-4 text-amber-500" />;
    // 60-69%
    if (percentage >= 60) return <BatteryMedium className="h-4 w-4 text-yellow-500" />;
    // 50-59%
    if (percentage >= 50) return <BatteryMedium className="h-4 w-4 text-lime-500" />;
    // 40-49%
    if (percentage >= 40) return <BatteryMedium className="h-4 w-4 text-emerald-500" />;
    // 30-39%
    if (percentage >= 30) return <Battery className="h-4 w-4 text-emerald-500" />;
    // 20-29%
    if (percentage >= 20) return <Battery className="h-4 w-4 text-emerald-400" />;
    // 10-19%
    if (percentage >= 10) return <Battery className="h-4 w-4 text-emerald-300" />;
    // 0-9%
    return <Battery className="h-4 w-4 text-emerald-200" />;
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 px-2 rounded-lg hover:bg-muted/50 flex items-center gap-2"
        title={`上下文: ${percentage.toFixed(0)}%`}
      >
        {getBatteryIcon()}
        <span className={cn(
          "text-xs font-medium tabular-nums",
          percentage >= 100 ? 'text-red-500' :
          percentage >= 90 ? 'text-red-500' :
          percentage >= 70 ? 'text-amber-500' :
          'text-emerald-500'
        )}>
          {percentage.toFixed(0)}%
        </span>
        {/* 消耗动画效果 */}
        {isLoading && (
          <motion.div
            className="absolute inset-0 rounded-lg bg-primary/10"
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
      </Button>

      {/* Hover展开的详细信息面板 - 居中向下弹出，向右偏移 */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full mt-2 left-1/2 translate-x-0 z-[100] bg-popover border border-border/50 rounded-lg shadow-lg p-3 min-w-[180px]"
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
                    percentage >= 100 ? 'bg-red-500' :
                    percentage >= 90 ? 'bg-red-500' :
                    percentage >= 80 ? 'bg-orange-500' :
                    percentage >= 70 ? 'bg-amber-500' :
                    percentage >= 60 ? 'bg-yellow-500' :
                    percentage >= 50 ? 'bg-lime-500' :
                    'bg-emerald-500'
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
                  {usedTokens.toLocaleString()}
                </div>

                <div className="text-muted-foreground">上限</div>
                <div className="text-right font-medium tabular-nums">
                  {contextWindow.toLocaleString()}
                </div>

                <div className="text-muted-foreground">剩余</div>
                <div className="text-right font-medium tabular-nums text-emerald-500">
                  {remainingTokens.toLocaleString()}
                </div>

                <div className="text-muted-foreground">使用率</div>
                <div className={`text-right font-medium tabular-nums ${
                  percentage >= 100 ? 'text-red-500' :
                  percentage >= 90 ? 'text-red-500' :
                  percentage >= 70 ? 'text-amber-500' :
                  'text-emerald-500'
                }`}>
                  {percentage.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* 小三角箭头 - 向上指向，居中 */}
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-l border-t border-border/50 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
