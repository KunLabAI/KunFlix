'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, CheckCircle2, Circle, XCircle, Loader2, Wrench, Crown, Image as ImageIcon, Video, Music, MessagesSquare, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoadingDots } from './LoadingDots';
import { LazyImage } from './LazyImage';
import type { AgentStep, OrchestrationStyle, ToolCall } from '@/store/useAIAssistantStore';

/** 检测工具 result 是否为错误格式：{"error": "..."} 或 "Error: ..." */
function _hasToolError(result: string | undefined): boolean {
  const trimmed = (result || '').trim();
  try { return typeof JSON.parse(trimmed)?.error === 'string'; } catch { /* ignore */ }
  return trimmed.startsWith('Error:') || trimmed.startsWith('Tool execution failed:');
}

interface MultiAgentPanelProps {
  steps: AgentStep[];
  isThinking?: boolean;
  className?: string;
  // team_tools 编排元信息（可选，legacy_json 不传）
  orchestrationStyle?: OrchestrationStyle;
  teamName?: string;
  leaderName?: string;
  finalResult?: string;
}

// 状态图标映射表
const STATUS_ICON_MAP: Record<string, { Icon: typeof Circle; className: string }> = {
  pending: { Icon: Circle, className: 'text-muted-foreground' },
  running: { Icon: Loader2, className: 'text-foreground/70 animate-spin' },
  completed: { Icon: CheckCircle2, className: 'text-foreground/50' },
  failed: { Icon: XCircle, className: 'text-foreground/70' },
};

// 媒体工具 → 展示图标/标签（与 MultiAgentSteps 保持一致）
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

/**
 * MultiAgentPanel - 多智能体协作面板
 * 
 * 特性：
 * - 显示步骤列表和进度
 * - 实时进度更新
 * - 支持展开查看步骤详情
 * - 显示工具调用信息
 * - team_tools 模式：频道头部展示团队名/Leader/Worker 进度，Leader 小皮肩图标，worker_message 时间线
 */
