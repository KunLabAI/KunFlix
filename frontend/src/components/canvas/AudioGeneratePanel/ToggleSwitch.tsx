'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  icon?: React.ReactNode;
}

/** 紧凑开关（配置面板用） */
export function ToggleSwitch({ checked, onChange, label, icon }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        {icon}
        {label}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-3 w-3 rounded-full bg-background shadow-sm transition-transform',
            checked ? 'translate-x-3' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}
