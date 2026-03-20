
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ReactFlow, 
  Background, 
  MiniMap, 
  ReactFlowProvider, 
  useReactFlow, 
  Panel,
  ConnectionMode,
  BackgroundVariant,
  NodeTypes,
  FinalConnectionState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';

import { useCanvasStore, CanvasNode } from '@/store/useCanvasStore';
import { Sidebar } from '@/components/canvas/Sidebar';
import { ZoomControls } from '@/components/canvas/ZoomControls';
import ScriptNode from '@/components/canvas/ScriptNode';
import CharacterNode from '@/components/canvas/CharacterNode';
import StoryboardNode from '@/components/canvas/StoryboardNode';
import { CustomEdge } from '@/components/canvas/CustomEdge';
import { AIAssistantPanel } from '@/components/canvas/AIAssistantPanel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Save, Undo, Redo, ArrowLeft, ScrollText, User, Clapperboard } from 'lucide-react';

const nodeTypes = {
  script: ScriptNode,
  character: CharacterNode,
  storyboard: StoryboardNode,
} as unknown as NodeTypes;

const edgeTypes = {
  custom: CustomEdge,
};

const defaultEdgeOptions = {
  type: 'custom', // Use custom edge
  animated: true,
  style: { stroke: '#6366F1', strokeWidth: 2 },
};

