import React, { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ToolbarAction {
  icon: ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  ariaLabel?: string;
  variant?: 'default' | 'danger' | 'primary';
}

interface NodeToolbarProps {
  actions: ToolbarAction[];
  className?: string;
}

/**
 * 统一的节点工具条组件
 * 连续性设计，无阴影，有趣的悬浮交互
 */
export const NodeToolbar: React.FC<NodeToolbarProps> = ({ actions, className }) => {
  // 按 variant 分组，danger 类型放最后
  const normalActions = actions.filter(a => a.variant !== 'danger');
  const dangerActions = actions.filter(a => a.variant === 'danger');
  const groupedActions = [...normalActions, ...dangerActions];
  const hasDanger = dangerActions.length > 0;
  const dangerStartIndex = normalActions.length;

  return (
    <div 
      className={cn(
        "absolute -bottom-12 left-1/2 -translate-x-1/2",
        "flex items-center",
        "opacity-0 pointer-events-none group-hover:opacity-100",
        "transition-all duration-200 ease-out",
        "group-hover:translate-y-0 translate-y-1",
        "z-30",
        className
      )}
    >
      <div className="flex items-center bg-background/90 backdrop-blur-md border border-border/60 rounded-full px-1 py-1 pointer-events-auto">
        {groupedActions.map((action, index) => {
          const isDanger = action.variant === 'danger';
          const isPrimary = action.variant === 'primary';
          const showSeparator = hasDanger && index === dangerStartIndex && dangerStartIndex > 0;
          
          return (
            <React.Fragment key={index}>
              {/* 分隔线 - 在危险操作前显示 */}
              {showSeparator && (
                <div className="w-px h-4 bg-border/50 mx-0.5" />
              )}
              <button
                onClick={action.onClick}
                title={action.title}
                aria-label={action.ariaLabel || action.title}
                className={cn(
                  "relative w-7 h-7 flex items-center justify-center rounded-full",
                  "transition-all duration-150 ease-out",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  // 默认状态
                  !isDanger && !isPrimary && [
                    "text-muted-foreground",
                    "hover:text-foreground hover:bg-secondary",
                    "active:scale-90",
                  ],
                  // Primary 状态（如 AI 编辑）
                  isPrimary && [
                    "text-primary/80",
                    "hover:text-primary hover:bg-primary/10",
                    "active:scale-90",
                  ],
                  // 危险操作
                  isDanger && [
                    "text-muted-foreground",
                    "hover:text-destructive hover:bg-destructive/10",
                    "active:scale-90",
                  ]
                )}
              >
                {/* 图标容器 - 添加悬浮缩放效果 */}
                <span className="transition-transform duration-150 group-hover/btn:scale-110 flex items-center justify-center">
                  {action.icon}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default NodeToolbar;
