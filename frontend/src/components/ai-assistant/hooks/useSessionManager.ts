'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAIAssistantStore, type AgentInfo } from '@/store/useAIAssistantStore';
import { useCanvasStore } from '@/store/useCanvasStore';
import api from '@/lib/api';

const DEFAULT_MESSAGES = [
  { role: 'ai' as const, content: '你好！我是你的专属创作 AI 助手，有什么可以帮你的吗？', status: 'complete' as const },
];

export function useSessionManager() {
  const theaterId = useCanvasStore((state) => state.theaterId);
  
  const sessionId = useAIAssistantStore((state) => state.sessionId);
  const agentId = useAIAssistantStore((state) => state.agentId);
  const agentName = useAIAssistantStore((state) => state.agentName);
  const availableAgents = useAIAssistantStore((state) => state.availableAgents);
  const currentTheaterId = useAIAssistantStore((state) => state.currentTheaterId);
  
  const setSessionId = useAIAssistantStore((state) => state.setSessionId);
  const setAgentId = useAIAssistantStore((state) => state.setAgentId);
  const setAgentName = useAIAssistantStore((state) => state.setAgentName);
  const setCurrentAgent = useAIAssistantStore((state) => state.setCurrentAgent);
  const setAvailableAgents = useAIAssistantStore((state) => state.setAvailableAgents);
  const setMessages = useAIAssistantStore((state) => state.setMessages);
  const setContextUsage = useAIAssistantStore((state) => state.setContextUsage);
  const switchTheater = useAIAssistantStore((state) => state.switchTheater);
  const clearMessagesKeepSession = useAIAssistantStore((state) => state.clearMessagesKeepSession);
  
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  
  // 跟踪是否已恢复过上下文统计
  const restoredSessionRef = useRef<string | null>(null);

  // 加载可用Agent列表
  const loadAgents = useCallback(async () => {
    setIsLoadingAgents(true);
    try {
      const agentsRes = await api.get('/agents/');
      const agents: AgentInfo[] = agentsRes.data || [];
      setAvailableAgents(agents);
      return agents;
    } catch (err) {
      console.error('Failed to load agents:', err);
      return [];
    } finally {
      setIsLoadingAgents(false);
    }
  }, [setAvailableAgents]);

  // 为指定theater创建会话
  const createSessionForTheater = useCallback(
    async (targetTheaterId: string): Promise<{ sessionId: string; agentId: string; agentName: string } | null> => {
      try {
        // 尝试查找现有会话
        const sessionsRes = await api.get(`/chats/?theater_id=${targetTheaterId}&limit=1`);
        const existingSessions = sessionsRes.data || [];
        console.log('[ContextUsage] Sessions API response:', existingSessions);

        if (existingSessions.length > 0) {
          // 使用现有会话
          const session = existingSessions[0];
          console.log('[ContextUsage] Current session:', session);
          const agentRes = await api.get(`/agents/${session.agent_id}/`);
          const agent = agentRes.data;

          setSessionId(session.id);
          setAgentId(session.agent_id);
          setAgentName(agent?.name || 'AI 助手');

          // 恢复上下文使用统计
          const totalTokensUsed = session.total_tokens_used || 0;
          const contextWindow = agent?.context_window || 0;
          console.log('[ContextUsage] Loading from session:', { totalTokensUsed, contextWindow });
          (totalTokensUsed > 0 && contextWindow > 0) && setContextUsage({
            usedTokens: totalTokensUsed,
            contextWindow: contextWindow,
          });

          // 加载消息历史
          const messagesRes = await api.get(`/chats/${session.id}/messages/`);
          const historyMessages = messagesRes.data.map((m: { role: string; content: string }) => ({
            role: m.role === 'assistant' ? 'ai' : m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            status: 'complete' as const,
          }));
          setMessages(historyMessages.length > 0 ? historyMessages : [...DEFAULT_MESSAGES]);

          return { sessionId: session.id, agentId: session.agent_id, agentName: agent?.name || 'AI 助手' };
        }

        // 没有现有会话，创建新会话
        const agents = await loadAgents();
        const canvasAgent = agents.find((a: { target_node_types?: string[] }) => a.target_node_types?.length);
        const selectedAgent = canvasAgent || agents[0];

        if (!selectedAgent) {
          console.warn('No agents available');
          return null;
        }

        // 创建带theater_id的聊天会话
        const res = await api.post('/chats/', {
          agent_id: selectedAgent.id,
          title: `画布对话 - ${new Date().toLocaleDateString()}`,
          theater_id: targetTheaterId,
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
    },
    [loadAgents, setSessionId, setAgentId, setAgentName, setMessages]
  );

  // 切换Agent
  const switchAgent = useCallback(
    async (newAgent: AgentInfo) => {
      if (!theaterId) return;

      try {
        const res = await api.post('/chats/', {
          agent_id: newAgent.id,
          title: `画布对话 - ${newAgent.name}`,
          theater_id: theaterId,
        });
        const newSessionId = res.data.id as string;

        setCurrentAgent(newAgent.id, newAgent.name || 'AI 助手');
        setSessionId(newSessionId);
        setMessages([...DEFAULT_MESSAGES]);
      } catch (err) {
        console.error('Failed to switch agent:', err);
      }
    },
    [theaterId, setCurrentAgent, setSessionId, setMessages]
  );

  // 清空会话
  const clearSession = useCallback(async () => {
    if (!sessionId) {
      clearMessagesKeepSession();
      return;
    }

    try {
      await api.delete(`/chats/${sessionId}/messages/`);
      clearMessagesKeepSession();
      console.log('对话已清空');
    } catch (err) {
      console.error('Failed to clear session:', err);
      clearMessagesKeepSession();
    }
  }, [sessionId, clearMessagesKeepSession]);

  // 从后端恢复上下文使用统计
  const restoreContextUsage = useCallback(async (sid: string) => {
    // 避免重复恢复同一个 session
    if (restoredSessionRef.current === sid) return;
    
    try {
      const sessionRes = await api.get(`/chats/${sid}/`);
      const session = sessionRes.data;
      console.log('[ContextUsage] Restore session:', session);
      
      const totalTokensUsed = session?.total_tokens_used || 0;
      if (totalTokensUsed > 0 && agentId) {
        const agentRes = await api.get(`/agents/${agentId}/`);
        const contextWindow = agentRes.data?.context_window || 0;
        console.log('[ContextUsage] Restoring:', { totalTokensUsed, contextWindow });
        setContextUsage({
          usedTokens: totalTokensUsed,
          contextWindow: contextWindow,
        });
      }
      restoredSessionRef.current = sid;
    } catch (err) {
      console.error('Failed to restore context usage:', err);
    }
  }, [agentId, setContextUsage]);

  // 处理theater切换和页面刷新恢复
  useEffect(() => {
    const handleTheaterChange = async () => {
      const isSameTheater = theaterId === currentTheaterId;

      // 切换到新theater会话
      if (!isSameTheater) {
        switchTheater(theaterId);
        restoredSessionRef.current = null; // 重置恢复状态
      }

      // 如果没有 sessionId，尝试加载或创建会话
      if (theaterId && !sessionId) {
        await createSessionForTheater(theaterId);
      }
      // 如果已有 sessionId 但 contextUsage 为空，尝试从后端恢复
      else if (theaterId && sessionId) {
        await restoreContextUsage(sessionId);
      }
    };
    handleTheaterChange();
  }, [theaterId, currentTheaterId, sessionId, switchTheater, createSessionForTheater, restoreContextUsage]);

  return {
    sessionId,
    agentId,
    agentName,
    availableAgents,
    isLoadingAgents,
    loadAgents,
    createSessionForTheater,
    switchAgent,
    clearSession,
  };
}
