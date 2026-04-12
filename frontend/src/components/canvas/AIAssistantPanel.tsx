'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
import { WelcomeMessage } from '@/components/ai-assistant/WelcomeMessage';
import type { NodeAttachment, UploadedFile, PastedContent } from '@/store/useAIAssistantStore';

// 节点类型 → 上下文前缀映射表（拼入消息正文，让 AI 感知节点内容）
const ATTACHMENT_CONTEXT_BUILDERS: Record<string, (a: NodeAttachment) => string> = {
  text: (a) => `[引用文本卡「${a.label}」]\n内容摘要：${a.excerpt || '（空）'}`,
  image: (a) => `[引用图像卡「${a.label}」]\n图像描述：${a.excerpt || '无描述'}`,
  video: (a) => `[引用视频卡「${a.label}」]\n视频描述：${a.excerpt || '无描述'}`,
  storyboard: (a) => `[引用分镜卡「${a.label}」]\n分镜描述：${a.excerpt || '无描述'}`,
};

function buildAttachmentContext(attachments: NodeAttachment[], userMessage: string): string {
  if (!attachments || attachments.length === 0) return userMessage;
  
  // 1. 隐藏元数据（用于前端恢复渲染附件UI）
  const metaBlock = `<!-- __ATTACHMENTS__${JSON.stringify(attachments)} -->`;
  
  // 2. 构建可读上下文（供 AI 理解）
  const readableContexts = attachments.map(a => {
    const builder = ATTACHMENT_CONTEXT_BUILDERS[a.nodeType];
    return builder ? builder(a) : `[引用节点「${a.label}」]`;
  });
  
  return `${metaBlock}\n${readableContexts.join('\n\n')}\n<!-- __MSG_START__ -->\n${userMessage}`;
}

