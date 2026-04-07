'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  CircleDotDashed,
  Circle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Terminal,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { SkillCall, ToolCall } from '@/store/useAIAssistantStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolCallExt extends ToolCall {
  result?: string;
  duration?: number;
}

interface SkillCallExt extends SkillCall {
  description?: string;
}

interface TimelineEntry {
  id: string;
  type: 'skill' | 'tool';
  name: string;
  status: 'loading' | 'loaded' | 'executing' | 'completed';
  arguments?: Record<string, unknown>;
  result?: string;
  duration?: number;
  description?: string;
}

interface CallTimelinePanelProps {
  skillCalls?: SkillCallExt[];
  toolCalls?: ToolCallExt[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 复用 ToolCallIndicator 的错误检测逻辑 */
function parseToolError(result: string | undefined): string | null {
  const trimmed = (result || '').trim();
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed?.error === 'string' ? parsed.error : null;
  } catch {
    return trimmed.startsWith('Error:') ? trimmed.slice(6).trim() : null;
  }
}

/** 将 skill_calls + tool_calls 合并为有序时间轴条目 */
function buildTimeline(
  skillCalls: SkillCallExt[] | undefined,
  toolCalls: ToolCallExt[] | undefined,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  (skillCalls || []).forEach((s, i) => {
    entries.push({
      id: `skill-${s.skill_name}-${i}`,
      type: 'skill',
      name: s.skill_name,
      status: s.status,
      description: s.description,
    });
  });

  (toolCalls || []).forEach((t, i) => {
    entries.push({
      id: `tool-${t.tool_name}-${i}`,
      type: 'tool',
      name: t.tool_name,
      status: t.status,
      arguments: t.arguments,
      result: t.result,
      duration: t.duration,
    });
  });

  return entries;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type ResolvedStatus = 'active' | 'success' | 'error' | 'pending';

function resolveStatus(entry: TimelineEntry): ResolvedStatus {
  const isActive = entry.status === 'loading' || entry.status === 'executing';
  const isDone = entry.status === 'loaded' || entry.status === 'completed';
  const hasError = entry.type === 'tool' && isDone && !!parseToolError(entry.result);
  return isActive ? 'active' : hasError ? 'error' : isDone ? 'success' : 'pending';
}

const STATUS_STYLE: Record<ResolvedStatus, { icon: string; text: string }> = {
  active: {
    icon: 'text-foreground/70',
    text: 'text-foreground/80',
  },
  success: {
    icon: 'text-foreground/50',
    text: 'text-foreground/60',
  },
  error: {
    icon: 'text-foreground/70',
    text: 'text-foreground/70',
  },
  pending: {
    icon: 'text-muted-foreground',
    text: 'text-muted-foreground',
  },
};

function StatusIcon({ resolved, size = 'sm' }: { resolved: ResolvedStatus; size?: 'sm' | 'xs' }) {
  const cls = size === 'sm' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const style = STATUS_STYLE[resolved];
  const map: Record<ResolvedStatus, React.ReactNode> = {
    active: <CircleDotDashed className={cn(cls, style.icon)} />,
    success: <CheckCircle2 className={cn(cls, style.icon)} />,
    error: <AlertCircle className={cn(cls, style.icon)} />,
    pending: <Circle className={cn(cls, style.icon)} />,
  };
  return <>{map[resolved]}</>;
}

function entryLabel(entry: TimelineEntry): string {
  const map: Record<string, string> = {
    loading: `加载技能: ${entry.name}`,
    loaded: `已加载: ${entry.name}`,
    executing: `执行中: ${entry.name}`,
    completed: parseToolError(entry.result) ? `执行失败: ${entry.name}` : `已完成: ${entry.name}`,
  };
  return map[entry.status] ?? entry.name;
}

// ---------------------------------------------------------------------------
// Minimal animation variants
// ---------------------------------------------------------------------------

const collapseVariants = {
  hidden: { opacity: 0, height: 0, overflow: 'hidden' as const },
  visible: {
    height: 'auto',
    opacity: 1,
    overflow: 'visible' as const,
    transition: { duration: 0.2 },
  },
  exit: {
    height: 0,
    opacity: 0,
    overflow: 'hidden' as const,
    transition: { duration: 0.15 },
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CallTimelinePanel({ skillCalls, toolCalls, className }: CallTimelinePanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const entries = useMemo(() => buildTimeline(skillCalls, toolCalls), [skillCalls, toolCalls]);

  const summary = useMemo(() => {
    let active = 0;
    let success = 0;
    let error = 0;
    entries.forEach((e) => {
      const s = resolveStatus(e);
      active += +(s === 'active');
      success += +(s === 'success');
      error += +(s === 'error');
    });
    return { active, success, error, total: entries.length };
  }, [entries]);

  const toggleEntry = (id: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Overall panel status
  const panelResolved: ResolvedStatus = summary.active > 0
    ? 'active'
    : summary.error > 0
      ? 'error'
      : summary.success === summary.total
        ? 'success'
        : 'pending';

  return (
    <div className={cn('overflow-hidden rounded-lg bg-muted/30', className)}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded((v) => !v)}
      >
        <StatusIcon resolved={panelResolved} size="sm" />

        <span className={cn('text-xs flex-1', STATUS_STYLE[panelResolved].text)}>
          {summary.active > 0
            ? `${summary.active} 个调用执行中`
            : summary.error > 0
              ? `${summary.total} 个调用 (${summary.error} 个失败)`
              : `${summary.total} 个调用已完成`}
        </span>

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {summary.success > 0 && (
            <span>{summary.success} 成功</span>
          )}
          {summary.error > 0 && (
            <span>{summary.error} 失败</span>
          )}
          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </div>
      </div>

      {/* Timeline list */}
      <AnimatePresence>
        {isExpanded && entries.length > 0 && (
          <motion.div
            className="relative overflow-hidden"
            variants={collapseVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Vertical timeline line */}
            <div className="absolute top-0 bottom-0 left-[18px] border-l border-border/40" />

            <ul className="mt-0.5 mr-2 mb-1.5 ml-2 space-y-0.5">
              {entries.map((entry) => {
                const resolved = resolveStatus(entry);
                const style = STATUS_STYLE[resolved];
                const isEntryExpanded = expandedEntries.has(entry.id);
                const errorMessage = entry.type === 'tool' ? parseToolError(entry.result) : null;
                const hasExpandableContent =
                  (entry.type === 'tool' && (entry.arguments || entry.result)) ||
                  entry.description;

                return (
                  <li
                    key={entry.id}
                    className="group flex flex-col py-0.5 pl-5"
                  >
                    {/* Entry row */}
                    <div
                      className="flex items-center gap-2 rounded-md px-1.5 py-1 cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => hasExpandableContent && toggleEntry(entry.id)}
                    >
                      {/* Status icon */}
                      <div className="flex-shrink-0">
                        <StatusIcon resolved={resolved} size="xs" />
                      </div>

                      {/* Type badge */}
                      {entry.type === 'tool' ? (
                        <Terminal className={cn('h-3 w-3 flex-shrink-0', style.icon)} />
                      ) : (
                        <Zap className={cn('h-3 w-3 flex-shrink-0', style.icon)} />
                      )}

                      {/* Label */}
                      <span className={cn('text-xs flex-1 truncate', style.text)}>
                        {entryLabel(entry)}
                      </span>

                      {/* Duration */}
                      {entry.duration != null && (
                        <span className="text-[10px] text-muted-foreground">{entry.duration}ms</span>
                      )}

                      {/* Expand chevron */}
                      {hasExpandableContent && (
                        isEntryExpanded
                          ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                          : <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>

                    {/* Error summary when collapsed */}
                    {errorMessage && !isEntryExpanded && (
                      <div className="px-1.5 pb-1 pt-0.5 ml-5">
                        <div className="text-[10px] text-foreground/60 line-clamp-2">
                          {errorMessage}
                        </div>
                      </div>
                    )}

                    {/* Expandable details */}
                    <AnimatePresence>
                      {isEntryExpanded && hasExpandableContent && (
                        <motion.div
                          className="text-muted-foreground border-l border-border/30 mt-1 ml-2 pl-5 text-xs overflow-hidden"
                          variants={collapseVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                        >
                          {/* Description */}
                          {entry.description && (
                            <p className="py-0.5">{entry.description}</p>
                          )}

                          {/* Arguments */}
                          {entry.arguments && Object.keys(entry.arguments).length > 0 && (
                            <div className="pb-1.5 pt-0.5">
                              <div className="text-[10px] text-muted-foreground mb-1">参数:</div>
                              <pre className="text-xs bg-muted/50 text-foreground/70 rounded p-1.5 overflow-x-auto">
                                {JSON.stringify(entry.arguments, null, 2)}
                              </pre>
                            </div>
                          )}

                          {/* Result */}
                          {entry.result && (
                            <div className="pb-1.5 pt-0.5">
                              <div className="text-[10px] text-muted-foreground mb-1">
                                {errorMessage ? '错误详情:' : '结果:'}
                              </div>
                              <pre
                                className={cn(
                                  'text-xs rounded p-1.5 overflow-x-auto max-h-32',
                                  errorMessage
                                    ? 'bg-muted/50 text-foreground/70'
                                    : 'bg-muted/50 text-foreground/70',
                                )}
                              >
                                {typeof entry.result === 'string'
                                  ? entry.result
                                  : JSON.stringify(entry.result, null, 2)}
                              </pre>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
