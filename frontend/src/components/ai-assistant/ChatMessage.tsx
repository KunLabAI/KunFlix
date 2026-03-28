'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TypewriterText } from './TypewriterText';
import { ToolCallIndicator } from './ToolCallIndicator';
import { SkillCallIndicator } from './SkillCallIndicator';
import { ThinkingIndicator } from './ThinkingIndicator';
import MultiAgentSteps from '@/components/canvas/MultiAgentSteps';
import type { Message, SkillCall, ToolCall, MultiAgentData } from '@/store/useAIAssistantStore';

/* Markdown组件配置：自定义代码块和图片样式 */
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
  // 过滤空 src 的图片，避免浏览器警告
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const isValidSrc = typeof src === 'string' && src.trim() !== '';
    return isValidSrc ? (
      <img src={src} alt={alt || ''} {...props} className={cn("max-w-full h-auto rounded-lg", props.className)} />
    ) : null;
  },
};

interface ChatMessageProps {
  message: Message;
  isLoading?: boolean;
  isLast?: boolean;
  className?: string;
}

// 浮动跳跃的三点加载动画
function FloatingLoadingDots() {
  return (
    <div className="flex items-center gap-1 h-5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary/60"
          animate={{
            y: [0, -6, 0],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function ChatMessage({ message, isLoading, isLast, className }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';
  const isAiThinking = isStreaming && !message.content && !message.skill_calls?.length && !message.tool_calls?.length;
  // 等待动画显示逻辑：
  // 仅在用户发送消息后、AI还未开始回复时显示（此时消息列表末尾有独立的等待气泡）
  // AI开始流式输出后，不再显示等待动画
  const showLoadingDots = false;

  return (
    <div
      className={cn(
        'flex',
        isUser ? 'justify-end' : 'justify-start',
        className
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'text-secondary-foreground'
        )}
      >
        {/* 用户消息 */}
        {isUser && (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        )}

        {/* AI消息 */}
        {!isUser && (
          <div className="space-y-2">
            {/* 思考中指示器 */}
            {isAiThinking && <ThinkingIndicator />}

            {/* 消息内容 */}
            {message.content && (
              isStreaming ? (
                <TypewriterText
                  content={message.content}
                  isStreaming={isStreaming}
                />
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_p]:leading-7 [&_li]:leading-7">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              )
            )}

            {/* 技能调用指示器 */}
            {message.skill_calls && message.skill_calls.length > 0 && (
              <SkillCallIndicator skillCalls={message.skill_calls} />
            )}

            {/* 工具调用指示器 */}
            {message.tool_calls && message.tool_calls.length > 0 && (
              <ToolCallIndicator toolCalls={message.tool_calls} />
            )}

            {/* 多智能体步骤 */}
            {message.multi_agent && (
              <MultiAgentSteps
                steps={message.multi_agent.steps}
                finalResult={message.multi_agent.finalResult}
                totalTokens={message.multi_agent.totalTokens}
                creditCost={message.multi_agent.creditCost}
                className="mb-2"
              />
            )}

            {/* 加载动画 - 浮动跳跃三点 */}
            {showLoadingDots && (
              <div className="pt-1">
                <FloatingLoadingDots />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
