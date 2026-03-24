import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type MessageRole = 'user' | 'ai';
export type MessageStatus = 'streaming' | 'complete';

export interface Message {
  role: MessageRole;
  content: string;
  status?: MessageStatus;
}

interface AIAssistantState {
  // Panel visibility
  isOpen: boolean;
  
  // Messages
  messages: Message[];
  
  // Session
  sessionId: string | null;
  agentId: string | null;
  
  // Panel size
  panelSize: { width: number; height: number };
  
  // Actions
  setIsOpen: (isOpen: boolean) => void;
  toggleOpen: () => void;
  
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string, status?: MessageStatus) => void;
  clearMessages: () => void;
  
  setSessionId: (sessionId: string | null) => void;
  setAgentId: (agentId: string | null) => void;
  clearSession: () => void;
  
  setPanelSize: (size: { width: number; height: number }) => void;
  resetPanelSize: () => void;
}

const DEFAULT_MESSAGES: Message[] = [
  { role: 'ai', content: '你好！我是你的专属创作 AI 助手，有什么可以帮你的吗？', status: 'complete' }
];

const DEFAULT_PANEL_SIZE = { width: 320, height: 480 };

export const useAIAssistantStore = create<AIAssistantState>()(
  persist(
    (set, get) => ({
      // Initial state
      isOpen: false,
      messages: [...DEFAULT_MESSAGES],
      sessionId: null,
      agentId: null,
      panelSize: { ...DEFAULT_PANEL_SIZE },

      // Panel visibility
      setIsOpen: (isOpen: boolean) => set({ isOpen }),
      toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

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
      clearSession: () => set({ 
        sessionId: null, 
        agentId: null, 
        messages: [...DEFAULT_MESSAGES] 
      }),

      // Panel size
      setPanelSize: (panelSize: { width: number; height: number }) => set({ panelSize }),
      resetPanelSize: () => set({ panelSize: { ...DEFAULT_PANEL_SIZE } }),
    }),
    {
      name: 'ai-assistant-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist these fields
        isOpen: state.isOpen,
        messages: state.messages,
        sessionId: state.sessionId,
        agentId: state.agentId,
        panelSize: state.panelSize,
      }),
    }
  )
);
