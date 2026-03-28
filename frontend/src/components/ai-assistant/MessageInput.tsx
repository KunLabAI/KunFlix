'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AgentInfo } from '@/store/useAIAssistantStore';

interface MessageInputProps {
  onSend: (content: string) => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  // Agent selector props
  agentName?: string;
  availableAgents?: AgentInfo[];
  isLoadingAgents?: boolean;
  onSwitchAgent?: (agent: AgentInfo) => void;

}

export function MessageInput({
  onSend,
  isLoading,
  disabled = false,
  placeholder = '输入你的想法...',
  className,
  agentName = 'AI 助手',
  availableAgents = [],
  isLoadingAgents = false,
  onSwitchAgent,
}: MessageInputProps) {
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 发送后重新聚焦输入框
  useEffect(() => {
    !isLoading && textareaRef.current?.focus();
  }, [isLoading]);

  // 自动调整高度
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const content = inputValue.trim();
      content && onSend(content);
      setInputValue('');
      // 重置高度
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      // 发送后立即重新聚焦
      textareaRef.current?.focus();
    },
    [inputValue, onSend]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter发送，Shift+Enter换行
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit]
  );

  const isInputEmpty = !inputValue.trim();
  const isDisabled = disabled || isLoading;

  return (
    <div className={cn('p-3 border-t bg-background', className)}>
      <form onSubmit={handleSubmit} className="relative">
        {/* 输入框区域 */}
        <div className="relative bg-muted/50 rounded-xl border border-border/50 focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-200">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full bg-transparent border-0 resize-none outline-none text-sm text-foreground placeholder:text-muted-foreground/60 min-h-[60px] max-h-[120px] py-3 px-3 pb-6"
            rows={1}
            autoFocus
            disabled={isDisabled}
          />

        </div>

        {/* 底部工具栏：Agent选择器 + 上下文 + 发送按钮 */}
        <div className="flex items-center justify-between mt-2">
          {/* 左侧：Agent选择器（下拉栏样式） */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-sm font-medium hover:bg-primary/10 flex items-center gap-2"
                disabled={isLoadingAgents}
              >
                <span className="text-foreground">{agentName}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50 mb-1">
                选择智能体
              </div>
              {availableAgents.map((agent) => (
                <DropdownMenuItem
                  key={agent.id}
                  onClick={() => onSwitchAgent?.(agent)}
                  className="text-xs cursor-pointer py-2"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{agent.name}</span>
                    {agent.description && (
                      <span className="text-[10px] text-muted-foreground line-clamp-1">
                        {agent.description}
                      </span>
                    )}
                    {agent.target_node_types && agent.target_node_types.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/70">
                        支持: {agent.target_node_types.join(', ')}
                      </span>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
              {availableAgents.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground text-center">
                  暂无可用智能体
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 右侧：发送按钮 */}
          <div className="flex items-center gap-1">
            {/* 发送按钮（纯图标） */}
            <Button
              type="submit"
              size="icon"
              disabled={isInputEmpty || isDisabled}
              className={cn(
                'h-8 w-8 rounded-lg transition-all duration-200',
                isInputEmpty || isDisabled
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md'
              )}
              title={isLoading ? '发送中...' : '发送'}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
