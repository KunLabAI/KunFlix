'use client';

import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { 
  ReactFlow, 
  Background, 
  MiniMap, 
  ReactFlowProvider, 
  Panel,
  ConnectionMode,
  BackgroundVariant,
  NodeTypes
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useCanvasStore } from '@/store/useCanvasStore';
import { Sidebar } from '@/components/canvas/Sidebar';
import { ZoomControls } from '@/components/canvas/ZoomControls';
import ScriptNode from '@/components/canvas/ScriptNode';
import CharacterNode from '@/components/canvas/CharacterNode';
import StoryboardNode from '@/components/canvas/StoryboardNode';
import VideoNode from '@/components/canvas/VideoNode';
import { CustomEdge } from '@/components/canvas/CustomEdge';
import { AIAssistantPanel } from '@/components/canvas/AIAssistantPanel';

import { TopBar } from './components/TopBar';
import { QuickAddMenu } from './components/QuickAddMenu';

import { useTheaterLoading } from './hooks/useTheaterLoading';
import { useCanvasShortcuts } from './hooks/useCanvasShortcuts';
import { useCanvasDragDrop } from './hooks/useCanvasDragDrop';
import { useCanvasSnapping } from './hooks/useCanvasSnapping';
import { useAutoLayout } from './hooks/useAutoLayout';
import { useQuickAddMenu } from './hooks/useQuickAddMenu';

const nodeTypes = {
  script: ScriptNode,
  character: CharacterNode,
  storyboard: StoryboardNode,
  video: VideoNode,
} as unknown as NodeTypes;

const edgeTypes = {
  custom: CustomEdge,
};

const defaultEdgeOptions = {
  type: 'custom',
  animated: true,
  style: { stroke: '#6366F1', strokeWidth: 2 },
};

function InfiniteCanvas() {
  const params = useParams();
  const theaterId = params.id as string;
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  const [showMap, setShowMap] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [snapToGuides, setSnapToGuides] = useState(true);

  const { 
    nodes, edges, isLoading,
    onNodesChange, onEdgesChange, onConnect
  } = useCanvasStore();

  // Custom Hooks
  useTheaterLoading(theaterId);
  useCanvasShortcuts();
  
  const { onDragOver, onDrop } = useCanvasDragDrop(snapToGrid);
  const { alignmentLines, onNodeDrag, onNodeDragStop } = useCanvasSnapping(snapToGuides);
  const { isLayouting, handleAutoLayout } = useAutoLayout();
  const { menuState, onConnectEnd, handleAddNodeFromMenu } = useQuickAddMenu();

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground text-sm">正在加载剧场...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
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
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView={nodes.length < 2}
          fitViewOptions={{ maxZoom: 1 }}
          minZoom={0.25}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
          snapToGrid={snapToGrid}
          snapGrid={[20, 20]}
        >
          <Background gap={80} size={1} className="text-muted-foreground dark:text-muted-foreground" variant={BackgroundVariant.Dots} />
          
          {/* Alignment Lines */}
          {alignmentLines.vertical !== null && (
            <div 
              className="absolute top-0 bottom-0 border-l-[1.5px] border-solid border-primary/60 pointer-events-none z-50 transition-opacity duration-150 shadow-[0_0_8px_rgba(var(--primary),0.5)]" 
              style={{ left: alignmentLines.vertical }} 
            />
          )}
          {alignmentLines.horizontal !== null && (
            <div 
              className="absolute left-0 right-0 border-t-[1.5px] border-solid border-primary/60 pointer-events-none z-50 transition-opacity duration-150 shadow-[0_0_8px_rgba(var(--primary),0.5)]" 
              style={{ top: alignmentLines.horizontal }} 
            />
          )}

          {showMap && (
            <MiniMap 
              nodeColor={(n) => {
                const colors: Record<string, string> = {
                  script: '#6366F1',
                  character: '#10B981',
                  video: '#A855F7',
                  storyboard: '#F59E0B',
                };
                return colors[n.type || ''] || '#F59E0B';
              }} 
              className="bg-card border border-border/50 rounded-lg shadow-lg !left-4 !bottom-16 !right-auto !top-auto"
              position="bottom-left"
            />
          )}
          
          <Panel position="bottom-left" className="m-4 z-50">
            <ZoomControls 
              showMap={showMap} 
              onToggleMap={() => setShowMap(!showMap)} 
              onAutoLayout={handleAutoLayout}
              isLayouting={isLayouting}
              snapToGrid={snapToGrid}
              onToggleSnapToGrid={() => setSnapToGrid(!snapToGrid)}
              snapToGuides={snapToGuides}
              onToggleSnapToGuides={() => setSnapToGuides(!snapToGuides)}
            />
          </Panel>
          
          <Panel position="top-left" className="m-4 z-50">
            <TopBar />
          </Panel>

          <Panel position="top-right" className="flex gap-2 items-center pointer-events-none">
             <AIAssistantPanel />
          </Panel>
        </ReactFlow>

        <QuickAddMenu 
          show={menuState.show}
          x={menuState.x}
          y={menuState.y}
          onAdd={handleAddNodeFromMenu}
        />
      </div>
    </div>
  );
}

export default function TheaterEditorPage() {
  return (
    <ReactFlowProvider>
      <InfiniteCanvas />
    </ReactFlowProvider>
  );
}