
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  Viewport,
} from '@xyflow/react';
import { hasCycle } from '@/lib/graphUtils';

// Define Node Data Types
export type ScriptNodeData = {
  title: string;
  description: string;
  tags: string[];
};

export type CharacterNodeData = {
  name: string;
  description: string;
  avatar?: string;
};

export type StoryboardNodeData = {
  shotNumber: string;
  description: string;
  duration: number; // in seconds
};

export type CanvasNode = Node<ScriptNodeData | CharacterNodeData | StoryboardNodeData>;

interface HistoryState {
  nodes: CanvasNode[];
  edges: Edge[];
}

interface CanvasState {
  nodes: CanvasNode[];
  edges: Edge[];
  viewport: Viewport;
  
  // History
  history: HistoryState[];
  historyIndex: number;
  
  // Actions
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (node: CanvasNode) => void;
  updateNodeData: (id: string, data: Partial<ScriptNodeData | CharacterNodeData | StoryboardNodeData>) => void;
  setViewport: (viewport: Viewport) => void;
  
  // Undo/Redo
  undo: () => void;
  redo: () => void;
  takeSnapshot: () => void;
}

const MAX_HISTORY = 50;

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      history: [],
      historyIndex: -1,

      onNodesChange: (changes: NodeChange[]) => {
        const { nodes } = get();
        const nextNodes = applyNodeChanges(changes, nodes) as CanvasNode[];
        set({ nodes: nextNodes });
        
        // Only snapshot on specific changes if needed, or rely on a debounced snapshot
        // For simplicity, we might snapshot on drag end, but applyNodeChanges fires frequently.
        // We'll leave snapshotting for explicit actions or debounced in the component.
      },

      onEdgesChange: (changes: EdgeChange[]) => {
        const { edges } = get();
        const nextEdges = applyEdgeChanges(changes, edges);
        set({ edges: nextEdges });
      },

      onConnect: (connection: Connection) => {
        const { edges, nodes } = get();
        
        // Prevent self-loops
        if (connection.source === connection.target) return;

        // Prevent cycles
        if (hasCycle(edges, connection.source, connection.target)) {
          console.warn('Cycle detected! Connection blocked.');
          return;
        }

        const newEdges = addEdge({ ...connection, type: 'default', animated: true }, edges);
        
        set({ edges: newEdges });
        get().takeSnapshot();
      },

      addNode: (node: CanvasNode) => {
        const { nodes } = get();
        // Prevent duplicate nodes with same ID
        if (nodes.some((n) => n.id === node.id)) {
          return;
        }
        set({ nodes: [...nodes, node] });
        get().takeSnapshot();
      },

      updateNodeData: (id: string, data: any) => {
        set({
          nodes: get().nodes.map((node) => {
            if (node.id === id) {
              return { ...node, data: { ...node.data, ...data } };
            }
            return node;
          }),
        });
        get().takeSnapshot();
      },

      setViewport: (viewport: Viewport) => {
        set({ viewport });
      },

      takeSnapshot: () => {
        const { nodes, edges, history, historyIndex } = get();
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push({ nodes, edges });
        
        if (newHistory.length > MAX_HISTORY) {
          newHistory.shift();
        }

        set({
          history: newHistory,
          historyIndex: newHistory.length - 1,
        });
      },

      undo: () => {
        const { historyIndex, history } = get();
        if (historyIndex > 0) {
          const prevIndex = historyIndex - 1;
          const prevState = history[prevIndex];
          set({
            nodes: prevState.nodes,
            edges: prevState.edges,
            historyIndex: prevIndex,
          });
        }
      },

      redo: () => {
        const { historyIndex, history } = get();
        if (historyIndex < history.length - 1) {
          const nextIndex = historyIndex + 1;
          const nextState = history[nextIndex];
          set({
            nodes: nextState.nodes,
            edges: nextState.edges,
            historyIndex: nextIndex,
          });
        }
      },
    }),
    {
      name: 'infinite-theater-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
      }), // Don't persist history to avoid storage limits or complexities
      merge: (persistedState: any, currentState: CanvasState) => {
        // Merge persisted state with current state
        const merged = { ...currentState, ...(persistedState as Partial<CanvasState>) };
        
        // Deduplicate nodes by ID to fix potential duplicate key issues
        if (merged.nodes && Array.isArray(merged.nodes)) {
          const uniqueNodes = new Map();
          merged.nodes.forEach((node) => {
            // Keep the first occurrence or specific logic (e.g., last update)
            // Here we just ensure ID uniqueness
            if (!uniqueNodes.has(node.id)) {
              uniqueNodes.set(node.id, node);
            }
          });
          merged.nodes = Array.from(uniqueNodes.values());
        }

        return merged;
      },
    }
  )
);