export function MultiAgentPanel({
  steps, isThinking = false, className,
  orchestrationStyle, teamName, leaderName, finalResult,
}: MultiAgentPanelProps) {
  // finalResult 已由上层 ChatMessage 作为 message.content 展示，本组件不重复渲染；
  // 保留参数仅为 API 完整性，方便未来扩展（如插入 最终回复 预览内块）
  void finalResult;
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [userExpandedManually, setUserExpandedManually] = useState(false);

  // 计算进度
  const progress = useMemo(() => {
    const completedCount = steps.filter(s => s.status === 'completed').length;
    const failedCount = steps.filter(s => s.status === 'failed').length;
    const runningCount = steps.filter(s => s.status === 'running').length;
    const total = steps.length;
    // team_tools 下单独统计 worker（排除 Leader 虚拟步骤）
    const workerSteps = steps.filter(s => !s.isLeader);
    const workerCompleted = workerSteps.filter(s => s.status === 'completed').length;

    return {
      completed: completedCount,
      failed: failedCount,
      running: runningCount,
      total,
      workerTotal: workerSteps.length,
      workerCompleted,
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
    
    // 思考结束后立即折叠（仅在用户未手动展开的情况下）
    !isThinking && isExpanded && !userExpandedManually && progress.isAllDone && setIsExpanded(false);
  }, [isThinking, progress.isAllDone, isExpanded, userExpandedManually]);

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      next.has(stepId) ? next.delete(stepId) : next.add(stepId);
      return next;
    });
  };

  // 有步骤时渲染
  const shouldRender = steps.length > 0 || isThinking;
  
  // 已完成状态直接渲染，跳过入场动画
  const skipEntryAnimation = !isThinking && progress.isAllDone;

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
        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}

        {/* 标题和状态 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {(() => {
                // team_tools 模式专用文案：团队协作：{teamName}
                const isTeam = orchestrationStyle === 'team_tools';
                const teamLabel = teamName ? `：${teamName}` : '';
                const doingLabel = isTeam ? `团队协作中${teamLabel}...` : '多智能体协作中...';
                const doneLabel = isTeam ? `团队协作完成${teamLabel}` : '多智能体协作完成';
                const idleLabel = isTeam ? `团队协作${teamLabel}` : '多智能体协作';
                return isThinking ? doingLabel : progress.isAllDone ? doneLabel : idleLabel;
              })()}
            </span>
            {isThinking && <LoadingDots size="sm" className="text-muted-foreground" />}
          </div>
          {/* 副标题：team_tools 下展示 Leader + Worker 统计；legacy 下展示当前步骤描述 */}
          {orchestrationStyle === 'team_tools' && progress.workerTotal > 0 ? (
            <p className="text-[10px] text-muted-foreground truncate">
              {leaderName ? `Leader: ${leaderName} · ` : ''}{progress.workerCompleted}/{progress.workerTotal} Worker 完成
            </p>
          ) : currentStep && (
            <p className="text-[10px] text-muted-foreground truncate">
              {currentStep.agent_name}: {currentStep.description}
            </p>
          )}
        </div>

        {/* 进度指示器 */}
        <div className="flex items-center gap-2">
          {progress.total > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {progress.completed}/{progress.total}
            </span>
          )}
        </div>
      </div>

      {/* 展开的详细内容 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-2 pl-2">
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
                const mediaCalls = (step.tool_calls || []).filter(t => MEDIA_TOOL_ICON_MAP[t.tool_name]);
                const hasMessages = (step.messages?.length ?? 0) > 0;

                return (
                  <div key={step.subtask_id} className="border-l border-border/40 pl-3 py-1">
                    <div
                      className="flex items-start gap-2 cursor-pointer hover:bg-muted/40 rounded p-1 -ml-1 transition-colors"
                      onClick={(e) => { e.stopPropagation(); toggleStep(step.subtask_id); }}
                    >
                      <StatusIcon className={cn('h-4 w-4 mt-0.5', iconConfig.className)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {step.isLeader && <Crown className="h-3 w-3 text-amber-500" aria-label="Leader" />}
                          <span className="text-xs font-medium">{step.agent_name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {step.isLeader ? 'Leader' : `步骤 ${index + 1}`}
                          </span>
                          {step.templateType && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                              {step.templateType}
                            </span>
                          )}
                          {hasMessages && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                              <MessagesSquare className="h-3 w-3" /> {step.messages!.length}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {step.description}
                        </p>
                        {/* 媒体工具 chip 行（无论是否展开都可见，让用户即时知道发生了媒体生成） */}
                        {mediaCalls.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {mediaCalls.map((tc, i) => (
                              <MediaToolChip key={`${tc.tool_name}-${i}`} toolCall={tc} />
                            ))}
                          </div>
                        )}
                        {/* 非媒体的工具调用汇总（保留旧 wrench 标记） */}
                        {step.tool_calls && step.tool_calls.length > mediaCalls.length && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Wrench className="h-3 w-3 text-muted-foreground/60" />
                            <span className="text-[10px] text-muted-foreground/60">
                              {step.tool_calls.filter(t => t.status === 'completed').length}/{step.tool_calls.length} 工具调用
                            </span>
                          </div>
                        )}
                      </div>
                      {(step.result || step.error || step.tool_calls?.length || hasMessages) && (
                        isStepExpanded
                          ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                          : <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>

                    {/* 步骤详情 */}
                    <AnimatePresence>
                      {isStepExpanded && (step.result || step.error || step.tool_calls?.length || hasMessages) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-2 p-2 bg-muted/30 rounded text-xs overflow-hidden"
                        >
                          {/* worker_message 时间线（team_tools 特有） */}
                          {hasMessages && (
                            <div className="space-y-1.5 mb-2">
                              {step.messages!.map((m, i) => (
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
                          {/* 工具调用列表 */}
                          {step.tool_calls && step.tool_calls.length > 0 && (
                            <div className="space-y-1.5 mb-2">
                              {step.tool_calls.map((tc, i) => (
                                <div key={`${tc.tool_name}-${i}`}>
                                  <div className="flex items-center gap-1.5 text-[10px]">
                                    {tc.status === 'executing'
                                      ? <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
                                      : _hasToolError(tc.result)
                                        ? <AlertCircle className="h-3 w-3 text-destructive/70" />
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
                                        className="mt-1.5 rounded max-w-full"
                                        maxHeight={192}
                                      />
                                    ) : null;
                                  })}
                                </div>
                              ))}
                            </div>
                          )}
                          {step.error ? (
                            <p className="text-foreground/70">{step.error}</p>
                          ) : step.result ? (
                            <p className="text-muted-foreground whitespace-pre-wrap">{step.result}</p>
                          ) : null}
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  ) : null;
}
