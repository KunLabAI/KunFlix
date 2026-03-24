import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type MessageRole = 'user' | 'ai';
export type MessageStatus = 'streaming' | 'complete';

export interface Message {
  role: MessageRole;
  content: string;
  status?: MessageStatus;
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
  
  // Agents
  setAvailableAgents: (agents: AgentInfo[]) => void;
  
  // Panel size
  setPanelSize: (size: { width: number; height: number }) => void;
  resetPanelSize: () => void;
  
  setPanelPosition: (position: { x: number; y: number }) => void;
  resetPanelPosition: () => void;
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

      // Agents
      setAvailableAgents: (availableAgents: AgentInfo[]) => set({ availableAgents }),

      // Panel size
      setPanelSize: (panelSize: { width: number; height: number }) => set({ panelSize }),
      resetPanelSize: () => set({ panelSize: { ...DEFAULT_PANEL_SIZE } }),
      
      // Panel position
      setPanelPosition: (panelPosition: { x: number; y: number }) => set({ panelPosition }),
      resetPanelPosition: () => set({ panelPosition: { ...DEFAULT_PANEL_POSITION } }),
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
