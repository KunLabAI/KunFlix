import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type MessageRole = 'user' | 'ai';
export type MessageStatus = 'streaming' | 'complete';

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

export interface Message {
  role: MessageRole;
  content: string;
  status?: MessageStatus;
  // 扩展字段用于技能/工具/多智能体展示
  skill_calls?: SkillCall[];
  tool_calls?: ToolCall[];
  multi_agent?: MultiAgentData;
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
}

// 图像编辑上下文（从画布节点触发 AI 编辑）
export interface ImageEditContext {
  nodeId: string;
  imageUrl: string;
  nodeName: string;
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
}

const DEFAULT_MESSAGES: Message[] = [
  { role: 'ai', content: '你好！我是你的专属创作 AI 助手，有什么可以帮你的吗？', status: 'complete' }
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
          });
        } else {
          set({
            currentTheaterId: theaterId,
            sessionId: null,
            agentId: null,
            agentName: 'AI 助手',
            messages: [...DEFAULT_MESSAGES],
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
        messages: [...DEFAULT_MESSAGES] 
      }),
      
      // 清空消息但保留会话（用于清空对话功能）
      clearMessagesKeepSession: () => set({ 
        messages: [...DEFAULT_MESSAGES] 
      }),

      // Agents
      setAvailableAgents: (availableAgents: AgentInfo[]) => set({ availableAgents }),

      // Panel size
      setPanelSize: (panelSize: { width: number; height: number }) => set({ panelSize }),
      resetPanelSize: () => set({ panelSize: { ...DEFAULT_PANEL_SIZE } }),
      
      // Panel position
      setPanelPosition: (panelPosition: { x: number; y: number }) => set({ panelPosition }),
      resetPanelPosition: () => set({ panelPosition: { ...DEFAULT_PANEL_POSITION } }),

      // Image edit context
      setImageEditContext: (imageEditContext: ImageEditContext | null) => set({ imageEditContext }),
      clearImageEditContext: () => set({ imageEditContext: null }),
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
      }),
    }
  )
);
