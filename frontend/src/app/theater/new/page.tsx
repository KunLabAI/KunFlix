
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap, 
  ReactFlowProvider, 
  useReactFlow, 
  Node, 
  Panel,
  ConnectionMode,
  Edge,
  BackgroundVariant,
  NodeTypes
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';

import { useCanvasStore, CanvasNode } from '@/store/useCanvasStore';
import { Sidebar } from '@/components/canvas/Sidebar';
import ScriptNode from '@/components/canvas/ScriptNode';
import CharacterNode from '@/components/canvas/CharacterNode';
import StoryboardNode from '@/components/canvas/StoryboardNode';
import { AIAssistantPanel } from '@/components/canvas/AIAssistantPanel';
import { Button } from '@/components/ui/button';
import { Save, Undo, Redo, Trash2, MousePointer2, ArrowLeft } from 'lucide-react';

const nodeTypes = {
  script: ScriptNode,
  character: CharacterNode,
  storyboard: StoryboardNode,
} as unknown as NodeTypes;

const defaultEdgeOptions = {
  type: 'default', // Bezier
  animated: true,
  style: { stroke: '#6366F1', strokeWidth: 2 },
};

function InfiniteCanvas() {
  const router = useRouter();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  // Store selectors
  const { 
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    addNode,
    undo, redo, takeSnapshot,
    reset
  } = useCanvasStore();

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
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionMode={ConnectionMode.Loose}
          onDragOver={onDragOver}
          onDrop={onDrop}
          fitView={nodes.length < 2} // Fit view only initially or if few nodes
          fitViewOptions={{ maxZoom: 1 }}
          minZoom={0.1}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          snapToGrid={true}
          snapGrid={[20, 20]}
        >
          <Background gap={20} color="#333" variant={BackgroundVariant.Dots} className="opacity-20" />
          
          <MiniMap 
            nodeColor={(n) => {
              if (n.type === 'script') return '#6366F1';
              if (n.type === 'character') return '#10B981';
              return '#F59E0B';
            }} 
            className="bg-card border rounded-lg shadow-lg !left-4 !bottom-4 !right-auto !top-auto"
            position="bottom-left"
          />
          
          <Controls 
             className="!left-[240px] !bottom-4 !right-auto !top-auto flex-row"
             position="bottom-left"
          />
          
          <Panel position="top-left" className="flex gap-2 items-center p-2">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')} title="返回" className="bg-background/50 hover:bg-background/80 border border-transparent hover:border-border transition-all">
              <ArrowLeft className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </Button>
            <div className="w-px h-4 bg-border/50 mx-1" />
            <Button variant="ghost" size="icon" onClick={undo} title="撤销 (Ctrl+Z)" className="bg-background/50 hover:bg-background/80 border border-transparent hover:border-border transition-all">
              <Undo className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </Button>
            <Button variant="ghost" size="icon" onClick={redo} title="重做 (Ctrl+Y)" className="bg-background/50 hover:bg-background/80 border border-transparent hover:border-border transition-all">
              <Redo className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </Button>
            <Button variant="ghost" size="icon" onClick={takeSnapshot} title="保存 (Ctrl+S)" className="bg-background/50 hover:bg-background/80 border border-transparent hover:border-border transition-all">
              <Save className="w-4 h-4 text-muted-foreground hover:text-foreground" />
            </Button>
          </Panel>

          <Panel position="top-right" className="flex gap-2 items-center pointer-events-none">
             <AIAssistantPanel />
          </Panel>
        </ReactFlow>
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
