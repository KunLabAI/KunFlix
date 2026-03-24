'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToolCallData {
  tool_name: string;
  arguments?: Record<string, unknown>;
  status: 'executing' | 'completed';
  result?: string;
  duration?: number;
}

interface ToolCallIndicatorProps {
  toolCalls: ToolCallData[];
  className?: string;
}

export function ToolCallIndicator({ toolCalls, className }: ToolCallIndicatorProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const toggleTool = (toolName: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      next.has(toolName) ? next.delete(toolName) : next.add(toolName);
      return next;
    });
  };

  const executingCount = toolCalls.filter((t) => t.status === 'executing').length;
  const completedCount = toolCalls.filter((t) => t.status === 'completed').length;

  return (
    <div className={cn('space-y-1.5', className)}>
      {toolCalls.map((tool, index) => {
        const isExpanded = expandedTools.has(tool.tool_name);
        const isExecuting = tool.status === 'executing';

        return (
          <div
            key={`${tool.tool_name}-${index}`}
            className={cn(
              'rounded-lg border transition-all duration-200',
              isExecuting
                ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
                : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
            )}
          >
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors rounded-lg"
              onClick={() => toggleTool(tool.tool_name)}
            >
              {isExecuting ? (
                <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              )}
              <Terminal className={cn('h-3.5 w-3.5', isExecuting ? 'text-blue-500' : 'text-green-500')} />
              <span
                className={cn(
                  'text-xs flex-1',
                  isExecuting ? 'text-blue-700 dark:text-blue-300' : 'text-green-700 dark:text-green-300'
                )}
              >
                {isExecuting ? `正在执行: ${tool.tool_name}` : `已完成: ${tool.tool_name}`}
              </span>
              {tool.duration && (
                <span className="text-[10px] text-muted-foreground">{tool.duration}ms</span>
              )}
              {isExpanded ? (
                <ChevronUp className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              )}
            </div>

            {isExpanded && tool.arguments && Object.keys(tool.arguments).length > 0 && (
              <div className="px-2.5 pb-2 pt-0.5 border-t border-inherit">
                <div className="text-[10px] text-muted-foreground mb-1">参数:</div>
                <pre className="text-xs bg-black/5 dark:bg-white/5 rounded p-1.5 overflow-x-auto">
                  {JSON.stringify(tool.arguments, null, 2)}
                </pre>
              </div>
            )}

            {isExpanded && tool.result && (
              <div className="px-2.5 pb-2 pt-0.5 border-t border-inherit">
                <div className="text-[10px] text-muted-foreground mb-1">结果:</div>
                <pre className="text-xs bg-black/5 dark:bg-white/5 rounded p-1.5 overflow-x-auto max-h-32">
                  {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      })}

      {toolCalls.length > 1 && (
        <div className="text-[10px] text-muted-foreground px-1">
          {executingCount > 0 && <span>{executingCount} 个执行中</span>}
          {executingCount > 0 && completedCount > 0 && <span> / </span>}
          {completedCount > 0 && <span>{completedCount} 个已完成</span>}
        </div>
      )}
    </div>
  );
}
