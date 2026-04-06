'use client';

import React, { useMemo, useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface TypewriterTextProps {
  content: string;
  isStreaming: boolean;
  className?: string;
}

/* Markdown组件配置 */
const markdownComponents = {
  code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => {
    const isInline = !className;
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    
    return isInline ? (
      <code className="px-1.5 py-0.5 rounded bg-muted text-primary font-mono text-xs before:content-none after:content-none" {...props}>
        {children}
      </code>
    ) : (
      <div className="relative group my-2">
        {language && (
          <span className="absolute top-2 right-2 text-[10px] text-muted-foreground/60 font-mono">{language}</span>
        )}
        <pre className="!bg-muted/80 !p-3 rounded-lg overflow-x-auto border border-border/50">
          <code className={cn("font-mono text-xs", className)} {...props}>{children}</code>
        </pre>
      </div>
    );
  },
  pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => <>{children}</>,
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const isValidSrc = typeof src === 'string' && src.trim() !== '';
    return isValidSrc ? (
      <img src={src} alt={alt || ''} {...props} className={cn("max-w-full h-auto rounded-lg", props.className)} />
    ) : null;
  },
};

export function TypewriterText({ content, isStreaming, className }: TypewriterTextProps) {
  const [displayedContent, setDisplayedContent] = useState('');
  
  // 所有可变状态放在一个 ref 中，动画循环只读 ref
  const ref = useRef({
    content: '',
    displayedLength: 0,
    isStreaming: false,
    rafId: 0,
    lastTime: 0,
  });
  
  // 每次 render 时同步最新的 props 到 ref（不触发 effect）
  ref.current.content = content;
  ref.current.isStreaming = isStreaming;
  
  // 单独的 effect：只负责启动/停止动画循环，依赖 isStreaming
  useEffect(() => {
    // 非流式：直接显示全部，停止动画
    if (!isStreaming) {
      ref.current.displayedLength = content.length;
      setDisplayedContent(content);
      return;
    }
    
    // 流式：启动一个持续运行的动画循环
    ref.current.lastTime = performance.now();
    
    const tick = () => {
      const s = ref.current;
      const now = performance.now();
      const elapsed = now - s.lastTime;
      const targetLen = s.content.length;
      const currentLen = s.displayedLength;
      
      // 还有内容没显示
      if (currentLen < targetLen && elapsed >= 18) {
        s.lastTime = now;
        const remaining = targetLen - currentLen;
        const charsToAdd = remaining > 200 ? 5 : remaining > 100 ? 3 : remaining > 30 ? 2 : 1;
        s.displayedLength = Math.min(currentLen + charsToAdd, targetLen);
        setDisplayedContent(s.content.slice(0, s.displayedLength));
      }
      
      // 只要还在流式状态就继续循环（即使暂时追上了也不停）
      if (s.isStreaming) {
        s.rafId = requestAnimationFrame(tick);
      }
    };
    
    ref.current.rafId = requestAnimationFrame(tick);
    
    // cleanup 只在 isStreaming 变化或组件卸载时执行
    return () => {
      cancelAnimationFrame(ref.current.rafId);
    };
  }, [isStreaming]); // 只依赖 isStreaming，不依赖 content
  
  const proseClasses = cn(
    "prose prose-sm dark:prose-invert max-w-none break-words",
    "[&_p]:leading-7 [&_p]:my-2",
    "[&_li]:leading-7 [&_li]:my-0.5",
    "[&_h1]:mt-4 [&_h1]:mb-2",
    "[&_h2]:mt-3 [&_h2]:mb-2",
    "[&_h3]:mt-3 [&_h3]:mb-1.5",
    "[&_h4]:mt-2 [&_h4]:mb-1",
    "[&_hr]:my-4 [&_hr]:border-border/50",
    "[&_blockquote]:my-3 [&_blockquote]:py-1 [&_blockquote]:px-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:bg-muted/30 [&_blockquote]:rounded-r",
    "[&_pre]:my-3",
    "[&_ul]:my-2 [&_ol]:my-2",
    "[&_table]:my-3 [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_thead]:bg-muted/50"
  );
  
  return (
    <div className={cn('relative', className)}>
      <div className={proseClasses}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {isStreaming ? displayedContent : content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
