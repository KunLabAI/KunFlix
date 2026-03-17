
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
    undo, redo, takeSnapshot
  } = useCanvasStore();

  // Initialize with Script Node if empty
  useEffect(() => {
    if (nodes.length === 0) {
      addNode({
        id: 'script-root', 
        type: 'script',
        position: { x: 100, y: 100 },
        data: { title: '我的剧本', description: '开始编写你的故事...', tags: [] },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, addNode]);

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
          minZoom={0.1}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          snapToGrid={true}
          snapGrid={[20, 20]}
        >
          <Background gap={20} color="#333" variant={BackgroundVariant.Dots} className="opacity-20" />
          <Controls />
          <MiniMap 
            nodeColor={(n) => {
              if (n.type === 'script') return '#6366F1';
              if (n.type === 'character') return '#10B981';
              return '#F59E0B';
            }} 
            className="bg-card border rounded-lg shadow-lg"
          />
          
          <Panel position="top-left" className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')} title="返回">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Panel>
          
          <Panel position="top-right" className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={undo} title="撤销 (Ctrl+Z)">
              <Undo className="w-4 h-4 mr-1" /> 撤销
            </Button>
            <Button variant="secondary" size="sm" onClick={redo} title="重做 (Ctrl+Y)">
              <Redo className="w-4 h-4 mr-1" /> 重做
            </Button>
            <Button variant="default" size="sm" onClick={takeSnapshot} title="保存 (Ctrl+S)">
              <Save className="w-4 h-4 mr-1" /> 保存
            </Button>
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
