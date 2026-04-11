'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, CheckCircle2, Circle, XCircle, Loader2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoadingDots } from './LoadingDots';
import { LazyImage } from './LazyImage';
import type { AgentStep } from '@/store/useAIAssistantStore';

interface ThinkPanelProps {
  steps?: AgentStep[];      // 多智能体步骤（可选）
  isThinking?: boolean;     // 是否正在思考中
  agentName?: string;       // 单智能体名称（可选）
  thinkingContent?: string; // 思考过程内容（流式输出）
  className?: string;
  children?: React.ReactNode; // 思考完成后的最终内容
}

// 状态图标映射表
const STATUS_ICON_MAP: Record<string, { Icon: typeof Circle; className: string }> = {
  pending: { Icon: Circle, className: 'text-muted-foreground' },
  running: { Icon: Loader2, className: 'text-foreground/70 animate-spin' },
  completed: { Icon: CheckCircle2, className: 'text-foreground/50' },
  failed: { Icon: XCircle, className: 'text-foreground/70' },
};

/**
 * ThinkPanel - AI思考过程面板
 * 
 * 支持两种模式：
 * 1. 单智能体模式：仅显示思考状态和计时器
 * 2. 多智能体模式：显示步骤列表和进度
 * 
 * 特性：
 * - 自动展开：检测到思考状态时自动展开
 * - 自动折叠：思考结束后延迟折叠
 * - 实时进度：显示当前执行步骤和进度
 */
