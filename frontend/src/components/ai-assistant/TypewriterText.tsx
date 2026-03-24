'use client';

import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface TypewriterTextProps {
  content: string;
  isStreaming: boolean;
  className?: string;
}

/* Markdown组件配置：自定义代码块样式 */
const markdownComponents = {
  code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => {
    const isInline = !className;
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    
    return isInline ? (
      <code
        className="px-1.5 py-0.5 rounded bg-muted text-primary font-mono text-xs before:content-none after:content-none"
        {...props}
      >
        {children}
      </code>
    ) : (
      <div className="relative group my-2">
        {language && (
          <span className="absolute top-2 right-2 text-[10px] text-muted-foreground/60 font-mono">
            {language}
          </span>
        )}
        <pre className="!bg-muted/80 !p-3 rounded-lg overflow-x-auto border border-border/50">
          <code className={cn("font-mono text-xs", className)} {...props}>
            {children}
          </code>
        </pre>
      </div>
    );
  },
  pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => <>{children}</>,
};

export function TypewriterText({
  content,
  isStreaming,
  className,
}: TypewriterTextProps) {
  const [showCursor, setShowCursor] = useState(true);

  // 光标闪烁动画
  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 530);

    return () => clearInterval(cursorInterval);
  }, []);

  return (
    <div className={cn('relative', className)}>
      <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_p]:leading-7 [&_li]:leading-7 inline">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </div>
      {isStreaming && (
        <span
          className={cn(
            'inline-block w-2 h-4 ml-0.5 bg-primary rounded-sm align-middle',
            'transition-opacity duration-100'
          )}
          style={{ opacity: showCursor ? 1 : 0.3 }}
        />
      )}
    </div>
  );
}
