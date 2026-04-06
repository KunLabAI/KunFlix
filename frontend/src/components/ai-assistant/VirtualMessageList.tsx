'use client';

import React, { useRef, useCallback, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { List, useDynamicRowHeight, type RowComponentProps } from 'react-window';
import { motion } from 'framer-motion';
import type { Message } from '@/store/useAIAssistantStore';

interface VirtualMessageListProps {
  messages: Message[];
  renderItem: (message: Message, index: number) => React.ReactNode;
  overscan?: number;
  scrollBehavior?: 'instant' | 'smooth';
  onScrollToBottom?: (isAtBottom: boolean) => void;
  className?: string;
  isLoading?: boolean;
}

export interface VirtualMessageListRef {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollToRow: (index: number, behavior?: ScrollBehavior) => void;
}

// 默认消息高度估计值
const DEFAULT_ITEM_HEIGHT = 100;
const OVERSCAN_DEFAULT = 5;

// 行数据类型
interface RowData {
  renderItem: (index: number) => React.ReactNode;
}

// 行组件
const RowComponent = (props: RowComponentProps<RowData>) => {
  const { index, style, renderItem } = props;
  
  return (
    <div style={style}>
      {renderItem(index)}
    </div>
  );
};

export const VirtualMessageList = forwardRef<VirtualMessageListRef, VirtualMessageListProps>(
  function VirtualMessageList({
    messages,
    renderItem,
    overscan = OVERSCAN_DEFAULT,
    scrollBehavior = 'smooth',
    onScrollToBottom,
    className,
    isLoading,
  }, ref) {
    const listRef = useRef<{
      readonly element: HTMLDivElement | null;
      scrollToRow: (config: { index: number; align?: 'auto' | 'center' | 'end' | 'smart' | 'start'; behavior?: 'auto' | 'instant' | 'smooth' }) => void;
    }>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState(400);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [userScrolledUp, setUserScrolledUp] = useState(false);
    const prevMessageLengthRef = useRef(messages.length);
    
    // 使用动态行高 - 不随消息数量变化重置，保持缓存
    const dynamicRowHeight = useDynamicRowHeight({
      defaultRowHeight: DEFAULT_ITEM_HEIGHT,
    });

    // 更新容器尺寸
    useEffect(() => {
      const updateSize = () => {
        if (containerRef.current) {
          setContainerHeight(containerRef.current.clientHeight);
        }
      };
      
      updateSize();
      
      const resizeObserver = new ResizeObserver(updateSize);
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }
      
      return () => resizeObserver.disconnect();
    }, []);

    // 滚动到指定行 - 使用 'start' 对齐确保消息显示在顶部
    const scrollToRow = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
      if (listRef.current && index >= 0 && index < messages.length) {
        listRef.current.scrollToRow({
          index,
          align: 'start',
          behavior: behavior === 'smooth' ? 'smooth' : 'auto',
        });
      }
    }, [messages.length]);

    // 滚动到底部 - 滚动到最后一条消息的底部
    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
      if (messages.length > 0) {
        // 使用 'end' 对齐将最后一条消息的底部对齐到视口底部
        if (listRef.current) {
          listRef.current.scrollToRow({
            index: messages.length - 1,
            align: 'end',
            behavior: behavior === 'smooth' ? 'smooth' : 'auto',
          });
        }
      }
    }, [messages.length]);

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      scrollToBottom,
      scrollToRow,
    }), [scrollToBottom, scrollToRow]);

    // 检测用户手动滚动
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const handleScroll = () => {
        const listElement = container.querySelector('[role="grid"]');
        if (!listElement) return;

        const { scrollTop, scrollHeight, clientHeight } = listElement as HTMLElement;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
        
        if (!isNearBottom) {
          setUserScrolledUp(true);
        } else {
          setUserScrolledUp(false);
        }
      };

      const listElement = container.querySelector('[role="grid"]');
      if (listElement) {
        listElement.addEventListener('scroll', handleScroll);
        return () => listElement.removeEventListener('scroll', handleScroll);
      }
    }, []);

    // 处理行渲染回调
    const handleRowsRendered = useCallback((
      visibleRows: { startIndex: number; stopIndex: number },
    ) => {
      const isNearBottom = visibleRows.stopIndex >= messages.length - 1;
      
      if (isNearBottom !== isAtBottom) {
        setIsAtBottom(isNearBottom);
        onScrollToBottom?.(isNearBottom);
      }
    }, [messages.length, isAtBottom, onScrollToBottom]);

    // 新消息自动滚动
    useEffect(() => {
      if (messages.length === 0) return;
      
      const prevLength = prevMessageLengthRef.current;
      const isNewMessage = messages.length > prevLength;
      prevMessageLengthRef.current = messages.length;
      
      if (isNewMessage) {
        // 检查新消息是否是用户发送的（用户消息总是触发滚动）
        const lastMessage = messages[messages.length - 1];
        const isUserMessage = lastMessage?.role === 'user';
        
        // 用户发送消息时重置滚动状态
        if (isUserMessage) {
          setUserScrolledUp(false);
        }
        
        // 用户发送消息时总是滚动到底部
        // AI 回复时只在用户没有手动向上滚动时才滚动
        if (isUserMessage || !userScrolledUp) {
          const timeoutId = setTimeout(() => {
            scrollToBottom(scrollBehavior === 'smooth' ? 'smooth' : 'auto');
          }, 50);
          return () => clearTimeout(timeoutId);
        }
      }
    }, [messages.length, messages, userScrolledUp, scrollBehavior, scrollToBottom]);

    // 流式内容更新时自动滚动
    useEffect(() => {
      if (!isLoading || messages.length === 0) return;
      
      const lastMessage = messages[messages.length - 1];
      // AI 正在回复且用户没有手动向上滚动
      if (lastMessage?.role === 'ai' && !userScrolledUp) {
        const timeoutId = setTimeout(() => {
          scrollToBottom('auto');
        }, 100);
        return () => clearTimeout(timeoutId);
      }
    }, [messages, isLoading, userScrolledUp, scrollToBottom]);

    // 是否显示等待动画（用户发送消息后，AI还未开始回复）
    const showTypingIndicator = isLoading && messages.length > 0 && messages[messages.length - 1]?.role === 'user';
    
    // 实际渲染的行数（包含等待动画行）
    const totalRowCount = messages.length + (showTypingIndicator ? 1 : 0);

    // 渲染单行
    const renderRow = useCallback((index: number) => {
      // 最后一行是等待动画
      if (index === messages.length && showTypingIndicator) {
        return (
          <div className="px-4 py-2">
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm bg-muted/50">
                <div className="flex items-center gap-1.5 h-5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-2 h-2 rounded-full bg-primary/60"
                      animate={{
                        y: [0, -4, 0],
                        opacity: [0.4, 1, 0.4],
                      }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: i * 0.15,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      }
      
      // 正常消息行
      const message = messages[index];
      return renderItem(message, index);
    }, [messages.length, showTypingIndicator, renderItem, messages]);

    const rowData: RowData = useMemo(() => ({
      renderItem: renderRow,
    }), [renderRow]);

    return (
      <div 
        ref={containerRef}
        className={`relative h-full w-full overflow-hidden ${className || ''}`}
      >
        <List
          listRef={listRef}
          className="scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent pb-4"
          defaultHeight={containerHeight || 400}
          rowComponent={RowComponent}
          rowCount={totalRowCount}
          rowHeight={dynamicRowHeight}
          rowProps={rowData}
          overscanCount={overscan}
          onRowsRendered={handleRowsRendered}
          style={{
            willChange: 'transform',
            transform: 'translateZ(0)',
            height: '100%',
            width: '100%',
            minHeight: '100%',
          }}
        />
      </div>
    );
  }
);

// 导出辅助 Hook - 使用 forwardRef 方式
export function useVirtualListRef() {
  const ref = useRef<VirtualMessageListRef>(null);
  
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    ref.current?.scrollToBottom(behavior);
  }, []);
  
  const scrollToRow = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    ref.current?.scrollToRow(index, behavior);
  }, []);
  
  return {
    ref,
    scrollToBottom,
    scrollToRow,
  };
}

export default VirtualMessageList;
