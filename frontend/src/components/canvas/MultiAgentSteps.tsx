'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Bot, CheckCircle2, Circle, XCircle, Loader2, RefreshCw, Zap, Crown, Image as ImageIcon, Video, Music, MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentStep, MultiAgentData, ToolCall } from '@/store/useAIAssistantStore';

// 重新导出以保持外部消费者向后兼容（旧代码可能 import 自本组件）
export type { AgentStep, MultiAgentData };

interface MultiAgentStepsProps extends MultiAgentData {
  className?: string;
}

// 状态图标映射表（避免 if-else 链）
const STATUS_ICON_MAP: Record<AgentStep['status'], React.ReactNode> = {
  completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed:    <XCircle className="h-4 w-4 text-red-500" />,
  running:   <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  retrying:  <RefreshCw className="h-4 w-4 text-amber-500 animate-spin" />,
  pending:   <Circle className="h-4 w-4 text-muted-foreground" />,
};

// 媒体生成工具 → 展示图标映射（chip 展示）
const MEDIA_TOOL_ICON_MAP: Record<string, React.ReactNode> = {
  generate_image: <ImageIcon className="h-3 w-3" />,
  edit_image: <ImageIcon className="h-3 w-3" />,
  generate_video: <Video className="h-3 w-3" />,
  edit_video: <Video className="h-3 w-3" />,
  generate_music: <Music className="h-3 w-3" />,
};

const MEDIA_TOOL_LABEL_MAP: Record<string, string> = {
  generate_image: '图像',
  edit_image: '编图',
  generate_video: '视频',
  edit_video: '改视频',
  generate_music: '音乐',
};

/**
 * 单个媒体工具 chip —— 展示图标 + 名称，tooltip 显示 prompt。
 */
function MediaToolChip({ toolCall }: { toolCall: ToolCall }) {
  const icon = MEDIA_TOOL_ICON_MAP[toolCall.tool_name];
  const label = MEDIA_TOOL_LABEL_MAP[toolCall.tool_name] || toolCall.tool_name;
  const prompt = (toolCall.arguments?.prompt as string) || '';
  const isRunning = toolCall.status === 'executing';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border',
        isRunning
          ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
          : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
      )}
      title={prompt}
    >
      {isRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : icon}
      {label}
      {isRunning && <span className="opacity-70">生成中</span>}
    </span>
  );
}

export default function MultiAgentSteps({
  steps, finalResult, totalTokens, creditCost, className,
  orchestrationStyle, teamName, leaderName,
}: MultiAgentStepsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      next.has(stepId) ? next.delete(stepId) : next.add(stepId);
      return next;
    });
  };

  const completedCount = steps.filter(s => s.status === 'completed').length;
  const isAllCompleted = completedCount === steps.length && steps.length > 0;

  // team_tools 模式：显示"团队协作: {teamName}"；legacy_json 模式：保持"多智能体协作"
  const isTeamMode = orchestrationStyle === 'team_tools';
  const workerCount = steps.filter(s => !s.isLeader).length;
  const workerCompleted = steps.filter(s => !s.isLeader && s.status === 'completed').length;

  const headerLabel = isTeamMode
    ? `团队协作：${teamName || 'Team'}`
    : `多智能体协作 ${isAllCompleted ? '已完成' : `(${completedCount}/${steps.length})`}`;
  const subLabel = isTeamMode
    ? (leaderName ? `Leader: ${leaderName} · ${workerCompleted}/${workerCount} Worker 完成` : `${workerCompleted}/${workerCount} Worker 完成`)
    : '';

  return (
    <div className={cn("space-y-3", className)}>
      {/* 协作概览 */}
      <div
        className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted/70 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Bot className="h-4 w-4 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{headerLabel}</div>
          {subLabel && <div className="text-[10px] text-muted-foreground truncate">{subLabel}</div>}
        </div>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>

      {/* 步骤详情 */}
      {isExpanded && (
        <div className="space-y-2 pl-2">
          {steps.map((step, index) => {
            const mediaCalls = (step.tool_calls || []).filter(t => MEDIA_TOOL_ICON_MAP[t.tool_name]);
            return (
              <div key={step.subtask_id} className="border-l-2 border-muted pl-3 py-1">
                <div
                  className="flex items-start gap-2 cursor-pointer hover:bg-muted/30 rounded p-1 -ml-1 transition-colors"
                  onClick={() => toggleStep(step.subtask_id)}
                >
                  {STATUS_ICON_MAP[step.status] ?? STATUS_ICON_MAP.pending}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {step.isLeader && <Crown className="h-3 w-3 text-amber-500" aria-label="Leader" />}
                      <span className="text-xs font-medium">{step.agent_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {step.isLeader ? 'Leader' : `步骤 ${index + 1}`}
                      </span>
                      {step.templateType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                          {step.templateType}
                        </span>
                      )}
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
                      {/* worker_message 数量标记 */}
                      {step.messages && step.messages.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          <MessagesSquare className="h-3 w-3" /> {step.messages.length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{step.description}</p>
                    {/* 媒体工具 chip 行 */}
                    {mediaCalls.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {mediaCalls.map((tc, i) => (
                          <MediaToolChip key={`${tc.tool_name}-${i}`} toolCall={tc} />
                        ))}
                      </div>
                    )}
                  </div>
                  {expandedSteps.has(step.subtask_id) ?
                    <ChevronUp className="h-3 w-3 text-muted-foreground" /> :
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  }
                </div>

                {/* 步骤展开区：worker_say 时间线 + 结果 + 错误 */}
                {expandedSteps.has(step.subtask_id) && (step.result || step.error || (step.messages?.length ?? 0) > 0) && (
                  <div className="mt-2 p-2 bg-muted/30 rounded text-xs space-y-2">
                    {/* worker_message 时间线（team_tools 特有） */}
                    {step.messages && step.messages.length > 0 && (
                      <div className="space-y-1.5">
                        {step.messages.map((m, i) => (
                          <div key={i} className="border-l-2 border-primary/30 pl-2">
                            <p className="text-[10px] text-muted-foreground/80">→ Leader 追问</p>
                            <p className="text-muted-foreground whitespace-pre-wrap">{m.request}</p>
                            {m.reply && (
                              <>
                                <p className="text-[10px] text-muted-foreground/80 mt-1">← Worker 回复</p>
                                <p className="text-foreground/80 whitespace-pre-wrap">{m.reply}</p>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {step.error ? (
                      <p className="text-red-500">{step.error}</p>
                    ) : step.result ? (
                      <p className="text-muted-foreground whitespace-pre-wrap">{step.result}</p>
                    ) : null}
                    {step.tokens && (
                      <p className="text-[10px] text-muted-foreground">
                        Tokens: {step.tokens.input} in / {step.tokens.output} out
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

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
