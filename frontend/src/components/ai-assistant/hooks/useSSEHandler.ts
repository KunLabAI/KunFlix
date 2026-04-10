'use client';

import { useCallback, useRef } from 'react';
import { useAIAssistantStore, type Message, type AgentStep, type VideoTaskData, type MusicTaskData, type HarnessEvent } from '@/store/useAIAssistantStore';
import { useCanvasStore } from '@/store/useCanvasStore';
import { useAuth } from '@/context/AuthContext';
import type { MultiAgentData } from '@/components/canvas/MultiAgentSteps';

interface SSEEvent {
  event: string;
  data: unknown;
}

interface StreamingState {
  skillCalls: { skill_name: string; status: 'loading' | 'loaded' }[];
  toolCalls: { tool_name: string; arguments?: Record<string, unknown>; status: 'executing' | 'completed' }[];
  videoTasks: VideoTaskData[];
  musicTasks: MusicTaskData[];
  steps: AgentStep[];
  stepMap: Map<string, AgentStep>;
  multiAgent: MultiAgentData | null;
  assistantMsg: Message | null;
  roundHasTools: boolean;
  doneScheduled: boolean;
  harnessEvents: HarnessEvent[];
}

export function useSSEHandler() {
  const setMessages = useAIAssistantStore((state) => state.setMessages);
  const setIsLoading = useAIAssistantStore((state) => state.setIsOpen);
  const setContextUsage = useAIAssistantStore((state) => state.setContextUsage);
  const { updateCredits } = useAuth();
  
  // SSE事件处理状态引用
  const streamingStateRef = useRef<StreamingState>({
    skillCalls: [],
    toolCalls: [],
    videoTasks: [],
    musicTasks: [],
    steps: [],
    stepMap: new Map(),
    multiAgent: null,
    assistantMsg: null,
    roundHasTools: false,
    doneScheduled: false,
    harnessEvents: [],
  });

  const resetStreamingState = useCallback(() => {
    streamingStateRef.current = {
      skillCalls: [],
      toolCalls: [],
      videoTasks: [],
      musicTasks: [],
      steps: [],
      stepMap: new Map(),
      multiAgent: null,
      assistantMsg: null,
      roundHasTools: false,
      doneScheduled: false,
      harnessEvents: [],
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
      // Leader 任务分析完成（简单任务无需多智能体UI，复杂任务后续由 subtask_created 初始化）
      task_analyzed: () => {
        // No-op: simple tasks flow into text events; complex tasks flow into subtask_created
      },

      // 流式文本（单智能体 + 多智能体简单任务共用）
      text: () => {
        const chunk = (data as { chunk?: string })?.chunk || '';
        const isNewRound = state.roundHasTools;
        isNewRound && (state.toolCalls = [], state.skillCalls = [], state.videoTasks = [], state.musicTasks = [], state.roundHasTools = false);

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

      // 视频任务创建（generate_video 工具执行后由后端发送）
      video_task_created: () => {
        const d = data as { task_id?: string; video_mode?: string; model?: string };
        const task: VideoTaskData = {
          task_id: d.task_id || '',
          video_mode: d.video_mode || '',
          model: d.model || '',
        };
        state.videoTasks.push(task);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return (last?.role === 'ai' && last?.status === 'streaming')
            ? [...prev.slice(0, -1), { ...last, video_tasks: [...state.videoTasks] }]
            : [...prev, { role: 'ai' as const, content: '', status: 'streaming' as const, video_tasks: [...state.videoTasks] }];
        });
      },

      // 音乐任务创建（generate_music 工具执行后由后端发送）
      music_task_created: () => {
        const d = data as { task_id?: string; model?: string };
        const task: MusicTaskData = {
          task_id: d.task_id || '',
          model: d.model || '',
        };
        state.musicTasks.push(task);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return (last?.role === 'ai' && last?.status === 'streaming')
            ? [...prev.slice(0, -1), { ...last, music_tasks: [...state.musicTasks] }]
            : [...prev, { role: 'ai' as const, content: '', status: 'streaming' as const, music_tasks: [...state.musicTasks] }];
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
        const d = data as { subtask_id?: string; error?: string; circuit_breaker?: boolean; retries?: number };
        const step = state.stepMap.get(d.subtask_id || '');
        if (step) {
          step.status = 'failed';
          step.error = d.error;
          step.circuitBreaker = d.circuit_breaker;
          step.retryCount = d.retries;
        }
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'ai') {
            return [...prev.slice(0, -1), { ...last, multi_agent: { ...state.multiAgent!, steps: [...state.steps] } }];
          }
          return prev;
        });
      },

      // Harness: 多智能体子任务重试
      subtask_retry: () => {
        const d = data as { subtask_id?: string; attempt?: number; max_retries?: number };
        const step = state.stepMap.get(d.subtask_id || '');
        if (step) {
          step.status = 'retrying';
          step.retryCount = d.attempt;
          step.maxRetries = d.max_retries;
        }
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'ai') {
            return [...prev.slice(0, -1), { ...last, multi_agent: { ...state.multiAgent!, steps: [...state.steps] } }];
          }
          return prev;
        });
      },

      // Harness: 单智能体 LLM 调用重试
      llm_retry: () => {
        const d = data as { attempt?: number; max_retries?: number; error?: string };
        const evt: HarnessEvent = { type: 'llm_retry', attempt: d.attempt, maxRetries: d.max_retries, error: d.error };
        state.harnessEvents.push(evt);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return (last?.role === 'ai' && last?.status === 'streaming')
            ? [...prev.slice(0, -1), { ...last, harness_events: [...state.harnessEvents] }]
            : prev;
        });
      },

      // Harness: LLM 熔断
      llm_circuit_breaker: () => {
        const d = data as { retries?: number; round?: number };
        const evt: HarnessEvent = { type: 'llm_circuit_breaker', maxRetries: d.retries, round: d.round };
        state.harnessEvents.push(evt);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return (last?.role === 'ai' && last?.status === 'streaming')
            ? [...prev.slice(0, -1), { ...last, harness_events: [...state.harnessEvents] }]
            : prev;
        });
      },

      // Harness: 工具连续失败熔断
      tool_circuit_breaker: () => {
        const d = data as { consecutive_failures?: number; max_allowed?: number };
        const evt: HarnessEvent = { type: 'tool_circuit_breaker', attempt: d.consecutive_failures, maxRetries: d.max_allowed };
        state.harnessEvents.push(evt);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return (last?.role === 'ai' && last?.status === 'streaming')
            ? [...prev.slice(0, -1), { ...last, harness_events: [...state.harnessEvents] }]
            : prev;
        });
      },

      // 多智能体：任务完成（简单任务: multiAgent 为 null; 复杂任务: 更新 multiAgent 数据）
      task_completed: () => {
        const d = data as {
          result?: string;
          total_input_tokens?: number;
          total_output_tokens?: number;
          total_credit_cost?: number;
          billing_status?: string;
          context_usage?: { used_tokens: number; context_window: number };
        };

        // 更新上下文使用统计
        d.context_usage && setContextUsage({
          usedTokens: d.context_usage.used_tokens,
          contextWindow: d.context_usage.context_window,
        });

        // 复杂任务：更新 multiAgent 统计信息
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
        // 积分不足友好提醒（多智能体模式）
        (d.billing_status === 'insufficient') && setMessages((prev) => [
          ...prev,
          { role: 'ai', content: '提示：您的积分余额已不足，本次消耗未能完全扣除。请及时充值以继续使用。', status: 'complete' },
        ]);
      },

      // 计费信息（单智能体模式，在 done 之前收到）
      billing: () => {
        const d = data as {
          credit_cost?: number;
          remaining_credits?: number;
          insufficient?: boolean;
          frozen?: boolean;
          context_usage?: { used_tokens: number; context_window: number };
        };
        // 更新上下文使用统计
        d.context_usage && setContextUsage({
          usedTokens: d.context_usage.used_tokens,
          contextWindow: d.context_usage.context_window,
        });
        // 实时更新用户积分余额
        (d.remaining_credits !== undefined) && updateCredits(d.remaining_credits);
        // 积分不足友好提醒
        d.insufficient && setMessages((prev) => [
          ...prev,
          { role: 'ai', content: '提示：您的积分余额已不足，本次消耗未能扣除。请及时充值以继续使用。', status: 'complete' },
        ]);
        // 账户冻结提醒
        d.frozen && setMessages((prev) => [
          ...prev,
          { role: 'ai', content: '提示：您的账户资金已被冻结，请联系管理员。', status: 'complete' },
        ]);
      },

      // 画布更新
      canvas_updated: () => {
        const { theater_id } = data as { theater_id: string };
        const store = useCanvasStore.getState();
        if (store.theaterId === theater_id) {
          store.syncTheater(theater_id);
        }
      },

      // 上下文压缩完成（旧消息已被摘要替代）
      context_compacted: () => {
        const d = data as { summary?: string };
        d.summary && setMessages((prev) => [
          ...prev,
          {
            role: 'ai' as const,
            content: '',
            status: 'complete' as const,
            compaction_summary: d.summary,
          },
        ]);
      },

      // 完成（延迟执行，打破 React 18 自动批处理：
      //   当 text + done 事件在同一 reader.read() 中到达时，
      //   同步处理会导致 setMessages 被批处理为一次渲染，
      //   使 streaming→complete 状态转换在同一帧内完成，
      //   TypewriterText 永远无法以 streaming 模式挂载，流式动画失效。
      //   setTimeout(0) 将 done 推到下一个宏任务，确保 text 事件先渲染。）
      done: () => {
        // 防止重复调度（SSE done + reader done 可能触发多次）
        if (state.doneScheduled) return;
        state.doneScheduled = true;
        setTimeout(() => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return last?.status === 'streaming' ? [...prev.slice(0, -1), { ...last, status: 'complete' }] : prev;
          });
          resetStreamingState();
        }, 0);
      },

      // 错误
      error: () => {
        const msg = (data as { message?: string })?.message || 'Unknown error';
        setMessages((prev) => [...prev, { role: 'ai', content: `错误: ${msg}`, status: 'complete' }]);
        resetStreamingState();
      },
    };

    handlers[eventType]?.();
  }, [setMessages, resetStreamingState, updateCredits, setContextUsage]);

  return {
    parseSSELine,
    handleSSEEvent,
    resetStreamingState,
  };
}
