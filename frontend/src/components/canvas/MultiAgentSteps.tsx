'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Bot, CheckCircle2, Circle, XCircle, Loader2, RefreshCw, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AgentStep {
  subtask_id: string;
  agent_name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  result?: string;
  error?: string;
  tokens?: { input: number; output: number };
  // Harness: 重试/熔断信息
  retryCount?: number;
  maxRetries?: number;
  circuitBreaker?: boolean;
}

export interface MultiAgentData {
  steps: AgentStep[];
  finalResult: string;
  totalTokens: { input: number; output: number };
  creditCost: number;
}

interface MultiAgentStepsProps extends MultiAgentData {
  className?: string;
}

export default function MultiAgentSteps({ steps, finalResult, totalTokens, creditCost, className }: MultiAgentStepsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      next.has(stepId) ? next.delete(stepId) : next.add(stepId);
      return next;
    });
  };

  const STATUS_ICON_MAP: Record<AgentStep['status'], React.ReactNode> = {
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    failed:    <XCircle className="h-4 w-4 text-red-500" />,
    running:   <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
    retrying:  <RefreshCw className="h-4 w-4 text-amber-500 animate-spin" />,
    pending:   <Circle className="h-4 w-4 text-muted-foreground" />,
  };

  const getStatusIcon = (status: AgentStep['status']) => STATUS_ICON_MAP[status] ?? STATUS_ICON_MAP.pending;

  const completedCount = steps.filter(s => s.status === 'completed').length;
  const isAllCompleted = completedCount === steps.length && steps.length > 0;

  return (
    <div className={cn("space-y-3", className)}>
      {/* 协作概览 */}
      <div 
        className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium flex-1">
          多智能体协作 {isAllCompleted ? '已完成' : `(${completedCount}/${steps.length})`}
        </span>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>

      {/* 步骤详情 */}
      {isExpanded && (
        <div className="space-y-2 pl-2">
          {steps.map((step, index) => (
            <div key={step.subtask_id} className="border-l-2 border-muted pl-3 py-1">
              <div 
                className="flex items-start gap-2 cursor-pointer hover:bg-muted/30 rounded p-1 -ml-1 transition-colors"
                onClick={() => toggleStep(step.subtask_id)}
              >
                {getStatusIcon(step.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{step.agent_name}</span>
                    <span className="text-xs text-muted-foreground">步骤 {index + 1}</span>
                    {/* Harness: 重试计数标签 */}
                    {step.retryCount != null && step.retryCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">
                        重试 {step.retryCount}/{step.maxRetries ?? '?'}
                      </span>
                    )}
                    {/* Harness: 熔断标记 */}
                    {step.circuitBreaker && (
                      <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-medium">
                        <Zap className="h-3 w-3" /> 熔断
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                </div>
                {expandedSteps.has(step.subtask_id) ? 
                  <ChevronUp className="h-3 w-3 text-muted-foreground" /> : 
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                }
              </div>
              
              {/* 步骤结果 */}
              {expandedSteps.has(step.subtask_id) && (step.result || step.error) && (
                <div className="mt-2 p-2 bg-muted/30 rounded text-xs">
                  {step.error ? (
                    <p className="text-red-500">{step.error}</p>
                  ) : (
                    <p className="text-muted-foreground whitespace-pre-wrap">{step.result}</p>
                  )}
                  {step.tokens && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Tokens: {step.tokens.input} in / {step.tokens.output} out
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
          
          {/* 统计信息 */}
          <div className="pt-2 border-t border-muted text-[10px] text-muted-foreground flex gap-3">
            <span>总Tokens: {totalTokens.input} in / {totalTokens.output} out</span>
            {creditCost > 0 && <span>消耗: {creditCost.toFixed(4)} 积分</span>}
          </div>
        </div>
      )}

      {/* 最终结果预览（收起时显示） */}
      {!isExpanded && finalResult && (
        <p className="text-xs text-muted-foreground line-clamp-2 pl-2">
          {finalResult}
        </p>
      )}
    </div>
  );
}
