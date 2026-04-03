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
              bg: 'bg-[var(--color-status-error-bg)] border-[var(--color-status-error-border)]',
              icon: 'text-[var(--color-status-error-icon)]',
              text: 'text-[var(--color-status-error-text)]',
            }
          : isExecuting
            ? {
                bg: 'bg-[var(--color-status-executing-bg)] border-[var(--color-status-executing-border)]',
                icon: 'text-[var(--color-status-executing-icon)]',
                text: 'text-[var(--color-status-executing-text)]',
              }
            : {
                bg: 'bg-[var(--color-status-success-bg)] border-[var(--color-status-success-border)]',
                icon: 'text-[var(--color-status-success-icon)]',
                text: 'text-[var(--color-status-success-text)]',
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
              className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-[var(--color-bg-panel-hover)] transition-colors rounded-lg"
              onClick={() => toggleTool(tool.tool_name)}
            >
              {isExecuting ? (
                <Loader2 className={cn('h-3.5 w-3.5 animate-spin', styleConfig.icon)} />
              ) : hasError ? (
                <AlertCircle className={cn('h-3.5 w-3.5', styleConfig.icon)} />
              ) : (
                <CheckCircle2 className={cn('h-3.5 w-3.5', styleConfig.icon)} />
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
                <div className="text-xs text-[var(--color-status-error-text)] line-clamp-2">
                  {errorMessage}
                </div>
              </div>
            )}

            {isExpanded && tool.arguments && Object.keys(tool.arguments).length > 0 && (
              <div className="px-2.5 pb-2 pt-0.5 border-t border-inherit">
                <div className="text-[10px] text-muted-foreground mb-1">参数:</div>
                <pre className="text-xs bg-[var(--color-bg-panel)] text-[var(--color-text-panel)] rounded p-1.5 overflow-x-auto">
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
                      ? 'bg-[var(--color-status-error-bg)] text-[var(--color-status-error-text)]'
                      : 'bg-[var(--color-bg-panel)] text-[var(--color-text-panel)]'
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
          {successCount > 0 && <span className="text-[var(--color-status-success-text)]">{successCount} 个成功</span>}
          {successCount > 0 && errorCount > 0 && <span> / </span>}
          {errorCount > 0 && <span className="text-[var(--color-status-error-text)]">{errorCount} 个失败</span>}
        </div>
      )}
    </div>
  );
}
