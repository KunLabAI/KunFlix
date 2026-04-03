import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type MessageRole = 'user' | 'ai';
export type MessageStatus = 'streaming' | 'complete';
export type ScrollBehavior = 'instant' | 'smooth';

// 技能调用
export interface SkillCall {
  skill_name: string;
  status: 'loading' | 'loaded';
}

// 工具调用
export interface ToolCall {
  tool_name: string;
  arguments?: Record<string, unknown>;
  status: 'executing' | 'completed';
}

// 智能体步骤（多智能体协作）
export interface AgentStep {
  subtask_id: string;
  agent_name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  tokens?: { input: number; output: number };
}

// 多智能体数据
export interface MultiAgentData {
  steps: AgentStep[];
  finalResult: string;
  totalTokens: { input: number; output: number };
  creditCost: number;
}

// 多模态内容
export type MessageContent = string | Array<{type: string; text?: string; image_url?: {url: string}}>;

// 视频任务数据
export interface VideoTaskData {
  task_id: string;
  video_mode: string;
  model: string;
}

export interface Message {
  role: MessageRole;
  content: string;
  status?: MessageStatus;
  // 扩展字段用于技能/工具/多智能体/视频任务展示
  skill_calls?: SkillCall[];
  tool_calls?: ToolCall[];
  multi_agent?: MultiAgentData;
  video_tasks?: VideoTaskData[];
  // 欢迎消息标记
  isWelcome?: boolean;
}

export interface AgentInfo {
  id: string;
  name: string;
  description?: string;
  target_node_types?: string[];
}

// 每个画布的会话信息
interface TheaterSession {
  sessionId: string | null;
  agentId: string | null;
  agentName: string;
  messages: Message[];
  contextUsage: ContextUsage | null;
}

// 图像编辑上下文（从画布节点触发 AI 编辑）
export interface ImageEditContext {
  nodeId: string;
  imageUrl: string;
  nodeName: string;
}

// 拖拽附件节点数据（从画布拖拽到 AI 面板）
export interface NodeAttachment {
  nodeId: string;
  nodeType: string;       // 'text' | 'image' | 'video' | 'storyboard'
  label: string;          // 显示标题
  excerpt: string;        // 文本摘要或描述
  thumbnailUrl: string | null;  // 图片/视频缩略图URL
  meta: Record<string, unknown>; // 额外元数据
}

// 上下文使用统计
export interface ContextUsage {
  usedTokens: number;
  contextWindow: number;
}

interface AIAssistantState {
  // Panel visibility
  isOpen: boolean;
  
  // Current theater
  currentTheaterId: string | null;
  
  // Messages for current theater
  messages: Message[];
  
  // Session
  sessionId: string | null;
  agentId: string | null;
  agentName: string;
  
  // Available agents for switching
  availableAgents: AgentInfo[];
  
  // Theater sessions cache: theaterId -> TheaterSession
  theaterSessions: Record<string, TheaterSession>;
  
  // Panel size and position
  panelSize: { width: number; height: number };
  panelPosition: { x: number; y: number };
  
  // Image edit context (from canvas node AI edit)
  imageEditContext: ImageEditContext | null;
  
  // Node attachments (from canvas drag to AI panel) - 支持多图（最多5个）
  nodeAttachments: NodeAttachment[];
  // 保持向后兼容的单图 API（实际使用 nodeAttachments[0]）
  nodeAttachment: NodeAttachment | null;
  
  // Drag-over visual feedback
  isDragOverPanel: boolean;
  
  // Context usage stats
  contextUsage: ContextUsage | null;
  
  // Virtual scroll settings
  scrollBehavior: ScrollBehavior;
  overscanCount: number;
  
  // Actions
  setIsOpen: (isOpen: boolean) => void;
  toggleOpen: () => void;
  
  // Theater management
  switchTheater: (theaterId: string | null) => void;
  
