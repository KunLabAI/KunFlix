
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
import {
  theaterApi,
  type TheaterNodeCreate,
  type TheaterEdgeCreate,
  type TheaterDetailResponse,
} from '@/lib/theaterApi';

// Define Node Data Types
export type ScriptNodeData = {
  title: string;
  description: string;
  content?: unknown; // tiptap JSON content
  tags: string[];
  characters?: string[];
  scenes?: string;
};

export type CharacterNodeData = {
  name: string;
  description: string;
  avatar?: string;
  imageUrl?: string | null;
  uploading?: boolean;
  fitMode?: 'cover' | 'contain';
};

export type StoryboardNodeData = {
  shotNumber: string;
  description: string;
  duration: number; // in seconds
  pivotConfig?: any; // From PivotConfig in types.ts
  pivotData?: any; // Cached or computed data
};

export type VideoNodeData = {
  name: string;
  description: string;
  videoUrl?: string | null;
  uploading?: boolean;
  fitMode?: 'cover' | 'contain';
};

export type CanvasNode = Node<ScriptNodeData | CharacterNodeData | StoryboardNodeData | VideoNodeData>;

interface HistoryState {
  nodes: CanvasNode[];
  edges: Edge[];
}

interface CanvasState {
  nodes: CanvasNode[];
  edges: Edge[];
  viewport: Viewport;

  // Theater sync
  theaterId: string | null;
  theaterTitle: string;
  isSaving: boolean;
  isLoading: boolean;
  lastSavedAt: number | null;
  isDirty: boolean;
  
  // History
  history: HistoryState[];
  historyIndex: number;
  
  // Actions
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (node: CanvasNode) => void;
  deleteNode: (id: string) => void;
  deleteEdge: (id: string) => void;
  reset: () => void;
  updateNodeData: (id: string, data: Partial<ScriptNodeData | CharacterNodeData | StoryboardNodeData | VideoNodeData>) => void;
  setViewport: (viewport: Viewport) => void;
  
  // Undo/Redo
  undo: () => void;
  redo: () => void;
  takeSnapshot: () => void;

  // Backend sync
  setTheaterId: (id: string | null) => void;
  setTheaterTitle: (title: string) => void;
  loadTheater: (theaterId: string) => Promise<void>;
  saveToBackend: () => Promise<void>;
  markDirty: () => void;
}

const MAX_HISTORY = 50;

// --- Mapping helpers: frontend <-> backend ---

function nodeToApi(node: CanvasNode): TheaterNodeCreate {
  return {
    id: node.id,
    node_type: node.type || 'script',
    position_x: node.position.x,
    position_y: node.position.y,
    width: node.width ?? node.measured?.width ?? null,
    height: node.height ?? node.measured?.height ?? null,
    z_index: 0,
    data: node.data as Record<string, unknown>,
  };
}

function apiToNode(n: { id: string; node_type: string; position_x: number; position_y: number; width: number | null; height: number | null; data: Record<string, unknown> }): CanvasNode {
  return {
    id: n.id,
    type: n.node_type,
    position: { x: n.position_x, y: n.position_y },
    ...(n.width != null ? { width: n.width } : {}),
    ...(n.height != null ? { height: n.height } : {}),
    data: n.data as ScriptNodeData | CharacterNodeData | StoryboardNodeData | VideoNodeData,
  };
}

function edgeToApi(edge: Edge): TheaterEdgeCreate {
  return {
    id: edge.id,
    source_node_id: edge.source,
    target_node_id: edge.target,
    source_handle: edge.sourceHandle ?? null,
    target_handle: edge.targetHandle ?? null,
    edge_type: edge.type || 'custom',
    animated: edge.animated ?? true,
    style: (edge.style as Record<string, unknown>) ?? {},
  };
}

function apiToEdge(e: { id: string; source_node_id: string; target_node_id: string; source_handle: string | null; target_handle: string | null; edge_type: string; animated: boolean; style: Record<string, unknown> }): Edge {
  return {
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    sourceHandle: e.source_handle,
    targetHandle: e.target_handle,
    type: e.edge_type,
    animated: e.animated,
    style: e.style,
  };
}

