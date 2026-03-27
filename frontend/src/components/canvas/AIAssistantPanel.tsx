'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { Sparkles, X, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/store/useCanvasStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';

// 导入拆分后的组件
import { PanelHeader, MessageInput, ChatMessage, ContextUsageBar } from '@/components/ai-assistant';
import { useSSEHandler, useSessionManager } from '@/components/ai-assistant';

export function AIAssistantPanel() {
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
  const theaterId = useCanvasStore((state) => state.theaterId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  // ESC关闭面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.key === 'Escape' && isOpen && setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // 初始化加载Agent列表
  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

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
        const token = localStorage.getItem('access_token');
        const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
        const response = await fetch(`${apiBase}/api/chats/${currentSessionId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
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

        // 友好处理 HTTP 错误（特别是 402 积分不足）
        const _ERROR_MESSAGES: Record<number, string> = {
          402: '积分余额不足，请充值后继续使用',
          401: '登录已过期，请重新登录',
          403: '无权访问该功能',
          429: '请求过于频繁，请稍后再试',
        };
        !response.ok && (() => {
          throw new Error(_ERROR_MESSAGES[response.status] || `请求失败 (${response.status})`);
        })();

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
        !isAbort &&
          setMessages((prev) => [...prev, { role: 'ai', content: `请求失败: ${(err as Error).message}`, status: 'complete' }]);
      } finally {
        setIsLoading(false);
        clearImageEditContext();
      }
    },
    [sessionId, agentId, theaterId, imageEditContext, createSessionForTheater, setMessages, parseSSELine, handleSSEEvent, clearImageEditContext]
  );

  // 调整面板大小
  const handleResizeStart = (e: React.PointerEvent, direction: 'left' | 'bottom' | 'corner') => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panelSize.width;
    const startHeight = panelSize.height;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const newWidth = (direction === 'left' || direction === 'corner') ? Math.max(300, startWidth - deltaX) : startWidth;
      const newHeight = (direction === 'bottom' || direction === 'corner') ? Math.max(400, startHeight + deltaY) : startHeight;

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
            onDragEnd={(_, info) => {
              setPanelPosition({ x: panelPosition.x + info.offset.x, y: panelPosition.y + info.offset.y });
            }}
            initial={{ opacity: 0, width: 48, height: 48, borderRadius: 24, x: panelPosition.x, y: panelPosition.y }}
            animate={{
              opacity: 1,
              width: panelSize.width,
              height: panelSize.height,
              borderRadius: 12,
              x: panelPosition.x,
              y: panelPosition.y,
            }}
            exit={{ opacity: 0, width: 48, height: 48, borderRadius: 24 }}
            transition={{
              duration: 0.3,
              ease: 'easeInOut',
              x: { duration: 0 },
              y: { duration: 0 },
            }}
            className="pointer-events-auto bg-background border shadow-2xl overflow-hidden flex flex-col absolute right-0 top-0 origin-top-right z-50 cursor-default"
            style={{ touchAction: 'none' }}
          >
            {/* 头部 */}
            <PanelHeader
              agentName={agentName}
              availableAgents={availableAgents}
              isLoadingAgents={isLoadingAgents}
              onSwitchAgent={switchAgent}
              onClearSession={clearSession}
              onClose={() => setIsOpen(false)}
              onDragStart={(e) => dragControls.start(e)}
            />

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/10">
              {messages.map((msg, i) => (
                <ChatMessage key={i} message={msg} isLoading={isLoading} />
              ))}
              <div ref={messagesEndRef} />
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

            {/* 上下文使用统计 */}
            <ContextUsageBar />

            {/* 输入区域 */}
            <MessageInput onSend={handleSend} isLoading={isLoading} />

            {/* 调整大小手柄 */}
            <div
              className="absolute left-0 top-0 bottom-4 w-1 cursor-ew-resize hover:bg-primary/50 transition-colors z-50"
              onPointerDown={(e) => handleResizeStart(e, 'left')}
            />
            <div
              className="absolute bottom-0 left-4 right-0 h-1 cursor-ns-resize hover:bg-primary/50 transition-colors z-50"
              onPointerDown={(e) => handleResizeStart(e, 'bottom')}
            />
            <div
              className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize hover:bg-primary/50 transition-colors z-50 rounded-tr-lg"
              onPointerDown={(e) => handleResizeStart(e, 'corner')}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
