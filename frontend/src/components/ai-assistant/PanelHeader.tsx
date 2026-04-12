'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Battery, BatteryMedium, BatteryLow, BatteryWarning, Plus, Loader2, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ContextUsage, ChatSessionInfo } from '@/store/useAIAssistantStore';

interface PanelHeaderProps {
  onClose: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  className?: string;
  contextUsage?: ContextUsage | null;
  isLoading?: boolean;
  // Multi-chat props
  chatList?: ChatSessionInfo[];
  currentSessionId?: string | null;
  onCreateNewChat?: () => void;
  onSwitchSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  isLoadingChatList?: boolean;
}

export function PanelHeader({
  onClose,
  onDragStart,
  className,
  contextUsage,
  isLoading = false,
  chatList = [],
  currentSessionId,
  onCreateNewChat,
  onSwitchSession,
  onDeleteSession,
  isLoadingChatList = false,
}: PanelHeaderProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 bg-background cursor-grab active:cursor-grabbing',
        className
      )}
      onPointerDown={onDragStart}
    >
      {/* 左侧：上下文电池 */}
      <div className="flex items-center gap-1 pointer-events-auto">
        <HeaderContextBattery
          contextUsage={contextUsage}
          isLoading={isLoading}
        />
      </div>

      {/* 右侧：新建对话 + 历史对话 + 关闭面板 */}
      <div className="flex items-center gap-1 pointer-events-auto">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation();
            onCreateNewChat?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title={t('ai.newChat')}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <ChatHistoryDropdown
          chatList={chatList}
          currentSessionId={currentSessionId}
          onSwitchSession={onSwitchSession}
          onDeleteSession={onDeleteSession}
          isLoading={isLoadingChatList}
        />
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

// 历史对话下拉菜单
interface ChatHistoryDropdownProps {
  chatList: ChatSessionInfo[];
  currentSessionId?: string | null;
  onSwitchSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  isLoading?: boolean;
}

