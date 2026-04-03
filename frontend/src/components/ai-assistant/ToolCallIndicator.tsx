'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
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

/**
 * 检测工具结果是否为错误格式
 * 支持格式: {"error": "..."} 或 "Error: ..."
 */
function parseToolError(result: string | undefined): string | null {
  const trimmed = (result || '').trim();
  // 检测 JSON 格式错误
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed?.error === 'string' ? parsed.error : null;
  } catch {
    // 检测纯文本错误前缀
    return trimmed.startsWith('Error:') ? trimmed.slice(6).trim() : null;
  }
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
  const errorCount = toolCalls.filter((t) => t.status === 'completed' && parseToolError(t.result)).length;
  const successCount = completedCount - errorCount;

  return (
    <div className={cn('space-y-1.5', className)}>
      {toolCalls.map((tool, index) => {
        const isExpanded = expandedTools.has(tool.tool_name);
        const isExecuting = tool.status === 'executing';
        const errorMessage = parseToolError(tool.result);
        const hasError = !isExecuting && !!errorMessage;

        // 样式配置: 执行中(蓝) / 错误(红) / 成功(绿)
        const styleConfig = hasError
          ? {
              bg: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
              icon: 'text-red-500',
              text: 'text-red-700 dark:text-red-300',
            }
          : isExecuting
            ? {
                bg: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
                icon: 'text-blue-500',
                text: 'text-blue-700 dark:text-blue-300',
              }
            : {
                bg: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
                icon: 'text-green-500',
                text: 'text-green-700 dark:text-green-300',
              };

        const statusLabel = hasError
          ? `执行失败: ${tool.tool_name}`
          : isExecuting
            ? `正在执行: ${tool.tool_name}`
            : `已完成: ${tool.tool_name}`;

        return (
          <div
            key={`${tool.tool_name}-${index}`}
            className={cn('rounded-lg border transition-all duration-200', styleConfig.bg)}
          >
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors rounded-lg"
              onClick={() => toggleTool(tool.tool_name)}
            >
              {isExecuting ? (
                <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
              ) : hasError ? (
                <AlertCircle className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              )}
              <Terminal className={cn('h-3.5 w-3.5', styleConfig.icon)} />
              <span className={cn('text-xs flex-1', styleConfig.text)}>{statusLabel}</span>
              {tool.duration && (
                <span className="text-[10px] text-muted-foreground">{tool.duration}ms</span>
              )}
              {isExpanded ? (
                <ChevronUp className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              )}
            </div>

            {/* 错误消息摘要（未展开时也显示） */}
            {hasError && !isExpanded && (
              <div className="px-2.5 pb-2 pt-0.5 border-t border-inherit">
                <div className="text-xs text-red-600 dark:text-red-400 line-clamp-2">
                  {errorMessage}
                </div>
              </div>
            )}

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
                <div className="text-[10px] text-muted-foreground mb-1">
                  {hasError ? '错误详情:' : '结果:'}
                </div>
                <pre
                  className={cn(
                    'text-xs rounded p-1.5 overflow-x-auto max-h-32',
                    hasError
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      : 'bg-black/5 dark:bg-white/5'
                  )}
                >
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
          {executingCount > 0 && (successCount > 0 || errorCount > 0) && <span> / </span>}
          {successCount > 0 && <span className="text-green-600">{successCount} 个成功</span>}
          {successCount > 0 && errorCount > 0 && <span> / </span>}
          {errorCount > 0 && <span className="text-red-600">{errorCount} 个失败</span>}
        </div>
      )}
    </div>
  );
}
