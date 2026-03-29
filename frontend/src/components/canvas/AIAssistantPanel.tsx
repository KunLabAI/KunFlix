'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { Sparkles, X, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCanvasStore } from '@/store/useCanvasStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';
import { useAuth, createAuthFetch } from '@/context/AuthContext';

// 导入拆分后的组件
import { PanelHeader, MessageInput, ChatMessage } from '@/components/ai-assistant';
import { useSSEHandler, useSessionManager } from '@/components/ai-assistant';
import { VirtualMessageList, ScrollToBottomButton, useVirtualListRef } from '@/components/ai-assistant';
import { usePerformanceMonitor } from '@/components/ai-assistant';

export function AIAssistantPanel() {
  // 登录状态
  const { isAuthenticated, refreshToken, logout } = useAuth();
  
  // 创建带有自动token刷新的fetch包装器
  const authFetch = React.useMemo(
    () => createAuthFetch(refreshToken, logout),
    [refreshToken, logout]
  );
  
  // 面板状态
  const isOpen = useAIAssistantStore((state) => state.isOpen);
  const messages = useAIAssistantStore((state) => state.messages);
  const panelSize = useAIAssistantStore((state) => state.panelSize);
  const panelPosition = useAIAssistantStore((state) => state.panelPosition);
  const setIsOpen = useAIAssistantStore((state) => state.setIsOpen);
  const setMessages = useAIAssistantStore((state) => state.setMessages);
  const setPanelSize = useAIAssistantStore((state) => state.setPanelSize);
  const setPanelPosition = useAIAssistantStore((state) => state.setPanelPosition);

  // 图像编辑上下文
  const imageEditContext = useAIAssistantStore((state) => state.imageEditContext);
  const clearImageEditContext = useAIAssistantStore((state) => state.clearImageEditContext);

  // 上下文使用统计
  const contextUsage = useAIAssistantStore((state) => state.contextUsage);

  // 会话管理
  const {
    sessionId,
    agentId,
    agentName,
    availableAgents,
    isLoadingAgents,
    loadAgents,
    createSessionForTheater,
    switchAgent,
    clearSession,
  } = useSessionManager();

  // SSE处理
  const { parseSSELine, handleSSEEvent, resetStreamingState } = useSSEHandler();

  // 本地状态
  const [isLoading, setIsLoading] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showReloginDialog, setShowReloginDialog] = useState(false);
  const theaterId = useCanvasStore((state) => state.theaterId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const { ref: virtualListRef, scrollToBottom: scrollToBottomVirtual } = useVirtualListRef();

  // 虚拟滚动配置
  const scrollBehavior = useAIAssistantStore((state) => state.scrollBehavior);
  const overscanCount = useAIAssistantStore((state) => state.overscanCount);

  // 注：ESC关闭面板功能已移除

  // 性能监控
  usePerformanceMonitor({
    onLongTask: (duration) => {
      if (duration > 200) {
        console.warn(`[AIAssistantPanel] Long task detected: ${duration}ms`);
      }
    },
    enableFPS: true,
  });

  // 初始化加载Agent列表（仅在已登录时）
  useEffect(() => {
    isAuthenticated && loadAgents();
  }, [loadAgents, isAuthenticated]);

  // 面板打开时初始化会话
  useEffect(() => {
    const initSession = async () => {
      const needsSession = !sessionId || !agentId;
      needsSession && isOpen && theaterId && (await createSessionForTheater(theaterId));
    };
    initSession();
  }, [isOpen, sessionId, agentId, theaterId, createSessionForTheater]);

  // 组件卸载时清理
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  // 发送消息
  const handleSend = useCallback(
    async (content: string) => {
      // 确保会话存在
      let currentSessionId = sessionId;
      let currentAgentId = agentId;

      const needsSession = !currentSessionId || !currentAgentId;
      if (needsSession) {
        !theaterId && console.warn('No theater ID');
        if (!theaterId) return;
        const created = await createSessionForTheater(theaterId);
        if (!created) return;
        currentSessionId = created.sessionId;
        currentAgentId = created.agentId;
      }

      // 添加用户消息
      setMessages((prev) => [...prev, { role: 'user', content, status: 'complete' }]);
      setIsLoading(true);

      // 取消之前的请求
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
        const response = await authFetch(`${apiBase}/api/chats/${currentSessionId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role: 'user',
            content,
            theater_id: theaterId,
            ...(imageEditContext && {
              target_node_id: imageEditContext.nodeId,
              edit_image_url: imageEditContext.imageUrl,
            }),
          }),
          signal: abortControllerRef.current.signal,
        });

        // 处理 HTTP 错误
        if (!response.ok) {
          // 401错误且token刷新失败，显示重新登录弹窗
          if (response.status === 401) {
            setShowReloginDialog(true);
            throw new Error('LOGIN_EXPIRED');
          }
          const _ERROR_MESSAGES: Record<number, string> = {
            402: '积分余额不足，请充值后继续使用',
            403: '无权访问该功能',
            429: '请求过于频繁，请稍后再试',
          };
          throw new Error(_ERROR_MESSAGES[response.status] || `请求失败 (${response.status})`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let currentEvent = '';
        let buffer = '';

        while (reader) {
          const { done, value } = await reader.read();
          done && handleSSEEvent('done', {});
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            !trimmed && (currentEvent = '');
            if (!trimmed) continue;

            const parsed = parseSSELine(trimmed);
            if (parsed) {
              parsed.event && (currentEvent = parsed.event);
              parsed.data !== null && currentEvent && handleSSEEvent(currentEvent, parsed.data);
            }
          }
        }
      } catch (err) {
        const isAbort = (err as Error).name === 'AbortError';
        const isLoginExpired = (err as Error).message === 'LOGIN_EXPIRED';
        // 登录过期不显示错误消息（弹窗已处理）
        !isAbort && !isLoginExpired &&
          setMessages((prev) => [...prev, { role: 'ai', content: `请求失败: ${(err as Error).message}`, status: 'complete' }]);
      } finally {
        setIsLoading(false);
        clearImageEditContext();
      }
    },
    [sessionId, agentId, theaterId, imageEditContext, createSessionForTheater, setMessages, parseSSELine, handleSSEEvent, clearImageEditContext]
  );

  // 调整面板大小
  const handleResizeStart = (e: React.PointerEvent, direction: 'left' | 'right' | 'top' | 'bottom' | 'corner-nw' | 'corner-ne' | 'corner-sw' | 'corner-se') => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panelSize.width;
    const startHeight = panelSize.height;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;

      // 处理宽度调整
      if (direction === 'left' || direction === 'corner-nw' || direction === 'corner-sw') {
        newWidth = Math.max(300, startWidth - deltaX);
      } else if (direction === 'right' || direction === 'corner-ne' || direction === 'corner-se') {
        newWidth = Math.max(300, startWidth + deltaX);
      }

      // 处理高度调整
      if (direction === 'top' || direction === 'corner-nw' || direction === 'corner-ne') {
        newHeight = Math.max(400, startHeight - deltaY);
      } else if (direction === 'bottom' || direction === 'corner-sw' || direction === 'corner-se') {
        newHeight = Math.max(400, startHeight + deltaY);
      }

      setPanelSize({ width: newWidth, height: newHeight });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <>
      {/* 拖拽边界容器 */}
      <div className="fixed inset-0 pointer-events-none z-40" ref={constraintsRef} />

      <AnimatePresence initial={false} mode="wait">
        {!isOpen ? (
          // AI按钮
          <motion.div
            key="ai-button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="pointer-events-auto"
          >
            <Button
              onClick={() => setIsOpen(true)}
              className="h-10 w-10 rounded-full shadow-lg bg-primary hover:bg-primary/90 flex items-center justify-center animate-pulse group relative overflow-hidden"
              title="唤起 AI 助手"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </Button>
          </motion.div>
        ) : (
          // AI面板
          <motion.div
            key="ai-panel"
            drag
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={constraintsRef}
            dragMomentum={false}
            dragElastic={0}
            onDragStart={() => {
              // 拖拽开始时禁止文本选择
              document.body.style.userSelect = 'none';
            }}
            onDragEnd={(_, info) => {
              // 拖拽结束后恢复文本选择
              document.body.style.userSelect = '';
              setPanelPosition({ x: panelPosition.x + info.offset.x, y: panelPosition.y + info.offset.y });
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              opacity: 1,
              scale: 1,
              width: panelSize.width,
              height: panelSize.height,
              x: panelPosition.x,
              y: panelPosition.y,
            }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{
              opacity: { duration: 0.15 },
              scale: { duration: 0.2, ease: 'easeOut' },
              width: { duration: 0.25, ease: 'easeOut' },
              height: { duration: 0.25, ease: 'easeOut' },
              x: { duration: 0 },
              y: { duration: 0 },
            }}
            className="pointer-events-auto bg-background border shadow-2xl overflow-hidden flex flex-col absolute right-0 top-0 origin-top-right z-50 cursor-default"
            style={{ touchAction: 'none', borderRadius: 12 }}
          >
            {/* 头部 */}
            <PanelHeader
              onClearSession={clearSession}
              onClose={() => setIsOpen(false)}
              onDragStart={(e) => dragControls.start(e)}
              contextUsage={contextUsage}
              isLoading={isLoading}
            />

            {/* 消息列表 - 使用虚拟滚动 */}
            <div className="flex-1 relative bg-muted/10 h-full min-h-0">
              <VirtualMessageList
                ref={virtualListRef}
                messages={messages}
                renderItem={(message, index) => (
                  <div className="px-4 py-2">
                    <ChatMessage
                      message={message}
                      isLoading={isLoading}
                      isLast={index === messages.length - 1 && (!isLoading || message.role === 'ai')}
                    />
                  </div>
                )}
                overscan={overscanCount}
                scrollBehavior={scrollBehavior}
                onScrollToBottom={(atBottom) => {
                  setIsAtBottom(atBottom);
                  setShowScrollButton(!atBottom && messages.length > 5);
                }}
                isLoading={isLoading}
              />
              
              {/* 回到最新按钮 */}
              <ScrollToBottomButton
                isVisible={showScrollButton}
                onClick={() => {
                  scrollToBottomVirtual('smooth');
                }}
                hasNewMessages={isLoading && !isAtBottom}
              />
            </div>

            {/* 图像编辑上下文横幅 */}
            {imageEditContext && (
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-primary/20 text-sm shrink-0">
                <ImageIcon className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate text-primary">
                  编辑: {imageEditContext.nodeName}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 ml-auto shrink-0 hover:bg-primary/20"
                  onClick={clearImageEditContext}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* 输入区域（包含Agent选择器和发送按钮） */}
            <MessageInput
              onSend={handleSend}
              isLoading={isLoading}
              agentName={agentName}
              availableAgents={availableAgents}
              isLoadingAgents={isLoadingAgents}
              onSwitchAgent={switchAgent}
            />

            {/* 调整大小手柄 - 四边和四角 */}
            {/* 左边 */}
            <div
              className="absolute left-0 top-4 bottom-4 w-1 cursor-ew-resize hover:bg-primary/50 transition-colors z-50"
              onPointerDown={(e) => handleResizeStart(e, 'left')}
            />
            {/* 右边 */}
            <div
              className="absolute right-0 top-4 bottom-4 w-1 cursor-ew-resize hover:bg-primary/50 transition-colors z-50"
              onPointerDown={(e) => handleResizeStart(e, 'right')}
            />
            {/* 顶部 */}
            <div
              className="absolute top-0 left-4 right-4 h-1 cursor-ns-resize hover:bg-primary/50 transition-colors z-50"
              onPointerDown={(e) => handleResizeStart(e, 'top')}
            />
            {/* 底部 */}
            <div
              className="absolute bottom-0 left-4 right-4 h-1 cursor-ns-resize hover:bg-primary/50 transition-colors z-50"
              onPointerDown={(e) => handleResizeStart(e, 'bottom')}
            />
            {/* 左上角 */}
            <div
              className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize hover:bg-primary/50 transition-colors z-50 rounded-br-lg"
              onPointerDown={(e) => handleResizeStart(e, 'corner-nw')}
            />
            {/* 右上角 */}
            <div
              className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize hover:bg-primary/50 transition-colors z-50 rounded-bl-lg"
              onPointerDown={(e) => handleResizeStart(e, 'corner-ne')}
            />
            {/* 左下角 */}
            <div
              className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize hover:bg-primary/50 transition-colors z-50 rounded-tr-lg"
              onPointerDown={(e) => handleResizeStart(e, 'corner-sw')}
            />
            {/* 右下角 */}
            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize hover:bg-primary/50 transition-colors z-50 rounded-tl-lg"
              onPointerDown={(e) => handleResizeStart(e, 'corner-se')}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 重新登录弹窗 */}
      <Dialog open={showReloginDialog} onOpenChange={setShowReloginDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>登录已过期</DialogTitle>
            <DialogDescription>
              您的登录状态已过期，请重新登录以继续使用AI助手功能。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowReloginDialog(false)}
            >
              取消
            </Button>
            <Button
              onClick={() => {
                setShowReloginDialog(false);
                logout();
              }}
            >
              重新登录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
