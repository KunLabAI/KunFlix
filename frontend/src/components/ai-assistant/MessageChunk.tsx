'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MessageChunkProps {
  content: string;
  maxChunkSize?: number;
  className?: string;
  renderContent: (content: string) => React.ReactNode;
}

const DEFAULT_CHUNK_SIZE = 2000; // 每次挂载的最大字符数
const MAX_CHUNKS_DISPLAY = 3; // 初始显示的最大块数

export function MessageChunk({
  content,
  maxChunkSize = DEFAULT_CHUNK_SIZE,
  className,
  renderContent,
}: MessageChunkProps) {
  const [expandedChunks, setExpandedChunks] = useState<number>(MAX_CHUNKS_DISPLAY);
  const [isFullyExpanded, setIsFullyExpanded] = useState(false);

  // 将内容分块
  const chunks = useMemo(() => {
    if (content.length <= maxChunkSize) {
      return [content];
    }

    const result: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      // 尝试在段落边界分割
      let splitIndex = maxChunkSize;
      
      if (remaining.length > maxChunkSize) {
        // 查找最近的段落边界
        const paragraphBreak = remaining.lastIndexOf('\n\n', maxChunkSize);
        const lineBreak = remaining.lastIndexOf('\n', maxChunkSize);
        const sentenceBreak = remaining.lastIndexOf('. ', maxChunkSize);
        
        if (paragraphBreak > maxChunkSize * 0.5) {
          splitIndex = paragraphBreak + 2;
        } else if (lineBreak > maxChunkSize * 0.5) {
          splitIndex = lineBreak + 1;
        } else if (sentenceBreak > maxChunkSize * 0.5) {
          splitIndex = sentenceBreak + 2;
        }
      }

      result.push(remaining.slice(0, splitIndex));
      remaining = remaining.slice(splitIndex);
    }

    return result;
  }, [content, maxChunkSize]);

  const totalChunks = chunks.length;
  const needsChunking = totalChunks > 1;

  // 展开更多块
  const expandMore = useCallback(() => {
    setExpandedChunks((prev) => {
      const next = prev + MAX_CHUNKS_DISPLAY;
      if (next >= totalChunks) {
        setIsFullyExpanded(true);
      }
      return Math.min(next, totalChunks);
    });
  }, [totalChunks]);

  // 收起
  const collapse = useCallback(() => {
    setExpandedChunks(MAX_CHUNKS_DISPLAY);
    setIsFullyExpanded(false);
  }, []);

  // 全部展开
  const expandAll = useCallback(() => {
    setExpandedChunks(totalChunks);
    setIsFullyExpanded(true);
  }, [totalChunks]);

  // 如果不需要分块，直接渲染
  if (!needsChunking) {
    return <div className={className}>{renderContent(content)}</div>;
  }

  const visibleChunks = chunks.slice(0, expandedChunks);
  const hasMoreChunks = expandedChunks < totalChunks;

  return (
    <div className={cn('space-y-4', className)}>
      {/* 可见块 */}
      {visibleChunks.map((chunk, index) => (
        <div key={index} className="message-chunk">
          {renderContent(chunk)}
        </div>
      ))}

      {/* 展开/收起控制 */}
      <div className="flex items-center justify-center gap-2 pt-2">
        {hasMoreChunks && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={expandMore}
              className="h-8 px-3 text-xs"
            >
              <ChevronDown className="h-3.5 w-3.5 mr-1" />
              展开更多 ({totalChunks - expandedChunks} 段剩余)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={expandAll}
              className="h-8 px-3 text-xs text-muted-foreground"
            >
              展开全部
            </Button>
          </>
        )}
        
        {isFullyExpanded && totalChunks > MAX_CHUNKS_DISPLAY && (
          <Button
            variant="outline"
            size="sm"
            onClick={collapse}
            className="h-8 px-3 text-xs"
          >
            <ChevronUp className="h-3.5 w-3.5 mr-1" />
            收起
          </Button>
        )}
      </div>

      {/* 进度指示器 */}
      {needsChunking && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/50 rounded-full transition-all duration-300"
              style={{ width: `${(expandedChunks / totalChunks) * 100}%` }}
            />
          </div>
          <span className="tabular-nums">
            {expandedChunks} / {totalChunks}
          </span>
        </div>
      )}
    </div>
  );
}

// Hook 用于检测消息是否需要分块
export function useMessageChunking(content: string, threshold: number = 10000) {
  return useMemo(() => {
    return {
      needsChunking: content.length > threshold,
      contentLength: content.length,
      estimatedChunks: Math.ceil(content.length / 2000),
    };
  }, [content, threshold]);
}

export default MessageChunk;