export function AIAssistantPanel() {
  const { t } = useTranslation();

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

  // 节点附件（从画布拖拽）- 支持多图
  const nodeAttachments = useAIAssistantStore((state) => state.nodeAttachments);
  const addNodeAttachment = useAIAssistantStore((state) => state.addNodeAttachment);
  const removeNodeAttachment = useAIAssistantStore((state) => state.removeNodeAttachment);
  const clearNodeAttachments = useAIAssistantStore((state) => state.clearNodeAttachments);
  const isDragOverPanel = useAIAssistantStore((state) => state.isDragOverPanel);

  // 画布节点列表（用于节点选择器）
  const canvasNodes = useCanvasStore((state) => state.nodes);

  // 上下文使用统计
  const contextUsage = useAIAssistantStore((state) => state.contextUsage);

  // 用户上传文件
  const uploadedFiles = useAIAssistantStore((state) => state.uploadedFiles);
  const addUploadedFile = useAIAssistantStore((state) => state.addUploadedFile);
  const updateUploadedFile = useAIAssistantStore((state) => state.updateUploadedFile);
  const removeUploadedFile = useAIAssistantStore((state) => state.removeUploadedFile);
  const clearUploadedFiles = useAIAssistantStore((state) => state.clearUploadedFiles);

  // 粘贴内容
  const pastedContents = useAIAssistantStore((state) => state.pastedContents);
  const addPastedContent = useAIAssistantStore((state) => state.addPastedContent);
  const removePastedContent = useAIAssistantStore((state) => state.removePastedContent);
  const clearPastedContents = useAIAssistantStore((state) => state.clearPastedContents);

  // 会话管理
  const {
    sessionId,
    agentId,
    agentName,
    availableAgents,
    isLoadingAgents,
    theaterChatList,
    isLoadingChatList,
    loadAgents,
    createSessionForTheater,
    createNewChat,
    switchToSession,
    deleteSession,
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
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const theaterId = useCanvasStore((state) => state.theaterId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const { ref: virtualListRef, scrollToBottom: scrollToBottomVirtual } = useVirtualListRef();

  // 约束面板位置到可视区域内
  const constrainToViewport = useCallback((x: number, y: number, width: number, height: number) => {
    const padding = 20; // 边缘安全距离
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 计算允许的范围（确保面板完全可见）
    const minX = padding - viewportWidth + width;
    const maxX = -padding;
    const minY = padding;
    const maxY = viewportHeight - height - padding;
    
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, []);

  // 虚拟滚动配置
  const scrollBehavior = useAIAssistantStore((state) => state.scrollBehavior);
  const overscanCount = useAIAssistantStore((state) => state.overscanCount);

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

  // 错误码 → 翻译键映射表
  const ERROR_KEY_MAP: Record<number, string> = {
    402: 'ai.errorCredits',
    403: 'ai.errorForbidden',
    429: 'ai.errorRateLimit',
  };

  // 中断AI生成
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    resetStreamingState();
    setIsLoading(false);
    // 将最后一条流式消息标记为完成
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      return last?.status === 'streaming'
        ? [...prev.slice(0, -1), { ...last, status: 'complete' }]
        : prev;
    });
  }, [resetStreamingState, setMessages]);

  // 发送消息
  const handleSend = useCallback(
    async (content: string, files: UploadedFile[] = [], pasted: PastedContent[] = []) => {
      // 直接从 store 读取最新值，避免闭包捕获旧值导致重复创建会话
      const latestState = useAIAssistantStore.getState();
      let currentSessionId = latestState.sessionId;
      let currentAgentId = latestState.agentId;

      const needsSession = !currentSessionId || !currentAgentId;
      if (needsSession) {
        !theaterId && console.warn('No theater ID');
        if (!theaterId) return;
        const created = await createSessionForTheater(theaterId);
        if (!created) return;
        currentSessionId = created.sessionId;
        currentAgentId = created.agentId;
      }

      // 构建附件上下文（拼入消息正文，确保 AI 能感知节点内容）
      const attachmentContext = nodeAttachments.length > 0 ? buildAttachmentContext(nodeAttachments, content) : content;
      const firstAttachment = nodeAttachments[0];

      // 取消之前的请求
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      // 添加用户消息 + 空的AI流式消息（触发思考面板显示）
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: attachmentContext, status: 'complete' },
        { role: 'ai', content: '', status: 'streaming' },
      ]);
      setIsLoading(true);

      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || '';
        const response = await authFetch(`${apiBase}/api/chats/${currentSessionId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role: 'user',
            content: attachmentContext,
            theater_id: theaterId,
            ...(imageEditContext && {
              target_node_id: imageEditContext.nodeId,
              edit_image_url: imageEditContext.imageUrl,
            }),
            ...(firstAttachment && {
              target_node_id: firstAttachment.nodeId,
              // 图片/视频节点复用 edit_image_url（后端已支持）
              ...(firstAttachment.thumbnailUrl && { edit_image_url: firstAttachment.thumbnailUrl }),
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
          const errorKey = ERROR_KEY_MAP[response.status];
          throw new Error(errorKey ? t(errorKey) : t('ai.requestFailed', { message: response.status }));
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
          setMessages((prev) => [...prev, { role: 'ai', content: t('ai.requestFailed', { message: (err as Error).message }), status: 'complete' }]);
      } finally {
        setIsLoading(false);
        clearImageEditContext();
        clearNodeAttachments();
        clearUploadedFiles();
        clearPastedContents();
      }
    },
    [theaterId, imageEditContext, nodeAttachments, createSessionForTheater, setMessages, parseSSELine, handleSSEEvent, clearImageEditContext, clearNodeAttachments, clearUploadedFiles, clearPastedContents, t]
  );

  // 调整面板大小
  const handleResizeStart = (e: React.PointerEvent, direction: 'left' | 'right' | 'top' | 'bottom' | 'corner-nw' | 'corner-ne' | 'corner-sw' | 'corner-se') => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setIsSnapping(false);

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = panelSize.width;
    const startHeight = panelSize.height;
    const startPosX = panelPosition.x;
    const startPosY = panelPosition.y;
    const padding = 20;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const isLeftSide = direction === 'left' || direction === 'corner-nw' || direction === 'corner-sw';
    const isRightSide = direction === 'right' || direction === 'corner-ne' || direction === 'corner-se';
    const isTopSide = direction === 'top' || direction === 'corner-nw' || direction === 'corner-ne';
    const isBottomSide = direction === 'bottom' || direction === 'corner-sw' || direction === 'corner-se';

    // 预计算各方向的最大尺寸（基于视口边界）
    // 面板坐标系：right-0 top-0 + transform(x, y)
    // 右边界 = vw + x，左边界 = vw + x - width，上边界 = y，下边界 = y + height
    const maxWidthLeft = vw + startPosX - padding;           // 左侧拖拽：右边界固定，左边界不超过左侧 padding
    const maxWidthRight = startWidth - startPosX - padding;  // 右侧拖拽：左边界固定，右边界不超过右侧 padding
    const maxHeightTop = startPosY + startHeight - padding;  // 顶部拖拽：底边界固定，上边界不超过顶部 padding
    const maxHeightBottom = vh - startPosY - padding;        // 底部拖拽：顶边界固定，下边界不超过底部 padding

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newPosX = startPosX;
      let newPosY = startPosY;

      // 左侧拖拽：保持右边界不变，位置（x）不变
      isLeftSide && (
        newWidth = Math.min(maxWidthLeft, Math.max(300, startWidth - deltaX)),
        newPosX = startPosX
      );
      // 右侧拖拽：保持左边界不变，位置随宽度变化
      isRightSide && (
        newWidth = Math.min(maxWidthRight, Math.max(300, startWidth + deltaX)),
        newPosX = startPosX + (newWidth - startWidth)
      );

      // 顶部拖拽：保持底边界不变，位置上移
      isTopSide && (
        newHeight = Math.min(maxHeightTop, Math.max(400, startHeight - deltaY)),
        newPosY = startPosY + (startHeight - newHeight)
      );
      // 底部拖拽：保持顶边界不变，位置不变
      isBottomSide && (
        newHeight = Math.min(maxHeightBottom, Math.max(400, startHeight + deltaY))
      );

      setPanelSize({ width: newWidth, height: newHeight });
      setPanelPosition({ x: newPosX, y: newPosY });
    };

    const onPointerUp = () => {
      setIsResizing(false);
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
              title={t('ai.openButton')}
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </Button>
          </motion.div>
        ) : (
          // AI面板
          <motion.div
            key="ai-panel"
            drag={!isResizing}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={isResizing ? false : constraintsRef}
            dragMomentum={false}
            dragElastic={0}
            onDragStart={() => {
              // 拖拽开始时禁止文本选择
              document.body.style.userSelect = 'none';
              setIsDragging(true);
              setIsSnapping(false);
            }}
            onDragEnd={(_, info) => {
              // 拖拽结束后恢复文本选择
              document.body.style.userSelect = '';
              setIsDragging(false);
              
              // 计算新位置
              const rawX = panelPosition.x + info.offset.x;
              const rawY = panelPosition.y + info.offset.y;
              
              // 约束到可视区域
              const constrained = constrainToViewport(rawX, rawY, panelSize.width, panelSize.height);
              
              // 检查是否需要吸附动画
              const needsSnap = constrained.x !== rawX || constrained.y !== rawY;
              needsSnap && setIsSnapping(true);
              
              setPanelPosition(constrained);
              
              // 吸附动画完成后重置状态
              needsSnap && setTimeout(() => setIsSnapping(false), 300);
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
              width: { duration: isResizing ? 0 : 0.25, ease: 'easeOut' },
              height: { duration: isResizing ? 0 : 0.25, ease: 'easeOut' },
              x: { duration: isResizing ? 0 : (isSnapping ? 0.3 : 0), ease: [0.32, 0.72, 0, 1] },
              y: { duration: isResizing ? 0 : (isSnapping ? 0.3 : 0), ease: [0.32, 0.72, 0, 1] },
            }}
            className={`pointer-events-auto bg-background border shadow-lg overflow-hidden flex flex-col absolute right-0 top-0 origin-top-right z-50 cursor-default ${isDragOverPanel ? 'ring-2 ring-primary' : ''}`}
            style={{ touchAction: 'none', borderRadius: 12 }}
            data-ai-panel-dropzone
          >
            {/* 头部 */}
            <PanelHeader
              onClose={() => setIsOpen(false)}
              onDragStart={(e) => dragControls.start(e)}
              contextUsage={contextUsage}
              isLoading={isLoading}
              chatList={theaterChatList}
              currentSessionId={sessionId}
              onCreateNewChat={createNewChat}
              onSwitchSession={switchToSession}
              onDeleteSession={deleteSession}
              isLoadingChatList={isLoadingChatList}
            />

            {/* 消息列表 - 使用虚拟滚动 */}
            <div className="flex-1 relative bg-background h-full min-h-0">

              {/* 欢迎状态：仅有欢迎消息时，布局在底部 */}
              {messages.length === 1 && messages[0].isWelcome ? (
                <div className="flex flex-col justify-end h-full px-4 pb-10 overflow-y-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                  <WelcomeMessage onSend={handleSend} />
                </div>
              ) : (
                <>
                  <VirtualMessageList
                    ref={virtualListRef}
                    messages={messages.filter(m => !m.isWelcome)}
                    renderItem={(message, index) => {
                      const realMessages = messages.filter(m => !m.isWelcome);
                      return (
                        <div className="px-4 py-2">
                          <ChatMessage
                            message={message}
                            isLoading={isLoading}
                            isLast={index === realMessages.length - 1 && (!isLoading || message.role === 'ai')}
                          />
                        </div>
                      );
                    }}
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
                </>
              )}
            </div>

            {/* 图像编辑上下文横幅 */}
            {imageEditContext && (
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border-b border-primary/20 text-sm shrink-0">
                <ImageIcon className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate text-primary">
                  {t('ai.editImage', { name: imageEditContext.nodeName })}
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

            {/* 输入区域（包含Agent选择器、附件预览和发送按钮） */}
            <MessageInput
              onSend={handleSend}
              onStop={handleStop}
              isLoading={isLoading}
              isDragOverPanel={isDragOverPanel}
              agentName={agentName}
              availableAgents={availableAgents}
              isLoadingAgents={isLoadingAgents}
              onSwitchAgent={switchAgent}
              nodeAttachments={nodeAttachments}
              onRemoveNodeAttachment={removeNodeAttachment}
              onClearNodeAttachments={clearNodeAttachments}
              canvasNodes={canvasNodes}
              onAddNodeAttachment={addNodeAttachment}
              uploadedFiles={uploadedFiles}
              onAddUploadedFile={addUploadedFile}
              onUpdateUploadedFile={updateUploadedFile}
              onRemoveUploadedFile={removeUploadedFile}
              onClearUploadedFiles={clearUploadedFiles}
              pastedContents={pastedContents}
              onAddPastedContent={addPastedContent}
              onRemovePastedContent={removePastedContent}
              onClearPastedContents={clearPastedContents}
              placeholder={nodeAttachments.length > 0
                ? t('ai.attachPlaceholder', {
                    plural: nodeAttachments.length > 1 ? t('ai.plural_other') : t('ai.plural_one'),
                    count: nodeAttachments.length,
                  })
                : undefined}
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
            <DialogTitle>{t('ai.loginExpired')}</DialogTitle>
            <DialogDescription>
              {t('ai.loginExpiredDesc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowReloginDialog(false)}
            >
              {t('ai.cancel')}
            </Button>
            <Button
              onClick={() => {
                setShowReloginDialog(false);
                logout();
              }}
            >
              {t('ai.relogin')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
