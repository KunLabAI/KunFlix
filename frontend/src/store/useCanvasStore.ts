
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
  content?: unknown; // tiptap JSON content
  tags: string[];
  characters?: string[];
  scenes?: string;
  /** 最后修改时间（ISO 字符串），用于节点选择器排序 */
  updatedAt?: string;
};

export type ImageGenHistoryEntry = {
  url: string;
  prompt?: string;
  model?: string;
  provider_id?: string;
  aspect_ratio?: string;
  quality?: string;
  batch_count?: number;
  output_format?: string;
  createdAt?: string;
};

export type CharacterNodeData = {
  name: string;
  description: string;
  avatar?: string;
  imageUrl?: string | null;       // 保留向后兼容（单图场景）
  images?: string[];              // 多图数组，最多9张
  uploading?: boolean;
  /** 生成的图像历史（面板侧栏用） */
  generatedImages?: ImageGenHistoryEntry[];
  /** 从历史拖出新节点时用于预填 ImageGeneratePanel */
  initialGenConfig?: Partial<ImageGenHistoryEntry>;
  /** 为 true 时 ImageGeneratePanel 始终显示 */
  pinPanel?: boolean;
  /** 最后修改时间（ISO 字符串），用于节点选择器排序 */
  updatedAt?: string;
};

export type StoryboardNodeData = {
  title?: string;
  shotNumber: string;
  description: string;
  duration: number; // in seconds
  pivotConfig?: any; // From PivotConfig in types.ts
  pivotData?: any; // Cached or computed data
  tableData?: Record<string, unknown>[]; // Raw table rows provided by Agent
  tableColumns?: { key: string; label: string; type?: 'text' | 'number' | 'image' | 'video' | 'audio' }[]; // Column definitions from Agent
  _streaming?: boolean; // Transient flag: node is being streamed from LLM deltas
  /** 最后修改时间（ISO 字符串），用于节点选择器排序 */
  updatedAt?: string;
};

export type VideoGenHistoryEntry = {
  url: string;
  quality?: string;
  prompt?: string;
  model?: string;
  provider_id?: string;
  video_mode?: string;
  duration?: number;
  aspect_ratio?: string;
  createdAt?: string;
};

export type VideoNodeData = {
  name: string;
  description: string;
  videoUrl?: string | null;
  uploading?: boolean;
  fitMode?: 'cover' | 'contain';
  generatedVideos?: VideoGenHistoryEntry[];
  /** Pre-fill VideoGeneratePanel when node is created from history drag */
  initialGenConfig?: Partial<VideoGenHistoryEntry>;
  /** When true, keep VideoGeneratePanel always visible regardless of selection */
  pinPanel?: boolean;
  /** 最后修改时间（ISO 字符串），用于节点选择器排序 */
  updatedAt?: string;
};

export type AudioNodeData = {
  name: string;
  description: string;
  audioUrl?: string | null;
  uploading?: boolean;
  lyrics?: string;
  /** 最后修改时间（ISO 字符串），用于节点选择器排序 */
  updatedAt?: string;
};

export type GhostNodeData = {
  targetNodeType: string;  // The node type being created (text/image/video/audio/storyboard)
  label?: string;
};

export type NodeEffect = 'reading' | 'scanning' | 'updating' | 'deleting' | 'connecting';

