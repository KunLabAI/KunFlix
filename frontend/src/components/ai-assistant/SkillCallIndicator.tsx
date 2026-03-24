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
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
            )}
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5 text-emerald-500" />
            )}
            <span
              className={cn(
                'text-xs',
                isLoading
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-emerald-700 dark:text-emerald-300'
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