function applyDetail(detail: TheaterDetailResponse) {
  return {
    theaterId: detail.id,
    theaterTitle: detail.title,
    nodes: detail.nodes.map(apiToNode),
    edges: detail.edges.map(apiToEdge),
    viewport: (detail.canvas_viewport as Viewport) || { x: 0, y: 0, zoom: 1 },
    isLoading: false,
    isDirty: false,
    lastSavedAt: Date.now(),
    history: [] as HistoryState[],
    historyIndex: -1,
  };
}

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },

      // Theater sync state
      theaterId: null,
      theaterTitle: '未命名剧场',
      isSaving: false,
      isLoading: false,
      lastSavedAt: null,
      isDirty: false,

      history: [],
      historyIndex: -1,

      onNodesChange: (changes: NodeChange[]) => {
        const { nodes } = get();
        const nextNodes = applyNodeChanges(changes, nodes) as CanvasNode[];
        set({ nodes: nextNodes });
      },

      onEdgesChange: (changes: EdgeChange[]) => {
        const { edges } = get();
        const nextEdges = applyEdgeChanges(changes, edges);
        set({ edges: nextEdges });
      },

      onConnect: (connection: Connection) => {
        const { edges } = get();
        
        // Prevent self-loops
        if (connection.source === connection.target) return;

        // Prevent cycles
        if (hasCycle(edges, connection.source, connection.target)) {
          console.warn('Cycle detected! Connection blocked.');
          return;
        }

        const newEdges = addEdge({ ...connection, type: 'default', animated: true }, edges);
        
        set({ edges: newEdges, isDirty: true });
        get().takeSnapshot();
      },

      addNode: (node: CanvasNode) => {
        const { nodes } = get();
        // Prevent duplicate nodes with same ID
        if (nodes.some((n) => n.id === node.id)) {
          return;
        }
        set({ nodes: [...nodes, node], isDirty: true });
        get().takeSnapshot();
      },

      deleteNode: (id: string) => {
        const { nodes, edges } = get();
        const newNodes = nodes.filter((node) => node.id !== id);
        const newEdges = edges.filter(
          (edge) => edge.source !== id && edge.target !== id
        );
        set({ nodes: newNodes, edges: newEdges, isDirty: true });
        get().takeSnapshot();
      },

      deleteEdge: (id: string) => {
        const { edges } = get();
        const edgeToDelete = edges.find((edge) => edge.id === id);
        const newEdges = edges.filter((edge) => edge.id !== id);
        set({ edges: newEdges, isDirty: true });
        get().takeSnapshot();
        
        if (edgeToDelete) {
          window.dispatchEvent(new CustomEvent('canvas:edge:deleted', { 
            detail: { edge: edgeToDelete, edgeId: id } 
          }));
        }
      },

      reset: () => {
        const initialNode: CanvasNode = {
          id: 'script-root', 
          type: 'script',
          position: { x: 100, y: 100 },
          data: { title: '我的文本卡', description: '', tags: [] },
        };
        set({
          nodes: [initialNode],
          edges: [],
          history: [],
          historyIndex: -1,
          viewport: { x: 0, y: 0, zoom: 1 },
          theaterId: null,
          theaterTitle: '未命名剧场',
          isDirty: false,
          lastSavedAt: null,
        });
      },

      updateNodeData: (id: string, data: Partial<ScriptNodeData | CharacterNodeData | StoryboardNodeData | VideoNodeData>) => {
        set({
          nodes: get().nodes.map((node) =>
            node.id === id ? { ...node, data: { ...node.data, ...data } } : node
          ),
          isDirty: true,
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
            isDirty: true,
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
            isDirty: true,
          });
        }
      },

      // --- Backend sync actions ---

      setTheaterId: (id: string | null) => {
        set({ theaterId: id });
      },

      setTheaterTitle: (title: string) => {
        set({ theaterTitle: title, isDirty: true });
      },

      loadTheater: async (theaterId: string) => {
        set({ isLoading: true });
        try {
          const detail = await theaterApi.getTheater(theaterId);
          set(applyDetail(detail));
        } catch (err) {
          console.error('Failed to load theater:', err);
          set({ isLoading: false });
          throw err;
        }
      },

      saveToBackend: async () => {
        const { theaterId, nodes, edges, viewport, isSaving, theaterTitle } = get();
        if (!theaterId || isSaving) return;

        set({ isSaving: true });
        try {
          // Update title if changed
          await theaterApi.updateTheater(theaterId, { title: theaterTitle });

          const detail = await theaterApi.saveCanvas(theaterId, {
            nodes: nodes.map(nodeToApi),
            edges: edges.map(edgeToApi),
            canvas_viewport: viewport as Record<string, number>,
          });
          set({
            isSaving: false,
            isDirty: false,
            lastSavedAt: Date.now(),
            // Sync node_count etc from server response (but keep local nodes/edges as source of truth)
          });
          // Optionally sync back IDs for new nodes
          void detail;
        } catch (err) {
          console.error('Failed to save to backend:', err);
          set({ isSaving: false });
          throw err;
        }
      },

      markDirty: () => {
        set({ isDirty: true });
      },
    }),
    {
      name: 'infinite-theater-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        viewport: state.viewport,
        theaterId: state.theaterId,
        theaterTitle: state.theaterTitle,
      }),
      merge: (persistedState: unknown, currentState: CanvasState) => {
        const merged = { ...currentState, ...(persistedState as Partial<CanvasState>) };
        
        // Deduplicate nodes by ID
        if (merged.nodes && Array.isArray(merged.nodes)) {
          const uniqueNodes = new Map();
          merged.nodes.forEach((node) => {
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