export type CanvasNode = Node<ScriptNodeData | CharacterNodeData | StoryboardNodeData | VideoNodeData | AudioNodeData | GhostNodeData>;

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
  isSyncing: boolean;
  
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
  updateNodeData: (id: string, data: Partial<ScriptNodeData | CharacterNodeData | StoryboardNodeData | VideoNodeData | AudioNodeData>) => void;
  updateNodeDimensions: (id: string, width: number, height: number) => void;
  setViewport: (viewport: Viewport) => void;
  
  // Undo/Redo
  undo: () => void;
  redo: () => void;
  takeSnapshot: () => void;

  // Backend sync
  setTheaterId: (id: string | null) => void;
  setTheaterTitle: (title: string) => void;
  loadTheater: (theaterId: string) => Promise<void>;
  syncTheater: (theaterId: string) => Promise<void>;
  saveToBackend: () => Promise<void>;
  markDirty: () => void;

  // Settings
  snapToGrid: boolean;
  snapToGuides: boolean;
  setSnapToGrid: (snap: boolean) => void;
  setSnapToGuides: (snap: boolean) => void;

  // Ghost nodes (AI creating animation)
  addGhostNode: (nodeType: string, positionX?: number, positionY?: number) => void;
  removeGhostNodes: () => void;

  // Streaming node: progressive storyboard creation from tool argument deltas
  updateStreamingNode: (partialData: Partial<StoryboardNodeData>) => void;
  replaceGhostWithStreamingNode: (data: Partial<StoryboardNodeData>) => void;
  replaceGhostWithLocalNode: (nodeType: string, data: Record<string, unknown>) => void;
  removeStreamingNodes: () => void;

  // AI operation effects on existing nodes
  activeNodeEffects: Record<string, NodeEffect>;
  setNodeEffect: (nodeId: string, effect: NodeEffect) => void;
  setNodeEffects: (effects: Record<string, NodeEffect>) => void;
  clearNodeEffect: (nodeId: string) => void;
  clearAllNodeEffects: () => void;
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
      isSyncing: false,

      history: [],
      historyIndex: -1,

      // Settings
      snapToGrid: false,
      snapToGuides: true,
      setSnapToGrid: (snap: boolean) => set({ snapToGrid: snap }),
      setSnapToGuides: (snap: boolean) => set({ snapToGuides: snap }),

      onNodesChange: (changes: NodeChange[]) => {
        const { nodes } = get();
        const nextNodes = applyNodeChanges(changes, nodes) as CanvasNode[];
        
        // Flag as dirty for relevant changes (position, dimension, remove)
        const isSignificant = changes.some(
          (c) => c.type === 'position' || c.type === 'dimensions' || c.type === 'remove' || c.type === 'add'
        );

        set({ 
          nodes: nextNodes,
          ...(isSignificant ? { isDirty: true } : {})
        });
      },

      onEdgesChange: (changes: EdgeChange[]) => {
        const { edges } = get();
        const nextEdges = applyEdgeChanges(changes, edges);
        
        const isSignificant = changes.some(
          (c) => c.type === 'remove' || c.type === 'add'
        );

        set({ 
          edges: nextEdges,
          ...(isSignificant ? { isDirty: true } : {})
        });
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

        const newEdges = addEdge({ ...connection, type: 'custom', animated: true }, edges);
        
        set({ edges: newEdges, isDirty: true });
        get().takeSnapshot();
      },

      addNode: (node: CanvasNode) => {
        const { nodes } = get();
        // Prevent duplicate nodes with same ID
        if (nodes.some((n) => n.id === node.id)) {
          return;
        }
        // 自动写入 updatedAt（若未提供）
        const existingUpdatedAt = (node.data as { updatedAt?: string })?.updatedAt;
        const stamped: CanvasNode = existingUpdatedAt
          ? node
          : { ...node, data: { ...node.data, updatedAt: new Date().toISOString() } };
        set({ nodes: [...nodes, stamped], isDirty: true });
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
          id: 'text-root', 
          type: 'text',
          position: { x: 100, y: 100 },
          data: { title: '我的文本卡', tags: [] },
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

      updateNodeData: (id: string, data: Partial<ScriptNodeData | CharacterNodeData | StoryboardNodeData | VideoNodeData | AudioNodeData>) => {
        const now = new Date().toISOString();
        set({
          nodes: get().nodes.map((node) =>
            node.id === id ? { ...node, data: { ...node.data, ...data, updatedAt: now } } : node
          ),
          isDirty: true,
        });
        get().takeSnapshot();
      },

      updateNodeDimensions: (id: string, width: number, height: number) => {
        set({
          nodes: get().nodes.map((node) =>
            node.id === id ? { ...node, width, height } : node
          ),
          isDirty: true,
        });
        // We might not want to take a snapshot for every dimension change
        // get().takeSnapshot();
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

      syncTheater: async (theaterId: string) => {
        set({ isSyncing: true });
        try {
          const detail = await theaterApi.getTheater(theaterId);
          const currentNodes = get().nodes;
          const currentEdges = get().edges;

          const newNodesRaw = detail.nodes.map(apiToNode);
          const newEdgesRaw = detail.edges.map(apiToEdge);

          let nodesChanged = false;
          const mergedNodes = newNodesRaw.map((newNode) => {
            const existingNode = currentNodes.find((n) => n.id === newNode.id);
            if (existingNode) {
              const isSame = 
                existingNode.type === newNode.type &&
                existingNode.position.x === newNode.position.x &&
                existingNode.position.y === newNode.position.y &&
                existingNode.width === newNode.width &&
                existingNode.height === newNode.height &&
                JSON.stringify(existingNode.data) === JSON.stringify(newNode.data);

              if (isSame) {
                return existingNode;
              } else {
                nodesChanged = true;
                return {
                  ...existingNode,
                  ...newNode,
                  data: newNode.data, // overwrite with new data
                  selected: existingNode.selected, // preserve selection
                  dragging: existingNode.dragging, // preserve dragging
                  measured: existingNode.measured,
                };
              }
            }
            nodesChanged = true;
            return newNode;
          });

          if (currentNodes.length !== mergedNodes.length) {
            nodesChanged = true;
          }

          let edgesChanged = false;
          const mergedEdges = newEdgesRaw.map((newEdge) => {
            const existingEdge = currentEdges.find((e) => e.id === newEdge.id);
            if (existingEdge) {
              const isSame = 
                existingEdge.source === newEdge.source &&
                existingEdge.target === newEdge.target &&
                existingEdge.sourceHandle === newEdge.sourceHandle &&
                existingEdge.targetHandle === newEdge.targetHandle &&
                existingEdge.type === newEdge.type;
              
              if (isSame) return existingEdge;
              edgesChanged = true;
              return { ...existingEdge, ...newEdge };
            }
            edgesChanged = true;
            return newEdge;
          });

          if (currentEdges.length !== mergedEdges.length) {
            edgesChanged = true;
          }

          if (nodesChanged || edgesChanged) {
            // Remove ghost, streaming, and local preview nodes when real nodes arrive from backend
            const finalNodes = nodesChanged ? mergedNodes.filter((n) =>
              n.type !== 'ghost'
              && !(n.type === 'storyboard' && (n.data as StoryboardNodeData)._streaming)
              && !n.id.startsWith('local-')
            ) : undefined;
            set({
              ...(nodesChanged ? { nodes: finalNodes! } : {}),
              ...(edgesChanged ? { edges: mergedEdges } : {}),
              // We intentionally do NOT overwrite viewport to preserve user zoom/scroll
            });
          }
        } catch (err) {
          console.error('Failed to sync theater:', err);
        } finally {
          set({ isSyncing: false });
        }
      },

      saveToBackend: async () => {
        const { theaterId, nodes, edges, viewport, isSaving, isSyncing, theaterTitle } = get();
        if (!theaterId || isSaving || isSyncing) return;

        set({ isSaving: true });
        try {
          // Update title if changed
          await theaterApi.updateTheater(theaterId, { title: theaterTitle });

          const detail = await theaterApi.saveCanvas(theaterId, {
            nodes: nodes.filter((n) => n.type !== 'ghost' && !n.id.startsWith('streaming-') && !n.id.startsWith('local-')).map(nodeToApi),
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

      // Ghost node default dimensions by target type
      addGhostNode: (nodeType: string, positionX?: number, positionY?: number) => {
        const GHOST_DIMENSIONS: Record<string, { width: number; height: number }> = {
          text: { width: 400, height: 300 },
          image: { width: 512, height: 384 },
          video: { width: 512, height: 384 },
          audio: { width: 360, height: 200 },
          storyboard: { width: 398, height: 256 },
        };
        const dims = GHOST_DIMENSIONS[nodeType] || { width: 420, height: 300 };

        // Estimate position: replicate backend _calculate_auto_position grid logic
        // when agent doesn't provide explicit coordinates
        let finalX = positionX;
        let finalY = positionY;
        const needsAutoPosition = finalX == null || finalY == null;
        const { nodes } = get();
        const realNodes = nodes.filter((n) => n.type !== 'ghost');

        const GRID_GAP_X = 40;
        const GRID_GAP_Y = 60;
        const GRID_MAX_ROW_WIDTH = 2400;
        const DEF_W = 420;
        const DEF_H = 300;
        const START_X = 100;
        const START_Y = 100;

        let autoX = START_X;
        let autoY = START_Y;
        if (needsAutoPosition && realNodes.length > 0) {
          // Group nodes into rows by Y-band, track rightmost edge per row
          const rowBand = DEF_H + GRID_GAP_Y;
          const occupiedRows = new Map<number, number>();
          realNodes.forEach((n) => {
            const nw = n.width ?? n.measured?.width ?? DEF_W;
            const edge = n.position.x + nw;
            const rowKey = Math.round(n.position.y / rowBand) * rowBand;
            occupiedRows.set(rowKey, Math.max(occupiedRows.get(rowKey) ?? 0, edge));
          });
          // Try to fit in existing row
          let placed = false;
          const sortedRows = [...occupiedRows.keys()].sort((a, b) => a - b);
          for (const rowY of sortedRows) {
            const rowRight = occupiedRows.get(rowY)!;
            const candidateX = rowRight + GRID_GAP_X;
            (candidateX + DEF_W <= GRID_MAX_ROW_WIDTH) && (autoX = candidateX, autoY = Math.max(rowY, START_Y), placed = true);
            placed && (void 0); // break equivalent
            if (placed) break;
          }
          // All rows full → new row below
          !placed && (() => {
            const maxBottom = realNodes.reduce((max, n) => {
              const nh = n.height ?? n.measured?.height ?? DEF_H;
              return Math.max(max, n.position.y + nh);
            }, 0);
            autoX = START_X;
            autoY = maxBottom + GRID_GAP_Y;
          })();
        }
        finalX = finalX ?? autoX;
        finalY = finalY ?? autoY;

        const ghostId = `ghost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const ghostNode: CanvasNode = {
          id: ghostId,
          type: 'ghost',
          position: { x: finalX, y: finalY },
          width: dims.width,
          height: dims.height,
          zIndex: 1000,
          selectable: true,
          draggable: true,
          data: { targetNodeType: nodeType } as GhostNodeData,
        };
        set({ nodes: [...nodes, ghostNode] });

        // Notify canvas to auto-pan viewport to the new ghost node
        typeof window !== 'undefined' && window.dispatchEvent(
          new CustomEvent('ghost-node-added', {
            detail: { x: finalX + dims.width / 2, y: finalY + dims.height / 2 },
          })
        );
      },

      removeGhostNodes: () => {
        const { nodes } = get();
        const filtered = nodes.filter((n) => n.type !== 'ghost');
        (filtered.length !== nodes.length) && set({ nodes: filtered });
      },

      // Replace ghost node with a streaming storyboard node (first delta data arrived)
      replaceGhostWithStreamingNode: (data: Partial<StoryboardNodeData>) => {
        const { nodes } = get();
        const ghostIdx = nodes.findIndex((n) => n.type === 'ghost');
        const ghost = ghostIdx >= 0 ? nodes[ghostIdx] : null;
        // No ghost to replace — create a new streaming node at default position
        const position = ghost ? ghost.position : { x: 100, y: 100 };
        const streamingId = `streaming-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const streamingNode: CanvasNode = {
          id: streamingId,
          type: 'storyboard',
          position,
          width: 420,
          height: 300,
          data: {
            shotNumber: '',
            description: '',
            duration: 0,
            _streaming: true,
            ...data,
          } as StoryboardNodeData,
        };
        // Replace ghost with streaming node, or append if no ghost
        const newNodes = ghost
          ? nodes.map((n) => n.id === ghost.id ? streamingNode : n)
          : [...nodes, streamingNode];
        set({ nodes: newNodes });
      },

      // Update the active streaming node with new partial data (append rows)
      updateStreamingNode: (partialData: Partial<StoryboardNodeData>) => {
        const { nodes } = get();
        const streamIdx = nodes.findIndex((n) => n.type === 'storyboard' && (n.data as StoryboardNodeData)._streaming);
        (streamIdx >= 0) && set({
          nodes: nodes.map((n, i) => i === streamIdx ? {
            ...n,
            data: { ...n.data, ...partialData },
          } : n),
        });
      },

      // Replace ghost/streaming node with a local node using complete tool_call args
      replaceGhostWithLocalNode: (nodeType: string, data: Record<string, unknown>) => {
        const { nodes } = get();
        // Find streaming node first, then ghost
        const targetIdx = nodes.findIndex(
          (n) => (n.type === 'storyboard' && (n.data as StoryboardNodeData)._streaming) || n.type === 'ghost'
        );
        const target = targetIdx >= 0 ? nodes[targetIdx] : null;
        const position = target ? target.position : { x: 100, y: 100 };
        const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const localNode: CanvasNode = {
          id: localId,
          type: nodeType,
          position,
          width: 420,
          height: 300,
          data: data as StoryboardNodeData,
        };
        const newNodes = target
          ? nodes.map((n) => n.id === target.id ? localNode : n)
          : [...nodes, localNode];
        set({ nodes: newNodes });
      },

      // Remove streaming nodes (cleanup)
      removeStreamingNodes: () => {
        const { nodes } = get();
        const filtered = nodes.filter((n) => !(n.type === 'storyboard' && (n.data as StoryboardNodeData)._streaming));
        (filtered.length !== nodes.length) && set({ nodes: filtered });
      },

      // AI operation effects
      activeNodeEffects: {},
      setNodeEffect: (nodeId: string, effect: NodeEffect) => {
        set({ activeNodeEffects: { ...get().activeNodeEffects, [nodeId]: effect } });
      },
      setNodeEffects: (effects: Record<string, NodeEffect>) => {
        set({ activeNodeEffects: { ...get().activeNodeEffects, ...effects } });
      },
      clearNodeEffect: (nodeId: string) => {
        const { [nodeId]: _, ...rest } = get().activeNodeEffects;
        set({ activeNodeEffects: rest });
      },
      clearAllNodeEffects: () => {
        set({ activeNodeEffects: {} });
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

// ─── Helpers ──────────────────────────────────────────────────────────────
/**
 * 按 node.data.updatedAt 倒序排序（最新修改的在前）。
 * 缺失 updatedAt 的节点会排到最后。
 */
export const selectNodesByUpdatedDesc = <T extends CanvasNode>(nodes: T[]): T[] =>
  [...nodes].sort((a, b) => {
    const ta = (a.data as { updatedAt?: string })?.updatedAt ?? '';
    const tb = (b.data as { updatedAt?: string })?.updatedAt ?? '';
    return tb.localeCompare(ta);
  });