function ChatHistoryDropdown({
  chatList,
  currentSessionId,
  onSwitchSession,
  onDeleteSession,
  isLoading = false,
}: ChatHistoryDropdownProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && setIsOpen(false);
    };
    isOpen && document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const formatTime = (dateStr: string) => {
    // 防护空值
    const raw = dateStr || new Date().toISOString();
    // 确保 UTC 时间字符串被正确解析（后端可能不带 Z 后缀）
    const normalized = raw.endsWith('Z') || raw.includes('+') ? raw : `${raw}Z`;
    const date = new Date(normalized);
    const now = new Date();
    
    // 使用本地日期比较（而非简单时间差）
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((todayStart.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24));
    
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // 今天
    const labels: Record<number, string> = {
      0: timeStr,
      1: `${t('theater.yesterday')} ${timeStr}`,
    };
    return labels[diffDays] ?? (diffDays < 7 ? `${diffDays}d ${timeStr}` : date.toLocaleDateString([], { month: 'short', day: 'numeric' }));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8 hover:bg-muted", isOpen && "bg-muted")}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        title={t('ai.chatHistory')}
      >
        <History className="h-4 w-4" />
        {chatList.length > 1 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-medium leading-none px-0.5">
            {chatList.length}
          </span>
        )}
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute top-full mt-2 right-0 z-[100] bg-popover border border-border/50 rounded-lg shadow-lg w-[256px] overflow-hidden"
          >
            {/* 标题 */}
            <div className="px-3 py-2 border-b border-border/30 flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {t('ai.chatHistory')}
              </span>
              {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </div>

            {/* 对话列表 */}
            <div className="max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
              {chatList.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {t('ai.noChats')}
                </div>
              )}
              {[...chatList].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).map((chat) => {
                const isCurrent = chat.id === currentSessionId;
                return (
                  <div
                    key={chat.id}
                    className={cn(
                      "group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                      isCurrent ? "bg-primary/10" : "hover:bg-muted/50"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSwitchSession?.(chat.id);
                      setIsOpen(false);
                    }}
                  >
                    {/* 激活指示点 */}
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      isCurrent ? "bg-primary" : "bg-transparent"
                    )} />
                    
                    {/* 对话信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate text-foreground">
                        {chat.title}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatTime(chat.updatedAt)}
                      </div>
                    </div>

                    {/* 删除按钮（非当前对话时显示） */}
                    {!isCurrent && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession?.(chat.id);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={t('ai.deleteChat')}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 小三角箭头 */}
            <div className="absolute -top-1 right-4 w-2 h-2 bg-popover border-l border-t border-border/50 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// 头部上下文电池组件（按10%步长显示）
interface HeaderContextBatteryProps {
  contextUsage: ContextUsage | null | undefined;
  isLoading: boolean;
}

function HeaderContextBattery({ contextUsage, isLoading }: HeaderContextBatteryProps) {
  const { t } = useTranslation();
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
          <BatteryWarning className="h-4 w-4 text-[var(--color-status-error-icon)]" />
        </motion.div>
      );
    }
    // 90-99%
    if (percentage >= 90) return <BatteryWarning className="h-4 w-4 text-[var(--color-status-error-icon)]" />;
    // 80-89%
    if (percentage >= 80) return <BatteryLow className="h-4 w-4 text-[var(--color-status-warning-icon)]" />;
    // 70-79%
    if (percentage >= 70) return <BatteryLow className="h-4 w-4 text-[var(--color-status-warning-icon)]" />;
    // 60-69%
    if (percentage >= 60) return <BatteryMedium className="h-4 w-4 text-[var(--color-status-warning-icon)]" />;
    // 50-59%
    if (percentage >= 50) return <BatteryMedium className="h-4 w-4 text-[var(--color-status-success-icon)]" />;
    // 40-49%
    if (percentage >= 40) return <BatteryMedium className="h-4 w-4 text-[var(--color-status-success-icon)]" />;
    // 30-39%
    if (percentage >= 30) return <Battery className="h-4 w-4 text-[var(--color-status-success-icon)]" />;
    // 20-29%
    if (percentage >= 20) return <Battery className="h-4 w-4 text-[var(--color-status-success-icon)]" />;
    // 10-19%
    if (percentage >= 10) return <Battery className="h-4 w-4 text-[var(--color-status-success-icon)]" />;
    // 0-9%
    return <Battery className="h-4 w-4 text-[var(--color-status-success-icon)]" />;
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
        title={t('ai.context', { percentage: percentage.toFixed(0) })}
      >
        {getBatteryIcon()}
        <span className={cn(
          "text-xs font-medium tabular-nums",
          percentage >= 100 ? 'text-[var(--color-status-error-text)]' :
          percentage >= 90 ? 'text-[var(--color-status-error-text)]' :
          percentage >= 70 ? 'text-[var(--color-status-warning-text)]' :
          'text-muted-foreground'
        )}>
          {percentage.toFixed(0)}%
        </span>
      </Button>

      {/* Hover展开的详细信息面板 */}
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
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {t('ai.contextStats')}
              </div>

              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${
                    percentage >= 100 ? 'bg-[var(--color-status-error-icon)]' :
                    percentage >= 90 ? 'bg-[var(--color-status-error-icon)]' :
                    percentage >= 80 ? 'bg-[var(--color-status-warning-icon)]' :
                    percentage >= 70 ? 'bg-[var(--color-status-warning-icon)]' :
                    percentage >= 60 ? 'bg-[var(--color-status-warning-icon)]' :
                    percentage >= 50 ? 'bg-[var(--color-status-success-icon)]' :
                    'bg-[var(--color-status-success-icon)]'
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${clampedPercentage}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                <div className="text-muted-foreground">{t('ai.used')}</div>
                <div className="text-right font-medium tabular-nums">
                  {usedTokens.toLocaleString()}
                </div>

                <div className="text-muted-foreground">{t('ai.limit')}</div>
                <div className="text-right font-medium tabular-nums">
                  {contextWindow.toLocaleString()}
                </div>

                <div className="text-muted-foreground">{t('ai.remaining')}</div>
                <div className="text-right font-medium tabular-nums text-muted-foreground">
                  {remainingTokens.toLocaleString()}
                </div>

                <div className="text-muted-foreground">{t('ai.usageRate')}</div>
                <div className={`text-right font-medium tabular-nums ${
                  percentage >= 100 ? 'text-[var(--color-status-error-text)]' :
                  percentage >= 90 ? 'text-[var(--color-status-error-text)]' :
                  percentage >= 70 ? 'text-[var(--color-status-warning-text)]' :
                  'text-muted-foreground'
                }`}>
                  {percentage.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-l border-t border-border/50 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}