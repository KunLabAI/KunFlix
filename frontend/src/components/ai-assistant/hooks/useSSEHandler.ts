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

/**
 * Attempt to parse partial JSON from a streaming tool argument string.
 * Tries to extract storyboard fields (tableColumns, tableData, title, etc.)
 * by progressively adding closing brackets to make the JSON valid.
 */
function parsePartialStoryboardArgs(jsonStr: string): {
  title?: string;
  description?: string;
  shotNumber?: string;
  duration?: number;
  columns?: { key: string; label: string; type?: 'text' | 'number' | 'image' | 'video' | 'audio' }[];
  rows?: Record<string, unknown>[];
} | null {
  // The accumulated string is the value of the "data" field inside the outer args JSON
  // e.g. {"node_type":"storyboard","data":{"title":"...","tableColumns":[...],"tableData":[...]
  // We try to close the JSON progressively
  const closers = ['', '}', ']}', '"]}', '"]}', '}]}', '"}]}', '"}}', '}}', ']}}', '"]}}',' "]}}'];
  for (const closer of closers) {
    try {
      const obj = JSON.parse(jsonStr + closer);
      // Could be the outer args object {node_type, data: {...}} or just the data object
      const dataObj = obj.data || obj;
      const result: ReturnType<typeof parsePartialStoryboardArgs> = {};
      dataObj.title && (result.title = String(dataObj.title));
      dataObj.description && (result.description = String(dataObj.description));
      dataObj.shotNumber && (result.shotNumber = String(dataObj.shotNumber));
      dataObj.duration && (result.duration = Number(dataObj.duration));
      Array.isArray(dataObj.tableColumns) && (result.columns = dataObj.tableColumns);
      Array.isArray(dataObj.tableData) && (result.rows = dataObj.tableData);
      return result;
    } catch {
      // Try next closer
    }
  }
  return null;
}

interface StreamingState {
  skillCalls: { skill_name: string; status: 'loading' | 'loaded' }[];
  toolCalls: { tool_name: string; arguments?: Record<string, unknown>; status: 'executing' | 'completed'; result?: string }[];
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
  
  // Debounced timer for clearing canvas node effects after tool chain completes
  const effectClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Accumulated tool argument JSON for streaming storyboard creation
  const streamingArgsRef = useRef<{ toolName: string; accumulated: string; lastParseLen: number; replaced: boolean }>({
    toolName: '', accumulated: '', lastParseLen: 0, replaced: false,
  });
  // Throttle timer for partial JSON parsing
  const parseThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Reset streaming args accumulator
    streamingArgsRef.current = { toolName: '', accumulated: '', lastParseLen: 0, replaced: false };
    parseThrottleRef.current && (clearTimeout(parseThrottleRef.current), parseThrottleRef.current = null);
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

      // 工具调用预告（LLM 开始生成工具参数时立即触发，早于 tool_call）
      tool_pending: () => {
        const toolName = (data as { tool_name?: string })?.tool_name || '';
        // Cancel any pending effect clear
        effectClearTimerRef.current && (clearTimeout(effectClearTimerRef.current), effectClearTimerRef.current = null);
        const canvasStore = useCanvasStore.getState();
        const PENDING_MAP: Record<string, () => void> = {
          create_canvas_node: () => {
            // No args yet (arguments still generating) → create ghost with default type
            const hasGhost = canvasStore.nodes.some((n) => n.type === 'ghost');
            !hasGhost && canvasStore.addGhostNode('text');
          },
          list_canvas_nodes: () => {
            const effects: Record<string, 'scanning'> = {};
            canvasStore.nodes.forEach((n) => { n.type !== 'ghost' && (effects[n.id] = 'scanning'); });
            Object.keys(effects).length > 0 && canvasStore.setNodeEffects(effects);
          },
        };
        PENDING_MAP[toolName]?.();
      },

