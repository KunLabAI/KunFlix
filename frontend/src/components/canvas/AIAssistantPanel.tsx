import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { Bot, X, Send, Sparkles, Loader2, Trash2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCanvasStore } from '@/store/useCanvasStore';
import { useAIAssistantStore, type AgentInfo } from '@/store/useAIAssistantStore';
import api from '@/lib/api';

export function AIAssistantPanel() {
  // 使用全局store替代本地状态，避免画布刷新时丢失状态
  const isOpen = useAIAssistantStore((state) => state.isOpen);
  const messages = useAIAssistantStore((state) => state.messages);
  const sessionId = useAIAssistantStore((state) => state.sessionId);
  const agentId = useAIAssistantStore((state) => state.agentId);
  const agentName = useAIAssistantStore((state) => state.agentName);
  const availableAgents = useAIAssistantStore((state) => state.availableAgents);
  const panelSize = useAIAssistantStore((state) => state.panelSize);
  const panelPosition = useAIAssistantStore((state) => state.panelPosition);
  const currentTheaterId = useAIAssistantStore((state) => state.currentTheaterId);
  
  const setIsOpen = useAIAssistantStore((state) => state.setIsOpen);
  const setMessages = useAIAssistantStore((state) => state.setMessages);
  const addMessage = useAIAssistantStore((state) => state.addMessage);
  const updateLastMessage = useAIAssistantStore((state) => state.updateLastMessage);
  const setSessionId = useAIAssistantStore((state) => state.setSessionId);
  const setAgentId = useAIAssistantStore((state) => state.setAgentId);
  const setAgentName = useAIAssistantStore((state) => state.setAgentName);
  const setCurrentAgent = useAIAssistantStore((state) => state.setCurrentAgent);
  const setAvailableAgents = useAIAssistantStore((state) => state.setAvailableAgents);
  const clearSession = useAIAssistantStore((state) => state.clearSession);
  const setPanelSize = useAIAssistantStore((state) => state.setPanelSize);
  const setPanelPosition = useAIAssistantStore((state) => state.setPanelPosition);
  const switchTheater = useAIAssistantStore((state) => state.switchTheater);
  
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  
  const theaterId = useCanvasStore((state) => state.theaterId);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  
  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Load available agents on mount
  useEffect(() => {
    const loadAgents = async () => {
      setIsLoadingAgents(true);
      try {
        const agentsRes = await api.get('/agents');
        const agents: AgentInfo[] = agentsRes.data || [];
        setAvailableAgents(agents);
      } catch (err) {
        console.error('Failed to load agents:', err);
      } finally {
        setIsLoadingAgents(false);
      }
    };
    loadAgents();
  }, []);

  // Switch theater when canvas theaterId changes
  useEffect(() => {
    const handleTheaterChange = async () => {
      // Only switch if theaterId actually changed to a different theater
      const currentStoreTheaterId = useAIAssistantStore.getState().currentTheaterId;
      const isSameTheater = theaterId === currentStoreTheaterId;
      
      // Skip if same theater (e.g., canvas refresh from canvas_updated event)
      if (isSameTheater) return;
      
      // Switch to new theater session
      switchTheater(theaterId);
      
      // If no session for this theater, create one
      if (theaterId && !sessionId) {
        await createSessionForTheater(theaterId);
      }
    };
    handleTheaterChange();
  }, [theaterId]);

  // Initialize session when panel opens
  useEffect(() => {
    const initSession = async () => {
      if (!isOpen) return;
      
      // If no session exists for current theater, create one
      const needsSession = !sessionId || !agentId;
      needsSession && theaterId && await createSessionForTheater(theaterId);
    };
    initSession();
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  const createSessionForTheater = async (theaterId: string): Promise<{ sessionId: string; agentId: string; agentName: string } | null> => {
    try {
      // Try to find existing session for this theater
      const sessionsRes = await api.get(`/chats?theater_id=${theaterId}&limit=1`);
      const existingSessions = sessionsRes.data || [];
      
      if (existingSessions.length > 0) {
        // Use existing session
        const session = existingSessions[0];
        // Fetch agent details
        const agentRes = await api.get(`/agents/${session.agent_id}`);
        const agent = agentRes.data;
        
        setSessionId(session.id);
        setAgentId(session.agent_id);
        setAgentName(agent?.name || 'AI 助手');
        
        // Load messages
        const messagesRes = await api.get(`/chats/${session.id}/messages`);
        const historyMessages = messagesRes.data.map((m: { role: string; content: string }) => ({
          role: m.role === 'assistant' ? 'ai' : m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          status: 'complete' as const,
        }));
        setMessages(historyMessages.length > 0 ? historyMessages : [...DEFAULT_MESSAGES]);
        
        return { sessionId: session.id, agentId: session.agent_id, agentName: agent?.name || 'AI 助手' };
      }
      
      // No existing session, create new one
      // Fetch first available agent with canvas tools
      const agentsRes = await api.get('/agents');
      const agents = agentsRes.data || [];
      const canvasAgent = agents.find((a: { target_node_types?: string[] }) => a.target_node_types?.length);
      const selectedAgent = canvasAgent || agents[0];
      
      const noAgent = !selectedAgent;
      noAgent && console.warn('No agents available');
      if (noAgent) return null;

      // Create chat session with theater_id
      const res = await api.post('/chats', { 
        agent_id: selectedAgent.id, 
        title: `画布对话 - ${new Date().toLocaleDateString()}`,
        theater_id: theaterId
      });
      const newSessionId = res.data.id as string;

      setAgentId(selectedAgent.id);
      setAgentName(selectedAgent.name || 'AI 助手');
      setSessionId(newSessionId);
      setMessages([...DEFAULT_MESSAGES]);

      return { sessionId: newSessionId, agentId: selectedAgent.id, agentName: selectedAgent.name || 'AI 助手' };
    } catch (err) {
      console.error('Failed to initialize AI assistant:', err);
      return null;
    }
  };

  const switchAgent = async (newAgent: AgentInfo) => {
    if (!theaterId) return;
    
    // Create new session with selected agent
    try {
      const res = await api.post('/chats', { 
        agent_id: newAgent.id, 
        title: `画布对话 - ${newAgent.name}`,
        theater_id: theaterId
      });
      const newSessionId = res.data.id as string;

      setCurrentAgent(newAgent.id, newAgent.name || 'AI 助手');
      setSessionId(newSessionId);
      setMessages([...DEFAULT_MESSAGES]);
    } catch (err) {
      console.error('Failed to switch agent:', err);
    }
  };

  const DEFAULT_MESSAGES = [
    { role: 'ai' as const, content: '你好！我是你的专属创作 AI 助手，有什么可以帮你的吗？', status: 'complete' as const }
  ];

  const parseSSELine = (line: string): { event: string; data: unknown } | null => {
    const eventMatch = line.match(/^event:\s*(.+)$/);
    const dataMatch = line.match(/^data:\s*(.+)$/);
    
    return eventMatch ? { event: eventMatch[1], data: null } 
         : dataMatch ? { event: '', data: JSON.parse(dataMatch[1]) } 
         : null;
  };

  const handleSSEEvent = useCallback((eventType: string, data: unknown) => {
    const handlers: Record<string, () => void> = {
      text: () => {
        const chunk = (data as { chunk?: string })?.chunk || '';
        setMessages(prev => {
          const last = prev[prev.length - 1];
          const isStreaming = last?.role === 'ai' && last?.status === 'streaming';
          return isStreaming
            ? [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
            : [...prev, { role: 'ai', content: chunk, status: 'streaming' }];
        });
      },
      canvas_updated: () => {
        const { theater_id } = data as { theater_id: string };
        const store = useCanvasStore.getState();
        // Sync canvas if this theater is currently active
        if (store.theaterId === theater_id) {
          // Use syncTheater to avoid resetting canvas viewport and breaking reference equality
          store.syncTheater(theater_id);
        }
      },
      done: () => {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          return last?.status === 'streaming'
            ? [...prev.slice(0, -1), { ...last, status: 'complete' }]
            : prev;
        });
        setIsLoading(false);
      },
      error: () => {
        const msg = (data as { message?: string })?.message || 'Unknown error';
        setMessages(prev => [...prev, { role: 'ai', content: `错误: ${msg}`, status: 'complete' }]);
        setIsLoading(false);
      },
    };
    handlers[eventType]?.();
  }, []);

  const handleSend = async () => {
    const content = inputValue.trim();
    // Early return if empty
    const isEmpty = !content;
    isEmpty && setInputValue('');
    if (isEmpty) return;
    
    // Ensure session exists
    let currentSessionId = sessionId;
    let currentAgentId = agentId;

    const needsSession = !currentSessionId || !currentAgentId;
    if (needsSession) {
      const noTheater = !theaterId;
      if (noTheater) return;
      const created = await createSessionForTheater(theaterId);
      const failed = !created;
      if (failed) return;
      currentSessionId = created.sessionId;
      currentAgentId = created.agentId;
    }

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content, status: 'complete' }]);
    setInputValue('');
    setIsLoading(true);

    // Abort previous request
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`/api/chats/${currentSessionId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ role: 'user', content, theater_id: theaterId }),
        signal: abortControllerRef.current.signal,
      });

      !response.ok && (() => { throw new Error(`HTTP ${response.status}`); })();

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
            if (parsed.event) currentEvent = parsed.event;
            if (parsed.data !== null && currentEvent) {
              handleSSEEvent(currentEvent, parsed.data);
            }
          }
        }
      }
    } catch (err) {
      const isAbort = (err as Error).name === 'AbortError';
      isAbort || setMessages(prev => [...prev, { role: 'ai', content: `请求失败: ${(err as Error).message}`, status: 'complete' }]);
      setIsLoading(false);
    }
  };

  // Resize Handlers
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
      
      let newWidth = startWidth;
      let newHeight = startHeight;

      if (direction === 'left' || direction === 'corner') {
        // Dragging left handle to the left (negative delta) increases width
        newWidth = Math.max(300, startWidth - deltaX);
      }
      
      if (direction === 'bottom' || direction === 'corner') {
        // Dragging bottom handle down (positive delta) increases height
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
      {/* Drag boundary container (covers the screen but allows pointer events through) */}
      <div className="fixed inset-0 pointer-events-none z-40" ref={constraintsRef} />

      <AnimatePresence initial={false} mode="wait">
        {!isOpen ? (
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
          <motion.div
            key="ai-panel"
            drag
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={constraintsRef}
            dragMomentum={false}
            dragElastic={0}
            onDragEnd={(_, info) => {
              // Save panel position after drag
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
              // Disable transition for x/y to prevent drag lag
              x: { duration: 0 },
              y: { duration: 0 }
            }}
            className="pointer-events-auto bg-background border shadow-2xl overflow-hidden flex flex-col absolute right-0 top-0 origin-top-right z-50 cursor-default"
            style={{ touchAction: 'none' }}
          >
            {/* Header (Draggable Handle) */}
            <div 
              className="flex items-center justify-between p-3 border-b bg-secondary/30 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="flex items-center gap-2 pointer-events-none">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="font-medium text-sm">AI 创作助手</span>
                  {/* Agent selector */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground pointer-events-auto"
                        disabled={isLoadingAgents}
                      >
                        {agentName}
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      {availableAgents.map((agent) => (
                        <DropdownMenuItem
                          key={agent.id}
                          onClick={() => switchAgent(agent)}
                          className="text-xs cursor-pointer"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{agent.name}</span>
                            {agent.target_node_types && agent.target_node_types.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                支持: {agent.target_node_types.join(', ')}
                              </span>
                            )}
                          </div>
                        </DropdownMenuItem>
                      ))}
                      {availableAgents.length === 0 && (
                        <div className="p-2 text-xs text-muted-foreground text-center">
                          暂无可用智能体
                        </div>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearSession();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title="清空对话"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive z-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/10">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-secondary text-secondary-foreground rounded-tl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t bg-background">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="输入你的想法..."
                  className="flex-1"
                  autoFocus
                />
                <Button type="submit" size="icon" disabled={!inputValue.trim() || isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </div>

            {/* Resize Handles */}
            {/* Left Edge */}
            <div 
              className="absolute left-0 top-0 bottom-4 w-1 cursor-ew-resize hover:bg-primary/50 transition-colors z-50"
              onPointerDown={(e) => handleResizeStart(e, 'left')}
            />
            {/* Bottom Edge */}
            <div 
              className="absolute bottom-0 left-4 right-0 h-1 cursor-ns-resize hover:bg-primary/50 transition-colors z-50"
              onPointerDown={(e) => handleResizeStart(e, 'bottom')}
            />
            {/* Bottom-Left Corner */}
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
