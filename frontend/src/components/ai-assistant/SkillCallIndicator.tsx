'use client';

import React from 'react';
import { Zap, Loader2 } from 'lucide-react';
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
  return (
    <div className={cn('space-y-1', className)}>
      {skillCalls.map((skill, index) => {
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
