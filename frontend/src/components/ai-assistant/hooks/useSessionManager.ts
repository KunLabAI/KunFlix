'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAIAssistantStore, type AgentInfo, type ChatSessionInfo } from '@/store/useAIAssistantStore';
import { useCanvasStore } from '@/store/useCanvasStore';
import api from '@/lib/api';

const DEFAULT_MESSAGES = [
  { role: 'ai' as const, content: '', status: 'complete' as const, isWelcome: true },
];

export function useSessionManager() {
  const theaterId = useCanvasStore((state) => state.theaterId);
  
  const sessionId = useAIAssistantStore((state) => state.sessionId);
  const agentId = useAIAssistantStore((state) => state.agentId);
  const agentName = useAIAssistantStore((state) => state.agentName);
  const availableAgents = useAIAssistantStore((state) => state.availableAgents);
  const currentTheaterId = useAIAssistantStore((state) => state.currentTheaterId);
  const theaterChatList = useAIAssistantStore((state) => state.theaterChatList);
  const isLoadingChatList = useAIAssistantStore((state) => state.isLoadingChatList);
  
  const setSessionId = useAIAssistantStore((state) => state.setSessionId);
  const setAgentId = useAIAssistantStore((state) => state.setAgentId);
  const setAgentName = useAIAssistantStore((state) => state.setAgentName);
  const setCurrentAgent = useAIAssistantStore((state) => state.setCurrentAgent);
  const setAvailableAgents = useAIAssistantStore((state) => state.setAvailableAgents);
  const setMessages = useAIAssistantStore((state) => state.setMessages);
  const setContextUsage = useAIAssistantStore((state) => state.setContextUsage);
  const switchTheater = useAIAssistantStore((state) => state.switchTheater);
  const clearMessagesKeepSession = useAIAssistantStore((state) => state.clearMessagesKeepSession);
  const setTheaterChatList = useAIAssistantStore((state) => state.setTheaterChatList);
  const addChatToList = useAIAssistantStore((state) => state.addChatToList);
  const removeChatFromList = useAIAssistantStore((state) => state.removeChatFromList);
  const setIsLoadingChatList = useAIAssistantStore((state) => state.setIsLoadingChatList);
  
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

  // 加载画布的所有会话列表
  const loadTheaterSessions = useCallback(async (targetTheaterId: string) => {
    setIsLoadingChatList(true);
    try {
      const sessionsRes = await api.get(`/chats/?theater_id=${targetTheaterId}&limit=50`);
      const sessions = sessionsRes.data || [];
      const chatList: ChatSessionInfo[] = sessions.map((s: { id: string; title: string; agent_id: string; updated_at: string }) => ({
        id: s.id,
        title: s.title || '未命名对话',
        agentId: s.agent_id,
        agentName: '',
        updatedAt: s.updated_at,
      }));
      setTheaterChatList(chatList);
      return chatList;
    } catch (err) {
      console.error('Failed to load theater sessions:', err);
      return [];
    } finally {
      setIsLoadingChatList(false);
    }
  }, [setTheaterChatList, setIsLoadingChatList]);

  // 加载指定会话的消息和上下文
  const loadSessionData = useCallback(async (sid: string, agentIdOverride?: string) => {
    // 提前标记，防止 useEffect 竞态重复调用 restoreContextUsage
    restoredSessionRef.current = sid;

    try {
      const sessionRes = await api.get(`/chats/${sid}/`);
      const session = sessionRes.data;
      const targetAgentId = agentIdOverride || session.agent_id;
      
      const agentRes = await api.get(`/agents/${targetAgentId}/`);
      const agent = agentRes.data;

      setSessionId(session.id);
      setAgentId(targetAgentId);
      setAgentName(agent?.name || 'AI 助手');

      // 始终重置上下文统计（避免残留旧会话数据）
      const totalTokensUsed = session.total_tokens_used || 0;
      const contextWindow = agent?.context_window || 0;
      setContextUsage(
        (totalTokensUsed > 0 && contextWindow > 0)
          ? { usedTokens: totalTokensUsed, contextWindow }
          : null
      );

      // 加载消息历史
      const messagesRes = await api.get(`/chats/${session.id}/messages/`);
      const historyMessages = messagesRes.data.map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'ai' : m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        status: 'complete' as const,
      }));
      setMessages(historyMessages.length > 0 ? historyMessages : [...DEFAULT_MESSAGES]);

      return { sessionId: session.id, agentId: targetAgentId, agentName: agent?.name || 'AI 助手' };
    } catch (err) {
      console.error('Failed to load session data:', err);
      return null;
    }
  }, [setSessionId, setAgentId, setAgentName, setMessages, setContextUsage]);

  // 为指定theater创建会话（初始化时使用，加载最近一条或创建新的）
  const createSessionForTheater = useCallback(
    async (targetTheaterId: string): Promise<{ sessionId: string; agentId: string; agentName: string } | null> => {
      try {
        // 同时加载会话列表
        const chatList = await loadTheaterSessions(targetTheaterId);

        // 尝试使用最近的会话
        if (chatList.length > 0) {
          const latestChat = chatList[0];
          return await loadSessionData(latestChat.id, latestChat.agentId);
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

        // 将新会话加入列表
        addChatToList({
          id: newSessionId,
          title: res.data.title || `画布对话 - ${new Date().toLocaleDateString()}`,
          agentId: selectedAgent.id,
          agentName: selectedAgent.name || 'AI 助手',
          updatedAt: new Date().toISOString(),
        });

        return { sessionId: newSessionId, agentId: selectedAgent.id, agentName: selectedAgent.name || 'AI 助手' };
      } catch (err) {
        console.error('Failed to initialize AI assistant:', err);
        return null;
      }
    },
    [loadAgents, loadTheaterSessions, loadSessionData, setSessionId, setAgentId, setAgentName, setMessages, addChatToList]
  );

  // 创建全新对话
  const createNewChat = useCallback(async () => {
    if (!theaterId) return null;

    try {
      const agents = availableAgents.length > 0 ? availableAgents : await loadAgents();
      const canvasAgent = agents.find((a: { target_node_types?: string[] }) => a.target_node_types?.length);
      const selectedAgent = canvasAgent || agents[0];

      if (!selectedAgent) {
        console.warn('No agents available');
        return null;
      }

      const res = await api.post('/chats/', {
        agent_id: selectedAgent.id,
        title: `画布对话 - ${new Date().toLocaleDateString()}`,
        theater_id: theaterId,
      });
      const newSessionId = res.data.id as string;

      setAgentId(selectedAgent.id);
      setAgentName(selectedAgent.name || 'AI 助手');
      setSessionId(newSessionId);
      setMessages([...DEFAULT_MESSAGES]);
      setContextUsage(null);

      // 将新会话加入列表头部
      addChatToList({
        id: newSessionId,
        title: res.data.title || `画布对话 - ${new Date().toLocaleDateString()}`,
        agentId: selectedAgent.id,
        agentName: selectedAgent.name || 'AI 助手',
        updatedAt: new Date().toISOString(),
      });

      return { sessionId: newSessionId, agentId: selectedAgent.id, agentName: selectedAgent.name || 'AI 助手' };
    } catch (err) {
      console.error('Failed to create new chat:', err);
      return null;
    }
  }, [theaterId, availableAgents, loadAgents, setSessionId, setAgentId, setAgentName, setMessages, setContextUsage, addChatToList]);

  // 切换到指定会话
  const switchToSession = useCallback(async (targetSessionId: string) => {
    // 已经是当前会话则跳过
    if (targetSessionId === sessionId) return;
    
    await loadSessionData(targetSessionId);
  }, [sessionId, loadSessionData]);

  // 删除指定会话
  const deleteSession = useCallback(async (targetSessionId: string) => {
    try {
      await api.delete(`/chats/${targetSessionId}`);
      removeChatFromList(targetSessionId);

      // 如果删除的是当前会话，切换到列表中的下一个
      const isCurrentSession = targetSessionId === sessionId;
      if (isCurrentSession) {
        const remaining = theaterChatList.filter(c => c.id !== targetSessionId);
        if (remaining.length > 0) {
          await loadSessionData(remaining[0].id, remaining[0].agentId);
        } else {
          // 没有剩余会话，重置状态
          setSessionId(null);
          setAgentId(null);
          setAgentName('AI 助手');
          setMessages([...DEFAULT_MESSAGES]);
          setContextUsage(null);
        }
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }, [sessionId, theaterChatList, removeChatFromList, loadSessionData, setSessionId, setAgentId, setAgentName, setMessages, setContextUsage]);

  // 切换Agent（更新当前会话的 agent，不创建新会话）
  const switchAgent = useCallback(
    async (newAgent: AgentInfo) => {
      const currentSid = sessionId;
      // 没有当前会话时走新建流程
      if (!currentSid) {
        await createNewChat();
        return;
      }

      try {
        // PATCH 更新当前会话的 agent_id
        await api.patch(`/chats/${currentSid}/`, { agent_id: newAgent.id });
        setCurrentAgent(newAgent.id, newAgent.name || 'AI 助手');
      } catch (err) {
        console.error('Failed to switch agent:', err);
      }
    },
    [sessionId, createNewChat, setCurrentAgent]
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
      
      const totalTokensUsed = session?.total_tokens_used || 0;
      if (totalTokensUsed > 0 && agentId) {
        const agentRes = await api.get(`/agents/${agentId}/`);
        const contextWindow = agentRes.data?.context_window || 0;
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
        restoredSessionRef.current = null;
      }

      // 如果没有 sessionId，尝试加载或创建会话
      if (theaterId && !sessionId) {
        await createSessionForTheater(theaterId);
      }
      // 如果已有 sessionId，恢复上下文并确保对话列表已加载
      else if (theaterId && sessionId) {
        // 始终加载对话列表（页面刷新、画布切换均需要）
        loadTheaterSessions(theaterId);
        await restoreContextUsage(sessionId);
      }
    };
    handleTheaterChange();
  }, [theaterId, currentTheaterId, sessionId, switchTheater, createSessionForTheater, restoreContextUsage, loadTheaterSessions]);

  return {
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
  };
}
