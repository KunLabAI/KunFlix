'use client';

import { useCallback, useRef } from 'react';
import { useAIAssistantStore, type Message, type AgentStep } from '@/store/useAIAssistantStore';
import { useCanvasStore } from '@/store/useCanvasStore';
import type { MultiAgentData } from '@/components/canvas/MultiAgentSteps';

interface SSEEvent {
  event: string;
  data: unknown;
}

interface StreamingState {
  skillCalls: { skill_name: string; status: 'loading' | 'loaded' }[];
  toolCalls: { tool_name: string; arguments?: Record<string, unknown>; status: 'executing' | 'completed' }[];
  steps: AgentStep[];
  stepMap: Map<string, AgentStep>;
  multiAgent: MultiAgentData | null;
  assistantMsg: Message | null;
  roundHasTools: boolean;
}

export function useSSEHandler() {
  const setMessages = useAIAssistantStore((state) => state.setMessages);
  const setIsLoading = useAIAssistantStore((state) => state.setIsOpen);
  
  // SSE事件处理状态引用
  const streamingStateRef = useRef<StreamingState>({
    skillCalls: [],
    toolCalls: [],
    steps: [],
    stepMap: new Map(),
    multiAgent: null,
    assistantMsg: null,
    roundHasTools: false,
  });

  const resetStreamingState = useCallback(() => {
    streamingStateRef.current = {
      skillCalls: [],
      toolCalls: [],
      steps: [],
      stepMap: new Map(),
      multiAgent: null,
      assistantMsg: null,
      roundHasTools: false,
    };
  }, []);

  const parseSSELine = useCallback((line: string): SSEEvent | null => {
    const eventMatch = line.match(/^event:\s*(.+)$/);
    const dataMatch = line.match(/^data:\s*(.+)$/);

    return eventMatch
      ? { event: eventMatch[1], data: null }
      : dataMatch
      ? { event: '', data: JSON.parse(dataMatch[1]) }
      : null;
  }, []);

  const handleSSEEvent = useCallback((eventType: string, data: unknown) => {
    const state = streamingStateRef.current;

    const handlers: Record<string, () => void> = {
      // 单智能体：流式文本
      text: () => {
        const chunk = (data as { chunk?: string })?.chunk || '';
        const isNewRound = state.roundHasTools;
        isNewRound && (state.toolCalls = [], state.skillCalls = [], state.roundHasTools = false);

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          const isStreaming = last?.role === 'ai' && last?.status === 'streaming';

          // 同一轮次：追加到当前流式消息
          if (isStreaming && !isNewRound) {
            const updated = { ...last, content: last.content + chunk };
            state.assistantMsg = updated;
            return [...prev.slice(0, -1), updated];
          }

          // 新轮次或首条消息：创建新气泡
          const base = (isStreaming && isNewRound)
            ? [...prev.slice(0, -1), { ...last, status: 'complete' as const }]
            : prev;

          const newMsg: Message = {
            role: 'ai',
            content: chunk,
            status: 'streaming',
            skill_calls: [...state.skillCalls],
            tool_calls: [...state.toolCalls],
          };
          state.assistantMsg = newMsg;
          return [...base, newMsg];
        });
      },

      // 技能调用开始
      skill_call: () => {
        const skillName = (data as { skill_name?: string })?.skill_name || '';
        state.skillCalls.push({ skill_name: skillName, status: 'loading' });
        state.roundHasTools = true;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'ai' && last?.status === 'streaming') {
            return [...prev.slice(0, -1), { ...last, skill_calls: [...state.skillCalls] }];
          }
          return prev;
        });
      },

      // 技能加载完成
      skill_loaded: () => {
        const skillName = (data as { skill_name?: string })?.skill_name || '';
        const skill = state.skillCalls.find((s) => s.skill_name === skillName && s.status === 'loading');
        skill && (skill.status = 'loaded');
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'ai' && last?.status === 'streaming') {
            return [...prev.slice(0, -1), { ...last, skill_calls: [...state.skillCalls] }];
          }
          return prev;
        });
      },

      // 工具调用开始
      tool_call: () => {
        const toolName = (data as { tool_name?: string })?.tool_name || '';
        const args = (data as { arguments?: Record<string, unknown> })?.arguments;
        state.toolCalls.push({ tool_name: toolName, arguments: args, status: 'executing' });
        state.roundHasTools = true;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'ai' && last?.status === 'streaming') {
            return [...prev.slice(0, -1), { ...last, tool_calls: [...state.toolCalls] }];
          }
          return prev;
        });
      },

      // 工具执行完成
      tool_result: () => {
        const toolName = (data as { tool_name?: string })?.tool_name || '';
        const tool = state.toolCalls.find((t) => t.tool_name === toolName && t.status === 'executing');
        tool && (tool.status = 'completed');
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'ai' && last?.status === 'streaming') {
            return [...prev.slice(0, -1), { ...last, tool_calls: [...state.toolCalls] }];
          }
          return prev;
        });
      },

      // 多智能体：子任务创建
      subtask_created: () => {
        const d = data as { subtask_id?: string; agent?: string; description?: string };
        state.multiAgent = state.multiAgent || {
          steps: state.steps,
          finalResult: '',
          totalTokens: { input: 0, output: 0 },
          creditCost: 0,
        };
        const step: AgentStep = {
          subtask_id: d.subtask_id || '',
          agent_name: d.agent || '',
          description: d.description || '',
          status: 'pending',
        };
        state.stepMap.set(d.subtask_id || '', step);
        state.steps.push(step);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          const baseContent = last?.role === 'ai' ? last.content : `正在协作... (${state.steps.length} 个智能体)`;
          const newMsg: Message = {
            role: 'ai',
            content: baseContent,
            status: 'streaming',
            multi_agent: { ...state.multiAgent!, steps: [...state.steps] },
          };
          state.assistantMsg = newMsg;
          return last?.role === 'ai' ? [...prev.slice(0, -1), newMsg] : [...prev, newMsg];
        });
      },

      // 多智能体：子任务开始
      subtask_started: () => {
        const d = data as { subtask_id?: string; agent_name?: string };
        const step = state.stepMap.get(d.subtask_id || '');
        step && ((step.status = 'running'), (step.agent_name = d.agent_name || step.agent_name));
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'ai') {
            return [...prev.slice(0, -1), { ...last, multi_agent: { ...state.multiAgent!, steps: [...state.steps] } }];
          }
          return prev;
        });
      },

      // 多智能体：子任务完成
      subtask_completed: () => {
        const d = data as {
          subtask_id?: string;
          result?: string;
          agent_name?: string;
          description?: string;
          tokens?: { input: number; output: number };
        };
        const step = state.stepMap.get(d.subtask_id || '');
        if (step) {
          step.status = 'completed';
          step.result = d.result;
          step.agent_name = d.agent_name || step.agent_name;
          step.description = d.description || step.description;
          step.tokens = d.tokens;
        }
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'ai') {
            return [...prev.slice(0, -1), { ...last, multi_agent: { ...state.multiAgent!, steps: [...state.steps] } }];
          }
          return prev;
        });
      },

      // 多智能体：子任务失败
      subtask_failed: () => {
        const d = data as { subtask_id?: string; error?: string };
        const step = state.stepMap.get(d.subtask_id || '');
        step && ((step.status = 'failed'), (step.error = d.error));
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'ai') {
            return [...prev.slice(0, -1), { ...last, multi_agent: { ...state.multiAgent!, steps: [...state.steps] } }];
          }
          return prev;
        });
      },

      // 多智能体：任务完成
      task_completed: () => {
        const d = data as {
          result?: string;
          total_input_tokens?: number;
          total_output_tokens?: number;
          total_credit_cost?: number;
        };
        if (state.multiAgent) {
          state.multiAgent.finalResult = d.result || '';
          state.multiAgent.totalTokens = { input: d.total_input_tokens || 0, output: d.total_output_tokens || 0 };
          state.multiAgent.creditCost = d.total_credit_cost || 0;
        }
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'ai') {
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                content: d.result || last.content,
                multi_agent: state.multiAgent ? { ...state.multiAgent } : undefined,
              },
            ];
          }
          return prev;
        });
      },

      // 画布更新
      canvas_updated: () => {
        const { theater_id } = data as { theater_id: string };
        const store = useCanvasStore.getState();
        if (store.theaterId === theater_id) {
          store.syncTheater(theater_id);
        }
      },

      // 完成
      done: () => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return last?.status === 'streaming' ? [...prev.slice(0, -1), { ...last, status: 'complete' }] : prev;
        });
        resetStreamingState();
      },

      // 错误
      error: () => {
        const msg = (data as { message?: string })?.message || 'Unknown error';
        setMessages((prev) => [...prev, { role: 'ai', content: `错误: ${msg}`, status: 'complete' }]);
        resetStreamingState();
      },
    };

    handlers[eventType]?.();
  }, [setMessages, resetStreamingState]);

  return {
    parseSSELine,
    handleSSEEvent,
    resetStreamingState,
  };
}
