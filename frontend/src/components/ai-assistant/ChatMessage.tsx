'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { Music, Film, Image as ImageIcon, ScrollText, Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TypewriterText } from './TypewriterText';
import { CallTimelinePanel } from './CallTimelinePanel';
import { ThinkPanel } from './ThinkPanel';
import { DraggableTextWrapper } from './DraggableTextWrapper';
import { LazyImage } from './LazyImage';
import { LazyCodeBlock } from './LazyCodeBlock';
import { MessageChunk, useMessageChunking } from './MessageChunk';
import { VideoTaskCard } from './VideoTaskCard';
import { MusicTaskCard } from './MusicTaskCard';
import { WelcomeMessage } from './WelcomeMessage';
import { CompactionNotice } from './CompactionNotice';
import { AudioDisplay } from '@/components/canvas/AudioNode/AudioDisplay';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { Message, NodeAttachment, HarnessEvent } from '@/store/useAIAssistantStore';

// ---------------------------------------------------------------------------
// Video marker parsing
// ---------------------------------------------------------------------------

// <!-- __VIDEO_TASK__|{task_id}|{video_mode}|{model} -->
const VIDEO_TASK_RE = /<!-- __VIDEO_TASK__\|([^|]+)\|([^|]+)\|([^|]*) -->/g;
// __VIDEO_DONE__{task_id}|{url}|{quality}|{duration}|{cost}
const VIDEO_DONE_RE = /^__VIDEO_DONE__([^|]+)\|([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)$/;

// ---------------------------------------------------------------------------
// Music marker parsing
// ---------------------------------------------------------------------------

// <!-- __MUSIC_TASK__|{task_id}|{model} -->
const MUSIC_TASK_RE = /<!-- __MUSIC_TASK__\|([^|]+)\|([^|]*) -->/g;
// __MUSIC_DONE__{task_id}|{url}|{cost}
const MUSIC_DONE_RE = /^__MUSIC_DONE__([^|]+)\|([^|]+)\|([^|]*)$/;

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
// 说明：在同一轮 AI 回复中，复杂任务可能出现多次思考（例如工具调用后二次推理），
// 需要使用全局标志提取所有思考段落，然后合并到一个面板，
// 同时从正文中剔除所有已匹配的 <think>...</think> 块，避免未匹配的残留标签被当作普通文本渲染。
const THINK_TAG_RE = /<think>([\s\S]*?)(?:<\/think>|$)/g;

interface ParsedThinkContent {
  thinkingContent: string;     // 思考内容（多段合并后）
  responseContent: string;      // 正式回复内容
  isThinkingComplete: boolean;  // 思考是否全部闭合完成
}

function parseThinkContent(content: string): ParsedThinkContent {
  // 未出现任何 <think> 标签：全部为正文
  if (!content.includes('<think>')) {
    return { thinkingContent: '', responseContent: content, isThinkingComplete: true };
  }

  // 提取所有 <think>...</think> 段落（含未闭合的尾部）
  const thinkingSegments: string[] = [];
  const re = new RegExp(THINK_TAG_RE.source, 'g');
  let hasUnclosed = false;
  for (let m = re.exec(content); m !== null; m = re.exec(content)) {
    const matched = content.slice(m.index, re.lastIndex);
    const closed = matched.endsWith('</think>');
    thinkingSegments.push((m[1] || '').trim());
    closed || (hasUnclosed = true);
    // 未闭合意味着流式在进行中，已到达字符串末尾，后续不会再匹配。
    // 防护：如果 lastIndex 未推进造成死循环，手动 +1。
    closed || (m.index === re.lastIndex && re.lastIndex++);
  }

  // 从原串中剔除所有已闭合的 <think>...</think> 块得到正文；
  // 未闭合的尾部（流式中）从起点到文末一并剔除。
  let stripped = content.replace(/<think>[\s\S]*?<\/think>/g, '');
  hasUnclosed && (stripped = stripped.replace(/<think>[\s\S]*$/, ''));

  return {
    thinkingContent: thinkingSegments.filter(Boolean).join('\n\n---\n\n'),
    responseContent: stripped.trim(),
    isThinkingComplete: !hasUnclosed,
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

interface MusicCardInfo {
  taskId: string;
  model?: string;
  audioUrl?: string;
  creditCost?: number;
  lyrics?: string;
}

function parseMusicMarkers(content: string): { cleanContent: string; musicCards: MusicCardInfo[] } {
  // __MUSIC_DONE__: entire message is a completion marker
  const doneMatch = MUSIC_DONE_RE.exec(content);
  if (doneMatch) {
    return {
      cleanContent: '',
      musicCards: [{
        taskId: doneMatch[1],
        audioUrl: doneMatch[2],
        creditCost: parseFloat(doneMatch[3]) || 0,
      }],
    };
  }

  // __MUSIC_TASK__: extract in-content task markers
  const musicCards: MusicCardInfo[] = [];
  const cleanContent = content.replace(MUSIC_TASK_RE, (_m, taskId, model) => {
    musicCards.push({ taskId, model });
    return '';
  }).trim();

  return { cleanContent, musicCards };
}

// ---------------------------------------------------------------------------
// Media URL normalization: LLM may hallucinate full domain prefixes on local URLs
// e.g. "https://api.mini.ai/media/UUID.jpg" → "/api/media/UUID.jpg"
// ---------------------------------------------------------------------------
const _MEDIA_UUID_RE = /(?:https?:\/\/[^/]+)?\/(?:api\/)?media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+)/i;

function normalizeMediaUrl(url: string): string {
  const match = _MEDIA_UUID_RE.exec(url);
  return match ? `/api/media/${match[1]}` : url;
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
  // 表格：外包 overflow-x-auto 容器，让表格在气泡宽度不够时横向滚动而不被挤压。
  // th/td 加 whitespace-nowrap 使单元格内容尽可能一行显示。
  table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="my-3 overflow-x-auto rounded-md border border-[var(--color-border-light)]">
      <table className="min-w-full text-sm border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="bg-muted/50" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th
      className="px-3 py-2 text-left font-semibold whitespace-nowrap border-b border-[var(--color-border-light)]"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td
      className="px-3 py-2 whitespace-nowrap border-b border-[var(--color-border-light)]/60"
      {...props}
    >
      {children}
    </td>
  ),
  // 使用懒加载图片组件
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const srcString = normalizeMediaUrl(typeof src === 'string' ? src : '');
    return (
      <LazyImage
        src={srcString}
        alt={alt}
        className={cn("max-w-full rounded-lg my-2", props.className)}
        maxHeight={320}
      />
    );
  },
});

