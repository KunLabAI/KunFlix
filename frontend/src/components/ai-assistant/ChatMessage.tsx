'use client';

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TypewriterText } from './TypewriterText';
import { ToolCallIndicator } from './ToolCallIndicator';
import { SkillCallIndicator } from './SkillCallIndicator';
import { ThinkPanel } from './ThinkPanel';
import { DraggableTextWrapper } from './DraggableTextWrapper';
import { LazyImage } from './LazyImage';
import { LazyCodeBlock } from './LazyCodeBlock';
import { MessageChunk, useMessageChunking } from './MessageChunk';
import { VideoTaskCard } from './VideoTaskCard';
import { WelcomeMessage } from './WelcomeMessage';
import { CompactionNotice } from './CompactionNotice';
import type { Message, SkillCall, ToolCall, MultiAgentData, NodeAttachment } from '@/store/useAIAssistantStore';

// ---------------------------------------------------------------------------
// Video marker parsing
// ---------------------------------------------------------------------------

// <!-- __VIDEO_TASK__|{task_id}|{video_mode}|{model} -->
const VIDEO_TASK_RE = /<!-- __VIDEO_TASK__\|([^|]+)\|([^|]+)\|([^|]*) -->/g;
// __VIDEO_DONE__{task_id}|{url}|{quality}|{duration}|{cost}
const VIDEO_DONE_RE = /^__VIDEO_DONE__([^|]+)\|([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)$/;

// ---------------------------------------------------------------------------
// Attachment parsing
// ---------------------------------------------------------------------------
const ATTACHMENTS_RE = /<!-- __ATTACHMENTS__(\[.*?\]) -->/;
const MSG_START_RE = /<!-- __MSG_START__ -->\n?/;

function parseAttachments(content: string) {
  const match = ATTACHMENTS_RE.exec(content);
  if (!match) return { cleanContent: content, attachments: [] };

  try {
    const attachments = JSON.parse(match[1]);
    const splitMatch = MSG_START_RE.exec(content);
    const cleanContent = splitMatch 
      ? content.slice(splitMatch.index + splitMatch[0].length)
      : content.replace(match[0], '').trim();

    return { cleanContent, attachments };
  } catch (e) {
    return { cleanContent: content, attachments: [] };
  }
}

// ---------------------------------------------------------------------------
// Think content parsing - 解析 <think>...</think> 标记
// ---------------------------------------------------------------------------
const THINK_TAG_RE = /<think>([\s\S]*?)(?:<\/think>|$)/;

interface ParsedThinkContent {
  thinkingContent: string;     // 思考内容
  responseContent: string;      // 正式回复内容
  isThinkingComplete: boolean;  // 思考是否完成
}

function parseThinkContent(content: string): ParsedThinkContent {
  const match = THINK_TAG_RE.exec(content);
  
  // 没有 <think> 标记，所有内容都是正式回复
  const noThinkTag = !match;
  if (noThinkTag) {
    return {
      thinkingContent: '',
      responseContent: content,
      isThinkingComplete: true,
    };
  }

  const thinkingContent = match[1] || '';
  const hasClosingTag = content.includes('</think>');
  
  // 提取 </think> 后的内容作为正式回复
  const responseContent = hasClosingTag
    ? content.split('</think>').slice(1).join('</think>').trim()
    : '';

  return {
    thinkingContent: thinkingContent.trim(),
    responseContent,
    isThinkingComplete: hasClosingTag,
  };
}

interface VideoCardInfo {
  taskId: string;
  videoMode?: string;
  model?: string;
  videoUrl?: string;
  quality?: string;
  duration?: number;
  creditCost?: number;
}

function parseVideoMarkers(content: string): { cleanContent: string; videoCards: VideoCardInfo[] } {
  // __VIDEO_DONE__: entire message is a completion marker
  const doneMatch = VIDEO_DONE_RE.exec(content);
  if (doneMatch) {
    return {
      cleanContent: '',
      videoCards: [{
        taskId: doneMatch[1],
        videoUrl: doneMatch[2],
        quality: doneMatch[3],
        duration: parseFloat(doneMatch[4]) || 0,
        creditCost: parseFloat(doneMatch[5]) || 0,
      }],
    };
  }

  // __VIDEO_TASK__: extract in-content task markers
  const videoCards: VideoCardInfo[] = [];
  const cleanContent = content.replace(VIDEO_TASK_RE, (_m, taskId, videoMode, model) => {
    videoCards.push({ taskId, videoMode, model });
    return '';
  }).trim();

  return { cleanContent, videoCards };
}

// Markdown组件配置：使用懒加载优化性能
const createMarkdownComponents = (isStreaming: boolean) => ({
  code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => {
    const isInline = !className;
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    
    // 流式输出时使用简单渲染
    if (isStreaming || isInline) {
      return isInline ? (
        <code
          className="px-1.5 py-0.5 rounded bg-[var(--color-bg-panel)] text-[var(--color-text-primary)] font-mono text-xs before:content-none after:content-none"
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
          <pre className="bg-[var(--color-bg-panel)] p-3 rounded-lg overflow-x-auto border border-[var(--color-border-light)]">
            <code className={cn("font-mono text-xs", className)} {...props}>
              {children}
            </code>
          </pre>
        </div>
      );
    }
    
    // 非流式输出时使用懒加载代码块
    const codeString = String(children).replace(/\n$/, '');
    return (
      <LazyCodeBlock
        code={codeString}
        language={language || 'text'}
        className="my-2"
      />
    );
  },
  pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => <>{children}</>,
  // 使用懒加载图片组件
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const srcString = typeof src === 'string' ? src : '';
    return (
      <LazyImage
        src={srcString}
        alt={alt}
        className={cn("max-w-full h-auto rounded-lg my-2", props.className)}
      />
    );
  },
});

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
          className="w-1.5 h-1.5 rounded-full bg-[var(--color-icon-thinking)]"
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