  // Messages
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string, status?: MessageStatus) => void;
  clearMessages: () => void;
  
  // Session
  setSessionId: (sessionId: string | null) => void;
  setAgentId: (agentId: string | null) => void;
  setAgentName: (name: string) => void;
  setCurrentAgent: (agentId: string, agentName: string) => void;
  clearSession: () => void;
  clearMessagesKeepSession: () => void;
  
  // Agents
  setAvailableAgents: (agents: AgentInfo[]) => void;
  
  // Panel size
  setPanelSize: (size: { width: number; height: number }) => void;
  resetPanelSize: () => void;
  
  setPanelPosition: (position: { x: number; y: number }) => void;
  resetPanelPosition: () => void;
  
  // Image edit context
  setImageEditContext: (ctx: ImageEditContext | null) => void;
  clearImageEditContext: () => void;
  
  // Node attachments (多图支持，最多5个)
  setNodeAttachments: (attachments: NodeAttachment[]) => void;
  addNodeAttachment: (attachment: NodeAttachment) => void;
  removeNodeAttachment: (nodeId: string) => void;
  clearNodeAttachments: () => void;
  // 保持向后兼容的单图 API
  setNodeAttachment: (attachment: NodeAttachment | null) => void;
  clearNodeAttachment: () => void;
  
  // Drag-over state
  setIsDragOverPanel: (isDragging: boolean) => void;
  
  // Context usage
  setContextUsage: (usage: ContextUsage | null) => void;
  
  // Virtual scroll settings
  setScrollBehavior: (behavior: ScrollBehavior) => void;
  setOverscanCount: (count: number) => void;
}

const DEFAULT_MESSAGES: Message[] = [
  { role: 'ai', content: '', status: 'complete', isWelcome: true }
];

const DEFAULT_PANEL_SIZE = { width: 320, height: 480 };
const DEFAULT_PANEL_POSITION = { x: 0, y: 0 };

