'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoadingDots } from './LoadingDots';

interface SingleAgentThinkPanelProps {
  isThinking?: boolean;
  agentName?: string;
  thinkingContent?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * SingleAgentThinkPanel - 单智能体思考面板
 * 
 * 特性：
 * - 显示思考状态
 * - 最多显示8行内容，超出时自动向上滚动
 * - 思考结束后自动折叠
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
  const [userExpandedManually, setUserExpandedManually] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动展开/折叠逻辑
  useEffect(() => {
    // 开始思考时自动展开，并重置用户干预状态
    isThinking && !isExpanded && (setIsExpanded(true), setUserExpandedManually(false));
    
    // 思考结束后立即折叠（仅在用户未手动展开的情况下）
    !isThinking && isExpanded && !userExpandedManually && setIsExpanded(false);
  }, [isThinking, isExpanded, userExpandedManually]);

  // 内容更新时自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    el && (el.scrollTop = el.scrollHeight);
  }, [thinkingContent]);

  // 有思考内容或有子元素时渲染
  const shouldRender = isThinking || !!thinkingContent || !!children;
  
  // 已完成状态直接渲染，跳过入场动画
  const skipEntryAnimation = !isThinking;

  return shouldRender ? (
    <motion.div
      initial={skipEntryAnimation ? false : { opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={cn('overflow-hidden w-full', className)}
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
      </div>

      {/* 展开的详细内容 - 最多8行，超出自动滚动 */}
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
              <div
                ref={scrollRef}
                className="p-2 bg-muted/30 rounded text-xs text-muted-foreground max-h-[calc(1.5em*8+16px)] overflow-y-auto scroll-smooth"
              >
                {thinkingContent && (
                  <p className="whitespace-pre-wrap leading-[1.5]">{thinkingContent}</p>
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
