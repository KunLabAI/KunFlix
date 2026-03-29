'use client';

import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import { cn } from '@/lib/utils';

// 动态导入 SyntaxHighlighter 以减少初始包体积
const SyntaxHighlighter = lazy(() => 
  import('react-syntax-highlighter/dist/cjs/prism-async-light').then(mod => ({ default: mod.default }))
);

// 动态导入常用语言支持
const loadLanguage = async (language: string) => {
  const languageMap: Record<string, () => Promise<unknown>> = {
    javascript: () => import('react-syntax-highlighter/dist/cjs/languages/prism/javascript'),
    typescript: () => import('react-syntax-highlighter/dist/cjs/languages/prism/typescript'),
    python: () => import('react-syntax-highlighter/dist/cjs/languages/prism/python'),
    java: () => import('react-syntax-highlighter/dist/cjs/languages/prism/java'),
    go: () => import('react-syntax-highlighter/dist/cjs/languages/prism/go'),
    rust: () => import('react-syntax-highlighter/dist/cjs/languages/prism/rust'),
    css: () => import('react-syntax-highlighter/dist/cjs/languages/prism/css'),
    html: () => import('react-syntax-highlighter/dist/cjs/languages/prism/markup'),
    json: () => import('react-syntax-highlighter/dist/cjs/languages/prism/json'),
    sql: () => import('react-syntax-highlighter/dist/cjs/languages/prism/sql'),
    bash: () => import('react-syntax-highlighter/dist/cjs/languages/prism/bash'),
    shell: () => import('react-syntax-highlighter/dist/cjs/languages/prism/bash'),
    yaml: () => import('react-syntax-highlighter/dist/cjs/languages/prism/yaml'),
    markdown: () => import('react-syntax-highlighter/dist/cjs/languages/prism/markdown'),
  };

  const loader = languageMap[language.toLowerCase()];
  if (loader) {
    try {
      const langModule = await loader();
      return langModule;
    } catch {
      return null;
    }
  }
  return null;
};

interface LazyCodeBlockProps {
  code: string;
  language?: string;
  className?: string;
  showLineNumbers?: boolean;
  maxLines?: number;
}

export function LazyCodeBlock({
  code,
  language = 'text',
  className,
  showLineNumbers = false,
  maxLines = 50,
}: LazyCodeBlockProps) {
  const [isInView, setIsInView] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [shouldExpand, setShouldExpand] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const lines = code.split('\n');
  const hasMoreLines = lines.length > maxLines;
  const displayCode = shouldExpand ? code : lines.slice(0, maxLines).join('\n');

  // 使用 IntersectionObserver 检测代码块是否进入视口
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observerRef.current?.disconnect();
          }
        });
      },
      {
        rootMargin: '100px',
        threshold: 0.1,
      }
    );

    observerRef.current.observe(container);

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  // 加载语言和 SyntaxHighlighter
  useEffect(() => {
    if (!isInView) return;

    const loadHighlighter = async () => {
      await loadLanguage(language);
      setIsLoaded(true);
    };

    loadHighlighter();
  }, [isInView, language]);

  return (
    <div
      ref={containerRef}
      className={cn('relative group my-2', className)}
    >
      {/* 语言标签 */}
      {language && (
        <span className="absolute top-2 right-2 text-[10px] text-muted-foreground/60 font-mono z-10">
          {language}
        </span>
      )}

      {/* 代码块容器 */}
      <div className="relative">
        {!isInView || !isLoaded ? (
          // 占位符
          <pre className="!bg-muted/80 !p-3 rounded-lg overflow-x-auto border border-border/50 min-h-[60px]">
            <code className="font-mono text-xs text-muted-foreground">
              {displayCode.slice(0, 200)}
              {!isInView && '...'}
            </code>
          </pre>
        ) : (
          // 实际代码高亮
          <Suspense
            fallback={
              <pre className="!bg-muted/80 !p-3 rounded-lg overflow-x-auto border border-border/50">
                <code className="font-mono text-xs">{displayCode}</code>
              </pre>
            }
          >
            <SyntaxHighlighter
              language={language}
              useInlineStyles={false}
              showLineNumbers={showLineNumbers}
              lineNumberStyle={{ minWidth: '2em', paddingRight: '1em', color: '#666' }}
              className="!bg-muted/80 !p-3 rounded-lg overflow-x-auto border border-border/50 !text-xs font-mono"
            >
              {displayCode}
            </SyntaxHighlighter>
          </Suspense>
        )}

        {/* 展开更多按钮 */}
        {hasMoreLines && !shouldExpand && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-muted/80 to-transparent flex items-end justify-center pb-2">
            <button
              onClick={() => setShouldExpand(true)}
              className="text-xs text-primary hover:text-primary/80 font-medium px-3 py-1 bg-background/90 rounded-full shadow-sm border border-border/50"
            >
              展开 {lines.length - maxLines} 行更多代码
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default LazyCodeBlock;
