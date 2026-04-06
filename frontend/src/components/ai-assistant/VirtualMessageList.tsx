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
// 判定"接近底部"的像素阈值
const NEAR_BOTTOM_THRESHOLD = 80;
// 流式滚动的轮询间隔（ms）
const STREAM_SCROLL_INTERVAL = 120;

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
    const prevMessageLengthRef = useRef(messages.length);

    // 使用 ref 管理滚动状态，避免频繁 setState 导致重渲染和闭包陈旧问题
    const scrollState = useRef({
      isAtBottom: true,
      userScrolledUp: false,
      // 用户最后一次手动滚动的时间戳，用于防止程序化滚动事件覆盖用户意图
      lastUserScrollTime: 0,
    });

    // 存储回调 ref，避免 effect 依赖变化
    const onScrollToBottomRef = useRef(onScrollToBottom);
    onScrollToBottomRef.current = onScrollToBottom;

    // 仅用于通知父组件更新 UI（按钮显示等）
    const [isAtBottomState, setIsAtBottomState] = useState(true);
    
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

    // 获取列表内部滚动元素
    const getListElement = useCallback((): HTMLElement | null => {
      return containerRef.current?.querySelector('[role="grid"]') as HTMLElement | null;
    }, []);

    // 检查当前是否在底部
    const checkIsNearBottom = useCallback((): boolean => {
      const el = getListElement();
      if (!el) return true;
      return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
    }, [getListElement]);

    // 安全地通知父组件 isAtBottom 变化（延迟到下一个微任务，避免在渲染期间触发父组件 setState）
    const notifyAtBottom = useCallback((nearBottom: boolean) => {
      const s = scrollState.current;
      s.isAtBottom = nearBottom;
      setIsAtBottomState(prev => {
        if (prev === nearBottom) return prev;
        queueMicrotask(() => onScrollToBottomRef.current?.(nearBottom));
        return nearBottom;
      });
    }, []);

    // 滚动到指定行
    const scrollToRow = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
      if (listRef.current && index >= 0 && index < messages.length) {
        listRef.current.scrollToRow({
          index,
          align: 'start',
          behavior: behavior === 'smooth' ? 'smooth' : 'auto',
        });
      }
    }, [messages.length]);

    // 滚动到底部（主动调用时重置用户上滑状态）
    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
      if (messages.length > 0 && listRef.current) {
        scrollState.current.userScrolledUp = false;
        listRef.current.scrollToRow({
          index: messages.length - 1,
          align: 'end',
          behavior: behavior === 'smooth' ? 'smooth' : 'auto',
        });
      }
    }, [messages.length]);

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      scrollToBottom,
      scrollToRow,
    }), [scrollToBottom, scrollToRow]);

    // 用户滚动检测
    // 策略：wheel/touch 事件只有用户操作才触发 → 检测主动上滑
    //       scroll 事件 → 仅用于检测用户滚回底部以恢复自动滚动
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let cleanupFns: (() => void)[] = [];

      const attach = () => {
        cleanupFns.forEach(fn => fn());
        cleanupFns = [];

        const listElement = getListElement();
        if (!listElement) return;

        // 鼠标滚轮向上 → 用户主动上滑
        const handleWheel = (e: WheelEvent) => {
          if (e.deltaY < 0) {
            scrollState.current.userScrolledUp = true;
            scrollState.current.lastUserScrollTime = Date.now();
          }
        };

        // 触摸滑动检测
        let touchStartY = 0;
        const handleTouchStart = (e: TouchEvent) => {
          touchStartY = e.touches[0]?.clientY ?? 0;
        };
        const handleTouchMove = (e: TouchEvent) => {
          const currentY = e.touches[0]?.clientY ?? 0;
          // 手指下滑 = 内容上滚 = 用户看历史
          if (currentY > touchStartY + 10) {
            scrollState.current.userScrolledUp = true;
            scrollState.current.lastUserScrollTime = Date.now();
          }
        };

        // scroll 事件：仅检测滚回底部以恢复自动滚动
        const handleScroll = () => {
          const s = scrollState.current;
          const nearBottom = checkIsNearBottom();
          s.isAtBottom = nearBottom;

          // 用户滚回底部 → 恢复自动滚动
          // 200ms 窗口排除程序化滚动产生的 scroll 事件
          if (nearBottom && s.userScrolledUp && Date.now() - s.lastUserScrollTime > 200) {
            s.userScrolledUp = false;
          }

          notifyAtBottom(nearBottom);
        };

        listElement.addEventListener('wheel', handleWheel, { passive: true });
        listElement.addEventListener('touchstart', handleTouchStart, { passive: true });
        listElement.addEventListener('touchmove', handleTouchMove, { passive: true });
        listElement.addEventListener('scroll', handleScroll, { passive: true });

        cleanupFns = [
          () => listElement.removeEventListener('wheel', handleWheel),
          () => listElement.removeEventListener('touchstart', handleTouchStart),
          () => listElement.removeEventListener('touchmove', handleTouchMove),
          () => listElement.removeEventListener('scroll', handleScroll),
        ];
      };

      attach();

      const observer = new MutationObserver(() => {
        if (getListElement() && cleanupFns.length === 0) {
          attach();
        }
      });
      observer.observe(container, { childList: true, subtree: true });

      return () => {
        cleanupFns.forEach(fn => fn());
        observer.disconnect();
      };
    }, [getListElement, checkIsNearBottom, notifyAtBottom]);

    // 处理行渲染回调
    const handleRowsRendered = useCallback((
      visibleRows: { startIndex: number; stopIndex: number },
    ) => {
      const isNearBottom = visibleRows.stopIndex >= messages.length - 1;
      notifyAtBottom(isNearBottom);
    }, [messages.length, notifyAtBottom]);

    // 新消息自动滚动
    useEffect(() => {
      if (messages.length === 0) return;
      
      const prevLength = prevMessageLengthRef.current;
      const isNewMessage = messages.length > prevLength;
      prevMessageLengthRef.current = messages.length;
      
      if (isNewMessage) {
        const lastMessage = messages[messages.length - 1];
        const isUserMessage = lastMessage?.role === 'user';
        const s = scrollState.current;
        
        // 用户发送消息时重置滚动状态
        if (isUserMessage) {
          s.userScrolledUp = false;
        }
        
        // 用户消息始终滚动，AI 消息仅在用户没有手动上滑时滚动
        if (isUserMessage || !s.userScrolledUp) {
          const timeoutId = setTimeout(() => {
            scrollToBottom(scrollBehavior === 'smooth' ? 'smooth' : 'auto');
          }, 50);
          return () => clearTimeout(timeoutId);
        }
      }
    }, [messages.length, scrollBehavior, scrollToBottom]);

    // 流式内容更新时自动滚动 - 使用稳定的 interval 而非依赖 messages 变化
    useEffect(() => {
      if (!isLoading) return;

      const intervalId = setInterval(() => {
        const s = scrollState.current;
        // 用户手动上滑时不自动滚动
        if (s.userScrolledUp) return;
        
        // 流式期间始终尝试滚动到底部
        if (messages.length > 0 && listRef.current) {
          listRef.current.scrollToRow({
            index: messages.length - 1,
            align: 'end',
            behavior: 'auto',
          });
        }
      }, STREAM_SCROLL_INTERVAL);

      return () => clearInterval(intervalId);
    }, [isLoading, messages.length]);

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
