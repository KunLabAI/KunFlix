'use client';

import React, { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SELECT_CLS, SELECT_ARROW_STYLE } from './constants';
import { useDropdownOutside } from '@/hooks/useDropdownOutside';

export interface DropdownOption<V extends string = string> {
  value: V;
  /** 选项左侧自定义渲染（图标等），默认为空 */
  leading?: React.ReactNode;
  /** 显示文本；缺省时直接用 value */
  label?: React.ReactNode;
}

interface Props<V extends string = string> {
  value: V;
  options: DropdownOption<V>[];
  onChange: (v: V) => void;
  /** 按钮内展示的内容（被选中值的显示形式） */
  triggerContent: React.ReactNode;
  /** 按钮类名覆盖 */
  buttonClassName?: string;
  disabled?: boolean;
  maxHeightClass?: string;
}

/**
 * 通用下拉：SELECT_CLS 样式 + 标准选项列表 + 外部点击关闭。
 * 供 ModeSelector / ConfigPanel 内的 aspect / quality / format 复用，减少重复。
 */
export function Dropdown<V extends string = string>({
  value,
  options,
  onChange,
  triggerContent,
  buttonClassName,
  disabled,
  maxHeightClass,
}: Props<V>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useDropdownOutside([[open, ref, setOpen]]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(SELECT_CLS, 'flex items-center gap-1.5', buttonClassName)}
        style={SELECT_ARROW_STYLE}
      >
        {triggerContent}
      </button>
      {open && (
        <div
          className={cn(
            'absolute top-full left-0 mt-1 w-full rounded-lg border border-border/50 bg-popover shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 overflow-hidden overflow-y-auto',
            maxHeightClass,
          )}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] transition-colors cursor-pointer',
                  isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover:bg-accent',
                )}
              >
                {opt.leading}
                <span className="flex-1 text-left">{opt.label ?? opt.value}</span>
                {isSelected && <Check className="w-3 h-3 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