function InfiniteCanvas() {
  const router = useRouter();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [showMap, setShowMap] = useState(false);
  
  // State for node selection menu when dropping edge on empty canvas
  const [menuState, setMenuState] = useState<{
    show: boolean;
    x: number;
    y: number;
    sourceNodeId: string | null;
    sourceHandleId: string | null;
  }>({
    show: false,
    x: 0,
    y: 0,
    sourceNodeId: null,
    sourceHandleId: null,
  });

  // Store selectors
  const { 
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    addNode,
    undo, redo, takeSnapshot,
    reset
  } = useCanvasStore();

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      // If the connection is valid, it will be handled by onConnect
      if (connectionState.isValid) return;

      // Ensure we have a valid starting point
      if (!connectionState.fromNode) return;

      // Ensure we drop on the canvas and not on another node
      const target = event.target as Element;
      const isPane = target.classList.contains('react-flow__pane') || 
                     target.classList.contains('react-flow__background') || 
                     !!target.closest('.react-flow__pane') ||
                     !!target.closest('.react-flow__background');
                     
      if (!isPane) return;

      // Extract client coordinates based on event type
      let clientX: number | undefined;
      let clientY: number | undefined;
      
      if ('clientX' in event) {
        clientX = event.clientX;
        clientY = event.clientY;
      } else if (event.changedTouches && event.changedTouches.length > 0) {
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
      }

      if (clientX !== undefined && clientY !== undefined) {
        // Prevent click-outside from closing it immediately
        setTimeout(() => {
          setMenuState({
            show: true,
            x: clientX as number,
            y: clientY as number,
            sourceNodeId: connectionState.fromNode?.id || null,
            sourceHandleId: connectionState.fromHandle?.id || null,
          });
        }, 50);
      }
    },
    []
  );

  const handleAddNodeFromMenu = (type: string) => {
    if (!menuState.sourceNodeId) return;

    // Determine the position
    // screenToFlowPosition works reliably for clientX/clientY
    const position = screenToFlowPosition({
      x: menuState.x,
      y: menuState.y,
    });

    const newNodeId = uuidv4();
    let data: Record<string, any> = {};
    
    switch (type) {
      case 'script':
        data = { title: '新剧本', description: '', tags: [] };
        break;
      case 'character':
        data = { name: '新角色', description: '' };
        break;
      case 'storyboard':
        data = { shotNumber: '001', description: '', duration: 5 };
        break;
    }

    const newNode = {
      id: newNodeId,
      type,
      position,
      data,
    } as CanvasNode;

    addNode(newNode);

    // Connect the new node based on where the line came from
    // If the line came from a left handle (sourceHandleId ending with 'left-source'), we connect to the right target of the new node.
    // If the line came from a right handle (sourceHandleId ending with 'right-source'), we connect to the left target of the new node.
    let targetHandle = null;
    let sourceHandle = menuState.sourceHandleId;
    let connectionSource = menuState.sourceNodeId;
    let connectionTarget = newNodeId;

    if (menuState.sourceHandleId === 'left-source') {
      targetHandle = 'right-target';
      // In React Flow, if we dragged from a left source, it means this new node should be placed BEFORE the current node.
      // However, usually we drag from source -> target. If they dragged from left-source, it's still source -> target.
      // But typically left side is input (target), right side is output (source).
      // Let's connect them visually correctly.
    } else if (menuState.sourceHandleId === 'right-source') {
      targetHandle = 'left-target';
    } else if (menuState.sourceHandleId === 'left-target') {
      // If they dragged from a target handle backwards, the new node is the source!
      connectionSource = newNodeId;
      connectionTarget = menuState.sourceNodeId;
      sourceHandle = 'right-source';
      targetHandle = 'left-target';
    } else if (menuState.sourceHandleId === 'right-target') {
      connectionSource = newNodeId;
      connectionTarget = menuState.sourceNodeId;
      sourceHandle = 'left-source';
      targetHandle = 'right-target';
    }

    onConnect({
      source: connectionSource,
      sourceHandle: sourceHandle,
      target: connectionTarget,
      targetHandle: targetHandle,
    });

    setMenuState((prev) => ({ ...prev, show: false }));
  };

  // Close menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Don't close if we're clicking inside the menu
      const target = e.target as Element;
      if (target.closest('.quick-add-menu')) return;
      
      if (menuState.show) {
        setMenuState((prev) => ({ ...prev, show: false }));
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [menuState.show]);

  // Initialize: Reset to initial state on entry
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Save: Ctrl + S
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        console.log('Saving...');
        // Saving is handled by zustand persist automatically, but we can trigger a manual save notification here
        takeSnapshot(); // Ensure current state is in history
      }
      
      // Undo: Ctrl + Z
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault();
        undo();
      }
      
      // Redo: Ctrl + Y or Ctrl + Shift + Z
      if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.shiftKey && event.key === 'z'))) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, takeSnapshot]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const dataStr = event.dataTransfer.getData('application/reactflow-data');
      
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: CanvasNode = {
        id: uuidv4(),
        type,
        position,
        data: dataStr ? JSON.parse(dataStr) : { label: `${type} node` },
      };

      addNode(newNode);
    },
    [screenToFlowPosition, addNode]
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex-1 h-full relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={20}
          onDragOver={onDragOver}
          onDrop={onDrop}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView={nodes.length < 2} // Fit view only initially or if few nodes
          fitViewOptions={{ maxZoom: 1 }}
          minZoom={0.25}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
          snapToGrid={false}
        >
          <Background gap={20} color="#333" variant={BackgroundVariant.Dots} className="opacity-20" />
          
          {showMap && (
            <MiniMap 
              nodeColor={(n) => {
                if (n.type === 'script') return '#6366F1';
                if (n.type === 'character') return '#10B981';
                return '#F59E0B';
              }} 
              className="bg-card border border-border/50 rounded-lg shadow-lg !left-4 !bottom-16 !right-auto !top-auto"
              position="bottom-left"
            />
          )}
          
          <Panel position="bottom-left" className="m-4 z-50">
            <ZoomControls showMap={showMap} onToggleMap={() => setShowMap(!showMap)} />
          </Panel>
          
          <Panel position="top-left" className="m-4 z-50">
            <div className="flex items-center bg-card border border-border/50 shadow-sm rounded-lg p-1 gap-1 pointer-events-auto">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => router.push('/')} title="返回">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-px h-4 bg-border/50 mx-1" />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={undo} title="撤销 (Ctrl+Z)">
                <Undo className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={redo} title="重做 (Ctrl+Y)">
                <Redo className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={takeSnapshot} title="保存 (Ctrl+S)">
                <Save className="w-4 h-4" />
              </Button>
            </div>
          </Panel>

          <Panel position="top-right" className="flex gap-2 items-center pointer-events-none">
             <AIAssistantPanel />
          </Panel>
        </ReactFlow>

        {menuState.show && (
          <Card 
            className="quick-add-menu fixed z-[100] p-2 shadow-xl border-border/50 flex flex-col gap-1 w-48 bg-card"
            style={{ 
              left: menuState.x, 
              top: menuState.y,
              transform: 'translate(-50%, 10px)' // Center horizontally relative to cursor, slight offset below
            }}
          >
            <div className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">
              创建连接的节点
            </div>
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('script')}>
              <ScrollText className="w-4 h-4 mr-2 text-indigo-500" />
              剧本节点
            </Button>
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('character')}>
              <User className="w-4 h-4 mr-2 text-emerald-500" />
              角色节点
            </Button>
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('storyboard')}>
              <Clapperboard className="w-4 h-4 mr-2 text-amber-500" />
              分镜节点
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function TheaterCreationPage() {
  return (
    <ReactFlowProvider>
      <InfiniteCanvas />
    </ReactFlowProvider>
  );
}