interface ChatMessageProps {
  message: Message;
  className?: string;
  /** 对话面板内联重试：当 message.error?.retryable 为 true 且传入 onRetry 时展示按钮 */
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Harness 事件映射表 + 展示组件
// ---------------------------------------------------------------------------

const HARNESS_EVENT_CONFIG: Record<HarnessEvent['type'], {
  label: string;
  color: string;
  bgColor: string;
  icon: string;
}> = {
  llm_retry:             { label: 'LLM 重试中',         color: 'text-amber-600 dark:text-amber-400',  bgColor: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800', icon: '⟳' },
  llm_circuit_breaker:   { label: 'LLM 调用熔断',       color: 'text-red-600 dark:text-red-400',      bgColor: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800',       icon: '⚡' },
  tool_circuit_breaker:  { label: '工具调用熔断',        color: 'text-red-600 dark:text-red-400',      bgColor: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800',       icon: '⚡' },
  subtask_retry:         { label: '子任务重试中',        color: 'text-blue-600 dark:text-blue-400',    bgColor: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',   icon: '↻' },
};

function HarnessEventBanner({ events }: { events: HarnessEvent[] }) {
  const latestByType = useMemo(() => {
    const map = new Map<string, HarnessEvent>();
    events.forEach(e => map.set(e.type, e));
    return Array.from(map.values());
  }, [events]);

  return (
    <div className="space-y-1 my-1.5">
      {latestByType.map((evt) => {
        const cfg = HARNESS_EVENT_CONFIG[evt.type];
        const detail = evt.attempt && evt.maxRetries
          ? `(${evt.attempt}/${evt.maxRetries})`
          : '';
        return (
          <div
            key={evt.type}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium',
              cfg.bgColor, cfg.color,
            )}
          >
            <span>{cfg.icon}</span>
            <span>{cfg.label} {detail}</span>
            {evt.error && (
              <span className="ml-1 opacity-70 font-normal truncate max-w-[200px]" title={evt.error}>
                — {evt.error}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 平滑流式指示器（用于内容生成中）
function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1.5 h-5">
      {/* 波浪动画 */}
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary/60"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function UserAttachmentPreview({ attachments }: { attachments: NodeAttachment[] }) {
  const [previewAttachment, setPreviewAttachment] = useState<NodeAttachment | null>(null);

  if (!attachments?.length) return null;

  // 类型图标映射表
  const TYPE_ICONS: Record<string, React.ElementType> = {
    image: ImageIcon,
    video: Film,
    audio: Music,
    text: ScrollText,
    storyboard: ScrollText,
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-2">
        {attachments.map(a => {
          const Icon = TYPE_ICONS[a.nodeType] ?? ScrollText;

          // 图片附件：缩略图 + 左上图标 + 底部名称
          if (a.nodeType === 'image' && a.thumbnailUrl) {
            return (
              <div
                key={a.nodeId}
                className="relative size-[88px] rounded-lg overflow-hidden flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all border border-border shadow-sm"
                title={a.label}
                onClick={() => setPreviewAttachment(a)}
              >
                <img src={a.thumbnailUrl} alt={a.label} className="w-full h-full object-cover" />
                <div className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/40 backdrop-blur-sm">
                  <Icon className="w-3 h-3 text-white" />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                  <p className="text-[10px] text-white truncate">{a.label}</p>
                </div>
              </div>
            );
          }

          // 视频附件：视频帧 + 居中播放按钮 + 左上图标 + 底部名称
          if (a.nodeType === 'video' && a.thumbnailUrl) {
            return (
              <div
                key={a.nodeId}
                className="relative size-[88px] rounded-lg overflow-hidden flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all bg-black/80"
                title={a.label}
                onClick={() => setPreviewAttachment(a)}
              >
                <video
                  src={`${a.thumbnailUrl}#t=0.5`}
                  preload="metadata"
                  muted
                  playsInline
                  className="w-full h-full object-cover opacity-60"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-black/50 backdrop-blur flex items-center justify-center">
                    <Play className="w-3 h-3 text-white ml-0.5" fill="white" />
                  </div>
                </div>
                <div className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/40 backdrop-blur-sm">
                  <Icon className="w-3 h-3 text-white" />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                  <p className="text-[10px] text-white truncate">{a.label}</p>
                </div>
              </div>
            );
          }

          // 音频附件：居中播放图标 + 左上图标 + 底部名称
          if (a.nodeType === 'audio' && a.thumbnailUrl) {
            return (
              <div
                key={a.nodeId}
                className="relative size-[88px] rounded-lg overflow-hidden flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all bg-secondary/50 flex items-center justify-center"
                title={a.label}
                onClick={() => setPreviewAttachment(a)}
              >
                <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center">
                  <Play className="w-4 h-4 text-foreground ml-0.5" fill="currentColor" />
                </div>
                <div className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/40 backdrop-blur-sm">
                  <Icon className="w-3 h-3 text-white" />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 to-transparent p-1.5">
                  <p className="text-[10px] text-foreground truncate">{a.label}</p>
                </div>
              </div>
            );
          }

          // 其他类型（文本/分镜）：摘要 + 左上图标 + 底部名称
          return (
            <div
              key={a.nodeId}
              className="relative size-[88px] rounded-lg overflow-hidden flex-shrink-0 bg-muted p-2 pt-7"
              title={a.label}
            >
              {a.excerpt && (
                <p className="text-[7px] text-muted-foreground whitespace-pre-wrap break-words leading-tight line-clamp-4">
                  {a.excerpt}
                </p>
              )}
              <div className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/40 backdrop-blur-sm">
                <Icon className="w-3 h-3 text-white" />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 to-transparent p-1.5">
                <p className="text-[10px] text-foreground truncate">{a.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 音视频全屏预览弹窗 */}
      <Dialog open={!!previewAttachment} onOpenChange={(open) => { open || setPreviewAttachment(null); }}>
        <DialogContent
          className="max-w-[90vw] w-auto p-0 bg-black/95 border-none shadow-2xl [&>button]:hidden flex items-center justify-center"
          onClick={() => setPreviewAttachment(null)}
        >
          <DialogTitle className="sr-only">{previewAttachment?.label || 'Preview'}</DialogTitle>
          <button
            className="absolute top-3 right-3 z-50 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            onClick={() => setPreviewAttachment(null)}
          >
            <X className="w-4 h-4" />
          </button>
          <div className="p-6" onClick={(e) => e.stopPropagation()}>
            {previewAttachment?.nodeType === 'video' && previewAttachment.thumbnailUrl && (
              <video
                src={previewAttachment.thumbnailUrl}
                controls
                autoPlay
                className="max-w-[80vw] max-h-[75vh] rounded-lg"
              />
            )}
            {previewAttachment?.nodeType === 'audio' && previewAttachment.thumbnailUrl && (
              <div className="w-[400px] h-[320px] rounded-xl overflow-hidden bg-black">
                <AudioDisplay
                  audioUrl={previewAttachment.thumbnailUrl}
                  lyrics={(previewAttachment.meta as { lyrics?: string })?.lyrics}
                  selected={true}
                />
              </div>
            )}
            {previewAttachment?.nodeType === 'image' && previewAttachment.thumbnailUrl && (
              <img
                src={previewAttachment.thumbnailUrl}
                alt={previewAttachment.label}
                className="max-w-[80vw] max-h-[75vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ChatMessage({ message, className, onRetry }: ChatMessageProps) {
  const { t } = useTranslation();
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';
  
  // 动画锁：首次进入 streaming 时开启，TypewriterText 追赶完成后关闭
  // 防止 streaming→complete 过渡期 TypewriterText 被过早卸载
  const [isAnimating, setIsAnimating] = useState(isStreaming);

  useEffect(() => {
    isStreaming && !isAnimating && setIsAnimating(true);
  }, [isStreaming, isAnimating]);

  const handleTypewriterComplete = useCallback(() => {
    setIsAnimating(false);
  }, []);
  
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
  const { cleanContent: videoCleanContent, videoCards } = useMemo(
    () => (!isUser && !isStreaming && responseContent)
      ? parseVideoMarkers(responseContent)
      : { cleanContent: responseContent, videoCards: [] as VideoCardInfo[] },
    [responseContent, isUser, isStreaming],
  );

  // 解析音乐标记（在视频标记清理后的内容上继续解析）
  const { cleanContent, musicCards } = useMemo(
    () => (!isUser && !isStreaming && videoCleanContent)
      ? parseMusicMarkers(videoCleanContent)
      : { cleanContent: videoCleanContent, musicCards: [] as MusicCardInfo[] },
    [videoCleanContent, isUser, isStreaming],
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

  // 合并两种来源的音乐任务：内容解析 + SSE 事件
  const allMusicCards = useMemo(() => {
    const sseCards: MusicCardInfo[] = (message.music_tasks || []).map((mt) => ({
      taskId: mt.task_id,
      model: mt.model,
    }));
    const seen = new Set(musicCards.map((c) => c.taskId));
    return [...musicCards, ...sseCards.filter((c) => !seen.has(c.taskId))];
  }, [musicCards, message.music_tasks]);

  // 纯媒体完成消息（__VIDEO_DONE__ / __MUSIC_DONE__）无需渲染文本
  const isMediaOnlyMessage = (allVideoCards.length > 0 || allMusicCards.length > 0) && !cleanContent;

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
          isMediaOnlyMessage && '!px-0 !py-0 !bg-transparent !border-transparent !shadow-none',
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
                  {/* 单智能体思考面板：有思考内容时显示（独立于多智能体面板） */}
                  {thinkingContent && (
                    <ThinkPanel 
                      isThinking={isSingleAgentThinking}
                      thinkingContent={thinkingContent}
                    />
                  )}

                  {/* 多智能体协作步骤面板：显示在思考面板之后、回复内容之前 */}
                  {message.multi_agent && (
                    <ThinkPanel
                      steps={message.multi_agent.steps}
                      isThinking={isMultiAgentThinking}
                      className="mb-2"
                    />
                  )}
                  
                  {/* 流式输出且无思考内容时显示平滑加载动画 */}
                  {isStreaming && !thinkingContent && !message.multi_agent && !cleanContent && (
                    <div className="py-2 px-1">
                      <StreamingIndicator />
                    </div>
                  )}

                  {/* 正式回复内容：思考完成后或无思考内容时显示 */}
                  {cleanContent && (isThinkingComplete || !thinkingContent) && (
                    (isStreaming || isAnimating) ? (
                      // 流式输出 / 追赶动画：使用 TypewriterText 逐字渲染
                      <TypewriterText
                        content={cleanContent}
                        isStreaming={isStreaming}
                        onComplete={handleTypewriterComplete}
                      />
                    ) : needsChunking ? (
                      // 长内容分块渲染（非流式）
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
                            [&_ul]:my-2 [&_ol]:my-2">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                              {chunk}
                            </ReactMarkdown>
                          </div>
                        )}
                      />
                    ) : (
                      // 普通内容渲染（非流式）
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
                        [&_ul]:my-2 [&_ol]:my-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {cleanContent}
                        </ReactMarkdown>
                      </div>
                    )
                  )}

                  {/* 错误提示 + 内联重试按钮：优先走 i18n errors.<code>，缺失时回退 detail */}
                  {message.error && (
                    <div className="flex items-center gap-2 mt-1.5 px-3 py-2 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
                      <span className="shrink-0">⚠</span>
                      <span className="flex-1">
                        {t(`errors.${message.error.code}`, { defaultValue: message.error.detail })}
                      </span>
                      {message.error.retryable && onRetry && (
                        <button
                          type="button"
                          onClick={onRetry}
                          className="shrink-0 px-2 py-0.5 rounded border border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-red-700 dark:text-red-300 font-medium"
                        >
                          {t('errors.retry')}
                        </button>
                      )}
                    </div>
                  )}

                  {/* 视频任务卡片 */}
                  {allVideoCards.map((card) => (
                    <VideoTaskCard key={card.taskId} task={card} />
                  ))}

                  {/* 音乐任务卡片 */}
                  {allMusicCards.map((card) => (
                    <MusicTaskCard key={card.taskId} task={card} />
                  ))}

                  {/* Harness 事件横幅（LLM重试、熔断等） */}
                  {message.harness_events && message.harness_events.length > 0 && (
                    <HarnessEventBanner events={message.harness_events} />
                  )}

                  {/* 技能/工具调用连续式面板 */}
                  {((message.skill_calls && message.skill_calls.length > 0) ||
                    (message.tool_calls && message.tool_calls.length > 0)) && (
                    <CallTimelinePanel
                      skillCalls={message.skill_calls}
                      toolCalls={message.tool_calls}
                    />
                  )}
                </>
              )}
            </div>
          </DraggableTextWrapper>
        )}
      </div>
    </div>
  );
}