      // 工具调用开始
      tool_call: () => {
        const toolName = (data as { tool_name?: string })?.tool_name || '';
        const args = (data as { arguments?: Record<string, unknown> })?.arguments;
        state.toolCalls.push({ tool_name: toolName, arguments: args, status: 'executing' });
        state.roundHasTools = true;

        // Canvas visual effects: show real-time feedback on affected nodes
        // Cancel any pending clear — a new tool is starting, keep effects alive
        effectClearTimerRef.current && (clearTimeout(effectClearTimerRef.current), effectClearTimerRef.current = null);
        const canvasStore = useCanvasStore.getState();
        const CANVAS_EFFECT_MAP: Record<string, () => void> = {
          create_canvas_node: () => {
            // tool_call has complete args — replace ghost/streaming with real local node immediately
            const nodeType = (args?.node_type as string) || 'text';
            const nodeData = (args?.data as Record<string, unknown>) || {};
            // Clear streaming args state
            streamingArgsRef.current = { toolName: '', accumulated: '', lastParseLen: 0, replaced: true };
            parseThrottleRef.current && (clearTimeout(parseThrottleRef.current), parseThrottleRef.current = null);
            // Replace ghost/streaming node with a fully-formed local node
            canvasStore.replaceGhostWithLocalNode(nodeType, nodeData);
          },
          get_canvas_node: () => args?.node_id && canvasStore.setNodeEffect(args.node_id as string, 'reading'),
          update_canvas_node: () => args?.node_id && canvasStore.setNodeEffect(args.node_id as string, 'updating'),
          delete_canvas_node: () => args?.node_id && canvasStore.setNodeEffect(args.node_id as string, 'deleting'),
          list_canvas_nodes: () => {
            const effects: Record<string, 'scanning'> = {};
            canvasStore.nodes.forEach((n) => { n.type !== 'ghost' && (effects[n.id] = 'scanning'); });
            Object.keys(effects).length > 0 && canvasStore.setNodeEffects(effects);
          },
          create_canvas_edge: () => {
            const effects: Record<string, 'connecting'> = {};
            args?.source_node_id && (effects[args.source_node_id as string] = 'connecting');
            args?.target_node_id && (effects[args.target_node_id as string] = 'connecting');
            Object.keys(effects).length > 0 && canvasStore.setNodeEffects(effects);
          },
        };
        CANVAS_EFFECT_MAP[toolName]?.();

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'ai' && last?.status === 'streaming') {
            return [...prev.slice(0, -1), { ...last, tool_calls: [...state.toolCalls] }];
          }
          return prev;
        });
      },

      // 工具参数增量流式（LLM 逐 token 生成工具参数时触发）
      tool_call_delta: () => {
        const d = data as { tool_name?: string; chunk?: string };
        const toolName = d.tool_name || '';
        const chunk = d.chunk || '';

        const sRef = streamingArgsRef.current;
        // Initialize or continue accumulating
        (sRef.toolName !== toolName) && (sRef.toolName = toolName, sRef.accumulated = '', sRef.lastParseLen = 0, sRef.replaced = false);
        sRef.accumulated += chunk;

        const canvasStore = useCanvasStore.getState();

        // For update/get/delete: extract node_id early to apply targeted effect
        const TARGETED_EFFECTS: Record<string, 'reading' | 'updating' | 'deleting'> = {
          update_canvas_node: 'updating',
          get_canvas_node: 'reading',
          delete_canvas_node: 'deleting',
        };
        const targetEffect = TARGETED_EFFECTS[toolName];
        targetEffect && (() => {
          const nodeIdMatch = sRef.accumulated.match(/"node_id"\s*:\s*"([^"]+)"/);
          nodeIdMatch && canvasStore.setNodeEffect(nodeIdMatch[1], targetEffect);
        })();

        // Streaming storyboard creation: progressive JSON parse
        (toolName !== 'create_canvas_node' || sRef.replaced) && (void 0);

        // Throttled partial JSON parse: attempt when accumulated > lastParse + 200 chars
        const shouldParse = sRef.accumulated.length - sRef.lastParseLen > 200;

        const tryParsePartial = () => {
          const ref = streamingArgsRef.current;
          ref.lastParseLen = ref.accumulated.length;
          const parsed = parsePartialStoryboardArgs(ref.accumulated);
          // Need at least columns to create a meaningful streaming node
          (parsed && parsed.columns && parsed.columns.length > 0) && (() => {
            const hasStreamingNode = canvasStore.nodes.some(
              (n) => n.type === 'storyboard' && (n.data as any)?._streaming
            );
            const partialData = {
              title: parsed.title,
              description: parsed.description || '',
              shotNumber: parsed.shotNumber || '',
              duration: parsed.duration || 0,
              tableColumns: parsed.columns,
              tableData: parsed.rows || [],
              _streaming: true,
            };
            hasStreamingNode
              ? canvasStore.updateStreamingNode(partialData)
              : canvasStore.replaceGhostWithStreamingNode(partialData);
          })();
        };

        // Use throttle for parsing
        (shouldParse && toolName === 'create_canvas_node' && !sRef.replaced) && (() => {
          parseThrottleRef.current && clearTimeout(parseThrottleRef.current);
          parseThrottleRef.current = setTimeout(tryParsePartial, 100);
        })();
      },

      // 工具执行完成
      tool_result: () => {
        const d = data as { tool_name?: string; success?: boolean; result?: string };
        const tool = state.toolCalls.find((t) => t.tool_name === (d.tool_name || '') && t.status === 'executing');
        tool && (tool.status = 'completed', tool.result = d.result);
        // Debounced clear: reset timer so effects persist across rapid tool calls
        effectClearTimerRef.current && clearTimeout(effectClearTimerRef.current);
        effectClearTimerRef.current = setTimeout(() => {
          useCanvasStore.getState().clearAllNodeEffects();
          effectClearTimerRef.current = null;
        }, 1500);
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

      // 多智能体：子任务流式 chunk（实时展示子智能体输出进度）
      subtask_chunk: () => {
        const d = data as { subtask_id?: string; chunk?: string };
        const step = state.stepMap.get(d.subtask_id || '');
        step && (step.result = (step.result || '') + (d.chunk || ''));
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return (last?.role === 'ai')
            ? [...prev.slice(0, -1), { ...last, multi_agent: { ...state.multiAgent!, steps: [...state.steps] } }]
            : prev;
        });
      },

      // 多智能体：子任务工具调用开始
      subtask_tool_call: () => {
        const d = data as { subtask_id?: string; tool_name?: string; arguments?: Record<string, unknown> };
        const step = state.stepMap.get(d.subtask_id || '');
        step && (step.tool_calls = [...(step.tool_calls || []), {
          tool_name: d.tool_name || '', arguments: d.arguments, status: 'executing' as const,
        }]);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return (last?.role === 'ai')
            ? [...prev.slice(0, -1), { ...last, multi_agent: { ...state.multiAgent!, steps: [...state.steps] } }]
            : prev;
        });
      },

      // 多智能体：子任务工具调用完成
      subtask_tool_result: () => {
        const d = data as { subtask_id?: string; tool_name?: string; success?: boolean; result?: string };
        const step = state.stepMap.get(d.subtask_id || '');
        const tool = step?.tool_calls?.find((t) => t.tool_name === d.tool_name && t.status === 'executing');
        tool && (tool.status = 'completed', tool.result = d.result);

        // 画布工具完成时触发前端刷新
        const canvasToolNames = ['create_canvas_node', 'update_canvas_node', 'delete_canvas_node', 'batch_create_nodes', 'edit_image'];
        const _cStore = useCanvasStore.getState();
        (canvasToolNames.includes(d.tool_name || '') && d.success && _cStore.theaterId) && _cStore.syncTheater(_cStore.theaterId);

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return (last?.role === 'ai')
            ? [...prev.slice(0, -1), { ...last, multi_agent: { ...state.multiAgent!, steps: [...state.steps] } }]
            : prev;
        });
      },

      // 多智能体：Leader 审查开始（在所有子任务完成后，Leader 整合结果）
      review_start: () => {
        const d = data as { reviewer?: string };
        // 添加一个虚拟步骤表示审查阶段
        const reviewStep: AgentStep = {
          subtask_id: '__review__',
          agent_name: d.reviewer || 'Leader',
          description: '正在审查整合所有子任务结果...',
          status: 'running',
        };
        state.stepMap.set('__review__', reviewStep);
        state.steps.push(reviewStep);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return (last?.role === 'ai')
            ? [...prev.slice(0, -1), { ...last, multi_agent: { ...state.multiAgent!, steps: [...state.steps] } }]
            : prev;
        });
      },

      // 多智能体：Leader 审查完成
      review_completed: () => {
        const step = state.stepMap.get('__review__');
        step && (step.status = 'completed', step.description = '审查整合完成');
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return (last?.role === 'ai')
            ? [...prev.slice(0, -1), { ...last, multi_agent: { ...state.multiAgent!, steps: [...state.steps] } }]
            : prev;
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
        // Don't clear effects here — let the debounced timer in tool_result handle it
        // so the animation stays visible while the canvas syncs.
        const hasGhostNodes = store.nodes.some((n) => n.type === 'ghost');
        const hasStreamingNodes = store.nodes.some(
          (n) => n.type === 'storyboard' && (n.data as any)?._streaming
        );
        // When ghost/streaming nodes exist, delay sync so animations play.
        // For local nodes (from tool_call immediate creation), sync immediately.
        const hasLocalNodes = store.nodes.some((n) => n.id.startsWith('local-'));
        const syncDelay = hasLocalNodes ? 0 : (hasGhostNodes || hasStreamingNodes) ? 1200 : 0;
        setTimeout(() => {
          const s = useCanvasStore.getState();
          (s.theaterId === theater_id) && s.syncTheater(theater_id);
        }, syncDelay);
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
