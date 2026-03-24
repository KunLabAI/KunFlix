'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Send, Loader2, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MessageInputProps {
  onSend: (content: string) => void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function MessageInput({
  onSend,
  isLoading,
  disabled = false,
  placeholder = '输入你的想法...',
  className,
}: MessageInputProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 发送后重新聚焦输入框
  useEffect(() => {
    !isLoading && inputRef.current?.focus();
  }, [isLoading]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const content = inputValue.trim();
      content && onSend(content);
      setInputValue('');
      // 发送后立即重新聚焦
      inputRef.current?.focus();
    },
    [inputValue, onSend]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Enter发送，Shift+Enter换行
      e.key === 'Enter' && !e.shiftKey && handleSubmit(e);
    },
    [handleSubmit]
  );

  const isInputEmpty = !inputValue.trim();
  const isDisabled = disabled || isLoading;

  return (
    <div className={cn('p-3 border-t bg-background', className)}>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {/* 可选：附件按钮 */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            disabled={isDisabled}
            title="添加附件"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        </div>
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1"
          autoFocus
          disabled={isDisabled}
        />
        <Button
          type="submit"
          size="icon"
          disabled={isInputEmpty || isDisabled}
          className={cn(
            'transition-all duration-200',
            !isInputEmpty && !isDisabled && 'bg-primary hover:bg-primary/90'
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
      <div className="flex items-center justify-between mt-1.5 px-1">
        <span className="text-[10px] text-muted-foreground/60">
          Enter 发送 / Shift + Enter 换行
        </span>
        {isLoading && (
          <span className="text-[10px] text-primary/60 animate-pulse">
            AI 正在响应...
          </span>
        )}
      </div>
    </div>
  );
}