export function ThinkPanel({ steps = [], isThinking = false, agentName, thinkingContent, className, children }: ThinkPanelProps) {
  // 判断是单智能体还是多智能体模式
  const isMultiAgent = steps.length > 0;
  // 单智能体模式下，有内容时可展开
  const hasSingleAgentContent = !isMultiAgent && (!!thinkingContent || !!children);
  const [isExpanded, setIsExpanded] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  // 跟踪用户是否手动展开了面板（用于控制自动折叠行为）
  const [userExpandedManually, setUserExpandedManually] = useState(false);

  // 计算进度
  const progress = useMemo(() => {
    const completedCount = steps.filter(s => s.status === 'completed').length;
    const failedCount = steps.filter(s => s.status === 'failed').length;
    const runningCount = steps.filter(s => s.status === 'running').length;
    const total = steps.length;
    
    return {
      completed: completedCount,
      failed: failedCount,
      running: runningCount,
      total,
      percentage: total > 0 ? Math.round((completedCount / total) * 100) : 0,
      isAllDone: completedCount + failedCount === total && total > 0,
    };
  }, [steps]);

  // 当前执行的步骤
  const currentStep = useMemo(() => 
    steps.find(s => s.status === 'running'),
    [steps]
  );

  // 自动展开/折叠逻辑
  useEffect(() => {
    // 开始思考时自动展开，并重置用户干预状态
    isThinking && !isExpanded && (setIsExpanded(true), setUserExpandedManually(false));
    
    // 思考结束后延迟折叠（仅在用户未手动展开的情况下）
    const shouldAutoCollapse = !isThinking && isExpanded && !userExpandedManually && (isMultiAgent ? progress.isAllDone : true);
    
    const timer = shouldAutoCollapse
      ? setTimeout(() => setIsExpanded(false), 1500)
      : null;
    
    return () => { timer && clearTimeout(timer); };
  }, [isThinking, progress.isAllDone, isExpanded, isMultiAgent, userExpandedManually]);

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

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      next.has(stepId) ? next.delete(stepId) : next.add(stepId);
      return next;
    });
  };

  // 有步骤、正在思考、有思考内容或有子元素时渲染
  const shouldRender = steps.length > 0 || isThinking || !!thinkingContent || !!children;
  
  // 已完成状态直接渲染，跳过入场动画（防止虚拟滚动重挂载时重播）
  const skipEntryAnimation = !isThinking && (isMultiAgent ? progress.isAllDone : true);

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
            : progress.isAllDone
              ? 'bg-muted/30'
              : 'bg-muted/20 hover:bg-muted/40'
        )}
        onClick={() => {
          const newExpanded = !isExpanded;
          setIsExpanded(newExpanded);
          setUserExpandedManually(newExpanded);
        }}
      >
        {/* 展开/折叠箭头 */}
        {(isMultiAgent || hasSingleAgentContent) && (
          isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}

        {/* 标题和状态 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {isMultiAgent
                ? (isThinking ? '多智能体协作中...' : progress.isAllDone ? '多智能体协作完成' : '多智能体协作')
                : (isThinking
                  ? (agentName ? `${agentName} Think...` : 'AI Thinking...')
                  : 'Think complete')}
            </span>
            {isThinking && <LoadingDots size="sm" className="text-muted-foreground" />}
          </div>
          {currentStep && (
            <p className="text-[10px] text-muted-foreground truncate">
              {currentStep.agent_name}: {currentStep.description}
            </p>
          )}
        </div>

        {/* 进度指示器 */}
        <div className="flex items-center gap-2">
          {isMultiAgent && progress.total > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {progress.completed}/{progress.total}
            </span>
          )}
          {isThinking && (
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {formatTime(elapsedTime)}
            </span>
          )}
        </div>
      </div>

      {/* 展开的详细内容 */}
      <AnimatePresence>
        {isExpanded && (isMultiAgent || hasSingleAgentContent) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-2 pl-2">
              {/* 单智能体模式：显示思考内容 */}
              {!isMultiAgent && (thinkingContent || children) && (
                <div className="p-2 bg-muted/30 rounded text-xs text-muted-foreground">
                  {thinkingContent && (
                    <p className="whitespace-pre-wrap">{thinkingContent}</p>
                  )}
                  {children}
                </div>
              )}

              {/* 多智能体模式：显示步骤列表 */}
              {isMultiAgent && (
                <>
                  {/* 进度条 */}
                  {progress.total > 0 && (
                    <div className="h-1 w-full bg-muted/40 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-foreground/30"
                        initial={skipEntryAnimation ? false : { width: 0 }}
                        animate={{ width: `${progress.percentage}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  )}

                  {/* 步骤列表 */}
                  {steps.map((step, index) => {
                    const iconConfig = STATUS_ICON_MAP[step.status] || STATUS_ICON_MAP.pending;
                    const StatusIcon = iconConfig.Icon;
                    const isStepExpanded = expandedSteps.has(step.subtask_id);

                    return (
                      <div key={step.subtask_id} className="border-l border-border/40 pl-3 py-1">
                        <div
                          className="flex items-start gap-2 cursor-pointer hover:bg-muted/40 rounded p-1 -ml-1 transition-colors"
                          onClick={(e) => { e.stopPropagation(); toggleStep(step.subtask_id); }}
                        >
                          <StatusIcon className={cn('h-4 w-4 mt-0.5', iconConfig.className)} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium">{step.agent_name}</span>
                              <span className="text-[10px] text-muted-foreground">步骤 {index + 1}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {step.description}
                            </p>
                            {/* 工具调用指示器 */}
                            {step.tool_calls && step.tool_calls.length > 0 && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Wrench className="h-3 w-3 text-muted-foreground/60" />
                                <span className="text-[10px] text-muted-foreground/60">
                                  {step.tool_calls.filter(t => t.status === 'completed').length}/{step.tool_calls.length} 工具调用
                                </span>
                              </div>
                            )}
                          </div>
                          {(step.result || step.error || step.tool_calls?.length) && (
                            isStepExpanded
                              ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                              : <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>

                        {/* 步骤详情 */}
                        <AnimatePresence>
                          {isStepExpanded && (step.result || step.error || step.tool_calls?.length) && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mt-2 p-2 bg-muted/30 rounded text-xs overflow-hidden"
                            >
                              {/* 工具调用列表 */}
                              {step.tool_calls && step.tool_calls.length > 0 && (
                                <div className="space-y-1.5 mb-2">
                                  {step.tool_calls.map((tc, i) => (
                                    <div key={`${tc.tool_name}-${i}`}>
                                      <div className="flex items-center gap-1.5 text-[10px]">
                                        {tc.status === 'executing'
                                          ? <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
                                          : <CheckCircle2 className="h-3 w-3 text-emerald-500/70" />
                                        }
                                        <span className="text-muted-foreground font-mono">{tc.tool_name}</span>
                                      </div>
                                      {/* 工具结果中的图片 */}
                                      {tc.result && tc.result.match(/!\[.*?\]\((\/api\/media\/[^)]+)\)/g)?.map((match, j) => {
                                        const src = match.match(/\((\/api\/media\/[^)]+)\)/)?.[1];
                                        return src ? (
                                          <LazyImage
                                            key={`${tc.tool_name}-img-${j}`}
                                            src={src}
                                            alt={tc.tool_name}
                                            className="mt-1.5 rounded max-w-full max-h-48 object-contain"
                                          />
                                        ) : null;
                                      })}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {step.error ? (
                                <p className="text-foreground/70">{step.error}</p>
                              ) : (
                                <p className="text-muted-foreground whitespace-pre-wrap">{step.result}</p>
                              )}
                              {step.tokens && (
                                <p className="text-[10px] text-muted-foreground/70 mt-1">
                                  Tokens: {step.tokens.input} in / {step.tokens.output} out
                                </p>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  ) : null;
}
