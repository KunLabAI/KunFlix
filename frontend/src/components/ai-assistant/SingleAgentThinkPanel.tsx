'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, CheckCircle2, Circle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoadingDots } from './LoadingDots';

interface SingleAgentThinkPanelProps {
  isThinking?: boolean;
  agentName?: string;
  thinkingContent?: string;
  className?: string;
  children?: React.ReactNode;
}

// 状态图标映射表
const STATUS_ICON_MAP: Record<string, { Icon: typeof Circle; className: string }> = {
  pending: { Icon: Circle, className: 'text-muted-foreground' },
  running: { Icon: Loader2, className: 'text-foreground/70 animate-spin' },
  completed: { Icon: CheckCircle2, className: 'text-foreground/50' },
  failed: { Icon: XCircle, className: 'text-foreground/70' },
};

/**
 * SingleAgentThinkPanel - 单智能体思考面板
 * 
 * 特性：
 * - 显示思考状态和计时器
 * - 有内容时可展开查看详情
 * - 自动展开/折叠控制
 */
export function SingleAgentThinkPanel({ 
  isThinking = false, 
  agentName, 
  thinkingContent, 
  className, 
  children 
}: SingleAgentThinkPanelProps) {
  const hasContent = !!thinkingContent || !!children;
  const [isExpanded, setIsExpanded] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [userExpandedManually, setUserExpandedManually] = useState(false);

  // 自动展开/折叠逻辑
  useEffect(() => {
    // 开始思考时自动展开，并重置用户干预状态
    isThinking && !isExpanded && (setIsExpanded(true), setUserExpandedManually(false));
    
    // 思考结束后延迟折叠（仅在用户未手动展开的情况下）
    const shouldAutoCollapse = !isThinking && isExpanded && !userExpandedManually;
    
    const timer = shouldAutoCollapse
      ? setTimeout(() => setIsExpanded(false), 1500)
      : null;
    
    return () => { timer && clearTimeout(timer); };
  }, [isThinking, isExpanded, userExpandedManually]);

  // 思考计时器
  useEffect(() => {
    const startTime = Date.now();
    const timer = isThinking
      ? setInterval(() => setElapsedTime(Math.floor((Date.now() - startTime) / 1000)), 1000)
      : null;
    
    !isThinking && setElapsedTime(0);
    
    return () => { timer && clearInterval(timer); };
  }, [isThinking]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  // 有思考内容或有子元素时渲染
  const shouldRender = isThinking || !!thinkingContent || !!children;
  
  // 已完成状态直接渲染，跳过入场动画
  const skipEntryAnimation = !isThinking;

  return shouldRender ? (
    <motion.div
      initial={skipEntryAnimation ? false : { opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={cn('overflow-hidden', className)}
    >
      {/* 面板头部 */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
          isThinking
            ? 'bg-muted/40'
            : 'bg-muted/20 hover:bg-muted/40'
        )}
        onClick={() => {
          const newExpanded = !isExpanded;
          setIsExpanded(newExpanded);
          setUserExpandedManually(newExpanded);
        }}
      >
        {/* 展开/折叠箭头 */}
        {hasContent && (
          isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}

        {/* 标题和状态 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {isThinking
                ? (agentName ? `${agentName} Think...` : 'AI Thinking...')
                : 'Think complete'}
            </span>
            {isThinking && <LoadingDots size="sm" className="text-muted-foreground" />}
          </div>
        </div>

        {/* 计时器 */}
        {isThinking && (
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">
            {formatTime(elapsedTime)}
          </span>
        )}
      </div>

      {/* 展开的详细内容 */}
      <AnimatePresence>
        {isExpanded && hasContent && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-2 pl-2">
              <div className="p-2 bg-muted/30 rounded text-xs text-muted-foreground">
                {thinkingContent && (
                  <p className="whitespace-pre-wrap">{thinkingContent}</p>
                )}
                {children}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  ) : null;
}