function UserAttachmentPreview({ attachments }: { attachments: NodeAttachment[] }) {
  if (!attachments?.length) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {attachments.map(a => {
        const isMedia = a.nodeType === 'image' || a.nodeType === 'video';
        
        if (isMedia && a.thumbnailUrl) {
          return (
            <div 
              key={a.nodeId} 
              className="relative w-16 h-16 rounded-md overflow-hidden bg-[var(--color-bg-primary)]/20 border border-[var(--color-bg-primary)]/30 flex-shrink-0"
              title={a.label}
            >
              {a.nodeType === 'video' ? (
                <video src={a.thumbnailUrl} className="w-full h-full object-cover" muted playsInline preload="metadata" />
              ) : (
                <img src={a.thumbnailUrl} alt={a.label} className="w-full h-full object-cover" />
              )}
            </div>
          );
        }
        
        return (
          <div 
            key={a.nodeId} 
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--color-bg-primary)]/20 rounded-md text-xs border border-[var(--color-bg-primary)]/30 max-w-full overflow-hidden"
            title={a.label}
          >
            <span className="truncate opacity-90 font-medium">{a.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ChatMessage({ message, isLoading, isLast, className }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';
  
  // 检测多智能体是否正在思考（有 running 状态的步骤）
  const isMultiAgentThinking = message.multi_agent?.steps.some(s => s.status === 'running') ?? false;
  
  // 解析思考内容和正式回复内容
  const { thinkingContent, responseContent, isThinkingComplete } = useMemo(
    () => parseThinkContent(message.content || ''),
    [message.content]
  );
  
  // 单智能体思考状态：有思考内容且思考未完成
  const isSingleAgentThinking = !message.multi_agent && !!thinkingContent && !isThinkingComplete;
  
  // 解析视频标记（仅对 AI 非流式消息解析，流式消息保持原样）
  const { cleanContent, videoCards } = useMemo(
    () => (!isUser && !isStreaming && responseContent)
      ? parseVideoMarkers(responseContent)
      : { cleanContent: responseContent, videoCards: [] as VideoCardInfo[] },
    [responseContent, isUser, isStreaming],
  );

  // 解析用户消息附件
  const { cleanContent: userCleanContent, attachments: userAttachments } = useMemo(
    () => isUser ? parseAttachments(message.content || '') : { cleanContent: message.content || '', attachments: [] },
    [message.content, isUser]
  );

  // 合并两种来源的视频任务：内容解析 + SSE 事件
  const allVideoCards = useMemo(() => {
    const sseCards: VideoCardInfo[] = (message.video_tasks || []).map((vt) => ({
      taskId: vt.task_id,
      videoMode: vt.video_mode,
      model: vt.model,
    }));
    // 去重（同一 taskId 只保留一个）
    const seen = new Set(videoCards.map((c) => c.taskId));
    return [...videoCards, ...sseCards.filter((c) => !seen.has(c.taskId))];
  }, [videoCards, message.video_tasks]);

  // 纯视频完成消息（__VIDEO_DONE__）无需渲染文本
  const isVideoOnlyMessage = allVideoCards.length > 0 && !cleanContent;

  // 检测消息是否需要分块
  const { needsChunking } = useMessageChunking(cleanContent, 10000);
  
  // 根据流式状态创建 markdown 组件
  const markdownComponents = useMemo(() => createMarkdownComponents(isStreaming), [isStreaming]);

  // 上下文压缩消息：渲染为独立的压缩面板
  if (message.compaction_summary) {
    return <CompactionNotice summary={message.compaction_summary} />;
  }

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
            ? 'bg-[var(--color-text-primary)] text-[var(--color-bg-primary)] rounded-tr-sm'
            : 'text-[var(--color-text-primary)] rounded-tl-sm',
          isVideoOnlyMessage && '!px-0 !py-0 !bg-transparent !border-transparent !shadow-none',
        )}
      >
        {/* 用户消息 */}
        {isUser && (
          <div className="flex flex-col">
            <UserAttachmentPreview attachments={userAttachments} />
            {userCleanContent && <div className="whitespace-pre-wrap break-words leading-relaxed">{userCleanContent}</div>}
          </div>
        )}

        {/* AI消息 */}
        {!isUser && (
          <DraggableTextWrapper>
            <div className="space-y-2">
              {/* 欢迎消息：显示特殊的欢迎组件 */}
              {message.isWelcome && <WelcomeMessage />}
              
              {/* 非欢迎消息：正常渲染 AI 回复内容 */}
              {!message.isWelcome && (
                <>
                  {/* 单智能体思考面板：有思考内容时显示 */}
                  {thinkingContent && (
                    <ThinkPanel 
                      isThinking={isSingleAgentThinking}
                      thinkingContent={thinkingContent}
                    />
                  )}
                  
                  {/* 流式输出且无思考内容时显示点点点动画占位 */}
                  {isStreaming && !thinkingContent && !message.multi_agent && !cleanContent && (
                    <div className="py-2 px-1">
                      <FloatingLoadingDots />
                    </div>
                  )}

                  {/* 正式回复内容：思考完成后或无思考内容时显示 */}
                  {cleanContent && (isThinkingComplete || !thinkingContent) && (
                    isStreaming ? (
                      <TypewriterText
                        content={cleanContent}
                        isStreaming={isStreaming}
                      />
                    ) : needsChunking ? (
                      <MessageChunk
                        content={cleanContent}
                        maxChunkSize={2000}
                        renderContent={(chunk) => (
                          <div className="prose prose-sm dark:prose-invert max-w-none break-words
                            [&_p]:leading-7 [&_p]:my-2
                            [&_li]:leading-7 [&_li]:my-0.5
                            [&_h1]:mt-4 [&_h1]:mb-2
                            [&_h2]:mt-3 [&_h2]:mb-2
                            [&_h3]:mt-3 [&_h3]:mb-1.5
                            [&_h4]:mt-2 [&_h4]:mb-1
                            [&_hr]:my-4 [&_hr]:border-border/50
                            [&_blockquote]:my-3 [&_blockquote]:py-1 [&_blockquote]:px-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:bg-muted/30 [&_blockquote]:rounded-r
                            [&_pre]:my-3
                            [&_ul]:my-2 [&_ol]:my-2
                            [&_table]:my-3 [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_thead]:bg-muted/50">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                              {chunk}
                            </ReactMarkdown>
                          </div>
                        )}
                      />
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words
                        [&_p]:leading-7 [&_p]:my-2
                        [&_li]:leading-7 [&_li]:my-0.5
                        [&_h1]:mt-4 [&_h1]:mb-2
                        [&_h2]:mt-3 [&_h2]:mb-2
                        [&_h3]:mt-3 [&_h3]:mb-1.5
                        [&_h4]:mt-2 [&_h4]:mb-1
                        [&_hr]:my-4 [&_hr]:border-border/50
                        [&_blockquote]:my-3 [&_blockquote]:py-1 [&_blockquote]:px-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:bg-muted/30 [&_blockquote]:rounded-r
                        [&_pre]:my-3
                        [&_ul]:my-2 [&_ol]:my-2
                        [&_table]:my-3 [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_thead]:bg-muted/50">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {cleanContent}
                        </ReactMarkdown>
                      </div>
                    )
                  )}

                  {/* 视频任务卡片 */}
                  {allVideoCards.map((card) => (
                    <VideoTaskCard key={card.taskId} task={card} />
                  ))}

                  {/* 技能调用指示器 */}
                  {message.skill_calls && message.skill_calls.length > 0 && (
                    <SkillCallIndicator skillCalls={message.skill_calls} />
                  )}

                  {/* 工具调用指示器 */}
                  {message.tool_calls && message.tool_calls.length > 0 && (
                    <ToolCallIndicator toolCalls={message.tool_calls} />
                  )}

                  {/* 多智能体思考面板 */}
                  {message.multi_agent && (
                    <ThinkPanel
                      steps={message.multi_agent.steps}
                      isThinking={isMultiAgentThinking}
                      className="mb-2"
                    />
                  )}
                </>
              )}

              {/* 加载动画 - 浮动跳跃三点 - 已移至 VirtualMessageList */}
            </div>
          </DraggableTextWrapper>
        )}
      </div>
    </div>
  );
}
