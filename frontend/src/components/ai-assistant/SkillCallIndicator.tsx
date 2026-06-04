'use client';

import React, { useState, useEffect } from 'react';
import { Zap, Loader2, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SkillCallData {
  skill_name: string;
  status: 'loading' | 'loaded';
  description?: string;
}

interface SkillCallIndicatorProps {
  skillCalls: SkillCallData[];
  className?: string;
}

export function SkillCallIndicator({ skillCalls, className }: SkillCallIndicatorProps) {
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [userToggledManually, setUserToggledManually] = useState(false);

  const loadingCount = skillCalls.filter(s => s.status === 'loading').length;
  const loadedCount = skillCalls.filter(s => s.status === 'loaded').length;

  // 全部加载完成后自动折叠
  useEffect(() => {
    const allDone = skillCalls.length > 0 && loadingCount === 0;
    allDone && !isPanelCollapsed && !userToggledManually && setIsPanelCollapsed(true);
  }, [loadingCount, skillCalls.length, isPanelCollapsed, userToggledManually]);

  return (
    <div className={cn('space-y-1 w-full', className)}>
      {/* 折叠摘要头 */}
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-muted/50 rounded-lg transition-colors"
        onClick={() => { setIsPanelCollapsed(v => !v); setUserToggledManually(true); }}
      >
        {loadingCount > 0
          ? <Loader2 className="h-3.5 w-3.5 text-foreground/70 animate-spin" />
          : <CheckCircle2 className="h-3.5 w-3.5 text-foreground/50" />
        }
        <span className="text-xs flex-1 text-foreground/70">
          {loadingCount > 0 ? `正在加载 ${loadingCount} 个技能` : `${loadedCount} 个技能已加载`}
        </span>
        {isPanelCollapsed
          ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
          : <ChevronUp className="h-3 w-3 text-muted-foreground" />
        }
      </div>

      {!isPanelCollapsed && skillCalls.map((skill, index) => {
        const isLoading = skill.status === 'loading';

        return (
          <div
            key={`${skill.skill_name}-${index}`}
            className={cn(
              'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all duration-200',
              isLoading
                ? 'bg-[var(--color-status-warning-bg)] border-[var(--color-status-warning-border)]'
                : 'bg-[var(--color-status-success-bg)] border-[var(--color-status-success-border)]'
            )}
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 text-[var(--color-status-warning-icon)] animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5 text-[var(--color-status-success-icon)]" />
            )}
            <span
              className={cn(
                'text-xs',
                isLoading
                  ? 'text-[var(--color-status-warning-text)]'
                  : 'text-[var(--color-status-success-text)]'
              )}
            >
              {isLoading ? `正在加载技能: ${skill.skill_name}` : `已加载技能: ${skill.skill_name}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