export const useAIAssistantStore = create<AIAssistantState>()(
  persist(
    (set, get) => ({
      // Initial state
      isOpen: false,
      currentTheaterId: null,
      messages: [...DEFAULT_MESSAGES],
      sessionId: null,
      agentId: null,
      agentName: 'AI 助手',
      availableAgents: [],
      theaterSessions: {},
      panelSize: { ...DEFAULT_PANEL_SIZE },
      panelPosition: { ...DEFAULT_PANEL_POSITION },
      imageEditContext: null,
      nodeAttachments: [],
      nodeAttachment: null,
      isDragOverPanel: false,
      contextUsage: null,
      scrollBehavior: 'smooth',
      overscanCount: 5,

      // Panel visibility
      setIsOpen: (isOpen: boolean) => set({ isOpen }),
      toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

      // Theater management - switch to a different theater
      switchTheater: (theaterId: string | null) => {
        const state = get();
        const currentTheaterId = state.currentTheaterId;
        
        // Save current theater session before switching
        if (currentTheaterId) {
          set((state) => ({
            theaterSessions: {
              ...state.theaterSessions,
              [currentTheaterId]: {
                sessionId: state.sessionId,
                agentId: state.agentId,
                agentName: state.agentName,
                messages: state.messages,
                contextUsage: state.contextUsage,
              }
            }
          }));
        }
        
        // Load new theater session or reset
        const savedSession = theaterId ? state.theaterSessions[theaterId] : null;
        if (savedSession) {
          set({
            currentTheaterId: theaterId,
            sessionId: savedSession.sessionId,
            agentId: savedSession.agentId,
            agentName: savedSession.agentName,
            messages: savedSession.messages,
            contextUsage: savedSession.contextUsage,
          });
        } else {
          set({
            currentTheaterId: theaterId,
            sessionId: null,
            agentId: null,
            agentName: 'AI 助手',
            messages: [...DEFAULT_MESSAGES],
            contextUsage: null,
          });
        }
      },

      // Messages
      setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => set((state) => ({
        messages: typeof messages === 'function' ? messages(state.messages) : messages
      })),
      addMessage: (message: Message) => set((state) => ({ 
        messages: [...state.messages, message] 
      })),
      updateLastMessage: (content: string, status?: MessageStatus) => set((state) => {
        const messages = [...state.messages];
        const lastIndex = messages.length - 1;
        if (lastIndex >= 0) {
          messages[lastIndex] = { ...messages[lastIndex], content, status };
        }
        return { messages };
      }),
      clearMessages: () => set({ messages: [...DEFAULT_MESSAGES] }),

      // Session
      setSessionId: (sessionId: string | null) => set({ sessionId }),
      setAgentId: (agentId: string | null) => set({ agentId }),
      setAgentName: (agentName: string) => set({ agentName }),
      setCurrentAgent: (agentId: string, agentName: string) => set({ agentId, agentName }),
      clearSession: () => set({ 
        sessionId: null, 
        agentId: null, 
        agentName: 'AI 助手',
        messages: [...DEFAULT_MESSAGES],
        contextUsage: null,
      }),
      
      // 清空消息但保留会话（用于清空对话功能）
      clearMessagesKeepSession: () => set({ 
        messages: [...DEFAULT_MESSAGES],
        contextUsage: null,
      }),

      // Agents
      setAvailableAgents: (availableAgents: AgentInfo[]) => set({ availableAgents }),

      // Panel size
      setPanelSize: (panelSize: { width: number; height: number }) => set({ panelSize }),
      resetPanelSize: () => set({ panelSize: { ...DEFAULT_PANEL_SIZE } }),
      
      // Panel position
      setPanelPosition: (panelPosition: { x: number; y: number }) => set({ panelPosition }),
      resetPanelPosition: () => set({ panelPosition: { ...DEFAULT_PANEL_POSITION } }),

      // Image edit context (互斥：清除 nodeAttachment)
      setImageEditContext: (imageEditContext: ImageEditContext | null) => set({ imageEditContext, nodeAttachment: null }),
      clearImageEditContext: () => set({ imageEditContext: null }),

      // Node attachments (多图支持，最多5个，互斥：清除 imageEditContext)
      setNodeAttachments: (nodeAttachments: NodeAttachment[]) => set({ nodeAttachments: nodeAttachments.slice(0, 5), imageEditContext: null }),
      addNodeAttachment: (attachment: NodeAttachment) => set((state) => {
        const exists = state.nodeAttachments.some(a => a.nodeId === attachment.nodeId);
        if (exists) return state;
        const newAttachments = [...state.nodeAttachments, attachment].slice(0, 5);
        return { nodeAttachments: newAttachments, imageEditContext: null };
      }),
      removeNodeAttachment: (nodeId: string) => set((state) => ({
        nodeAttachments: state.nodeAttachments.filter(a => a.nodeId !== nodeId)
      })),
      clearNodeAttachments: () => set({ nodeAttachments: [] }),
      // 保持向后兼容的单图 API（映射到 nodeAttachments[0]）
      setNodeAttachment: (nodeAttachment: NodeAttachment | null) => set({ 
        nodeAttachments: nodeAttachment ? [nodeAttachment] : [],
        nodeAttachment, 
        imageEditContext: null 
      }),
      clearNodeAttachment: () => set({ nodeAttachments: [], nodeAttachment: null }),
      
      // Drag-over state
      setIsDragOverPanel: (isDragOverPanel: boolean) => set({ isDragOverPanel }),

      // Context usage
      setContextUsage: (contextUsage: ContextUsage | null) => set({ contextUsage }),
      
      // Virtual scroll settings
      setScrollBehavior: (scrollBehavior: ScrollBehavior) => set({ scrollBehavior }),
      setOverscanCount: (overscanCount: number) => set({ overscanCount }),
    }),
    {
      name: 'ai-assistant-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Persist all theater sessions and current state
        isOpen: state.isOpen,
        currentTheaterId: state.currentTheaterId,
        messages: state.messages,
        sessionId: state.sessionId,
        agentId: state.agentId,
        agentName: state.agentName,
        availableAgents: state.availableAgents,
        theaterSessions: state.theaterSessions,
        panelSize: state.panelSize,
        panelPosition: state.panelPosition,
        scrollBehavior: state.scrollBehavior,
        overscanCount: state.overscanCount,
      }),
    }
  )
);
