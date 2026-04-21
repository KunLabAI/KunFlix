
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useCanvasStore } from '@/store/useCanvasStore';
import { Sidebar } from '@/components/canvas/Sidebar';
import { ZoomControls } from '@/components/canvas/ZoomControls';
import ScriptNode from '@/components/canvas/TextNode';
import CharacterNode from '@/components/canvas/ImageNode';
import StoryboardNode from '@/components/canvas/StoryboardNode';
import VideoNode from '@/components/canvas/VideoNode';
import AudioNode from '@/components/canvas/AudioNode';
import GhostNode from '@/components/canvas/GhostNode';
import { CustomEdge } from '@/components/canvas/CustomEdge';
import { AIAssistantPanel } from '@/components/canvas/AIAssistantPanel';
import { CanvasHints } from '@/components/canvas/CanvasCursor';
import { CanvasHelpButton } from '@/components/canvas/CanvasHelp';
import { CanvasToolbar } from '@/components/canvas/CanvasToolbar';
import { QuickAddMenu } from '@/components/canvas/QuickAddMenu';
import { FileDragOverlay } from '@/components/canvas/FileDragOverlay';

import { useTheaterLoading } from './hooks/useTheaterLoading';
import { useCanvasShortcuts } from './hooks/useCanvasShortcuts';
import { useQuickAddMenu } from './hooks/useQuickAddMenu';
import { useCanvasDragDrop } from './hooks/useCanvasDragDrop';
import { useAutoLayout } from './hooks/useAutoLayout';
import { useCanvasSnapping } from './hooks/useCanvasSnapping';
import { useNodeDragToAI } from './hooks/useNodeDragToAI';

const nodeTypes = {
  text: ScriptNode,
  image: CharacterNode,
  storyboard: StoryboardNode,
  video: VideoNode,
  audio: AudioNode,
  ghost: GhostNode,
} as unknown as NodeTypes;

const edgeTypes = {
  custom: CustomEdge,
};

const defaultEdgeOptions = {
  type: 'custom',
  animated: true,
  style: { stroke: '#868686ff', strokeWidth: 2 },
};

function InfiniteCanvas() {
  const params = useParams();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const theaterId = params.id as string;
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView, setCenter } = useReactFlow();
  const [showMap, setShowMap] = useState(false);
  const [viewport, setViewportState] = useState({ x: 0, y: 0, zoom: 1 });
  
  const { 
    nodes, edges, isLoading, isSaving, isDirty, lastSavedAt,
    onNodesChange, onEdgesChange, onConnect,
    undo, redo,
    theaterTitle, setTheaterTitle,
    snapToGrid, snapToGuides,
    setSnapToGrid, setSnapToGuides
  } = useCanvasStore();

  // Auto-pan to newly created ghost nodes
  useEffect(() => {
    const handler = (e: Event) => {
      const { x, y } = (e as CustomEvent).detail;
      setCenter(x, y, { duration: 600, zoom: 1 });
    };
    window.addEventListener('ghost-node-added', handler);
    return () => window.removeEventListener('ghost-node-added', handler);
  }, [setCenter]);

  // --- Hooks ---
  useTheaterLoading(theaterId);
  useCanvasShortcuts();
  const { menuState, onConnectEnd, handleAddNodeFromMenu } = useQuickAddMenu();
  const { onDragOver, onDragLeave, onDrop, isDraggingFile, dragFileType, dragPosition } = useCanvasDragDrop(reactFlowWrapper);
  const { isLayouting, handleAutoLayout } = useAutoLayout();
  const { alignmentLines, onNodeDrag: onSnappingDrag, onNodeDragStop: onSnappingDragStop } = useCanvasSnapping(snapToGuides);
  const { onNodeDragStart: onAIDragStart, onNodeDrag: onAIDrag, onNodeDragStop: onAIDragStop } = useNodeDragToAI();

  // --- Composed drag callbacks: snapping + AI panel detection ---
  const composedOnNodeDragStart = useCallback(
    (event: React.MouseEvent, node: any, nodes: any[]) => {
      onAIDragStart(event, node, nodes);
    },
    [onAIDragStart]
  );
  const composedOnNodeDrag = useCallback(
    (event: React.MouseEvent, node: any, nodes: any[]) => {
      onSnappingDrag(event, node);
      onAIDrag(event, node);
    },
    [onSnappingDrag, onAIDrag]
  );
  const composedOnNodeDragStop = useCallback(
    (event: React.MouseEvent, node: any, nodes: any[]) => {
      onSnappingDragStop();
      onAIDragStop(event, node, nodes);
    },
    [onSnappingDragStop, onAIDragStop]
  );

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground text-sm">{t('canvas.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div 
        className="flex-1 h-full relative" 
        ref={reactFlowWrapper}
        onDragLeave={onDragLeave}
      >
        {/* File drag overlay */}
        <FileDragOverlay isDraggingFile={isDraggingFile} dragFileType={dragFileType} dragPosition={dragPosition} />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeDragStart={composedOnNodeDragStart}
          onNodeDrag={composedOnNodeDrag}
          onNodeDragStop={composedOnNodeDragStop}
          onMove={(_, viewport) => setViewportState(viewport)}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={20}
          onDragOver={onDragOver}
          onDrop={onDrop}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView={nodes.length < 2}
          fitViewOptions={{ maxZoom: 1 }}
          minZoom={0.25}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
          snapToGrid={snapToGrid}
          snapGrid={[20, 20]}
          panOnDrag={[1, 2]}
          selectionOnDrag={true}
          selectionKeyCode={null}
          multiSelectionKeyCode={['Shift']}
          panActivationKeyCode={['Space']}
        >
          <Background gap={60} size={2} className="text-muted-foreground dark:text-muted-foreground" variant={BackgroundVariant.Dots} />
          
          {/* Snap alignment lines */}
          {snapToGuides && alignmentLines.vertical !== null && (
            <div
              className="absolute top-0 bottom-0 w-px bg-primary/50 pointer-events-none z-50 transition-opacity"
              style={{
                left: `${alignmentLines.vertical * viewport.zoom + viewport.x}px`,
                transform: 'translateX(-50%)',
              }}
            />
          )}
          {snapToGuides && alignmentLines.horizontal !== null && (
            <div
              className="absolute left-0 right-0 h-px bg-primary/50 pointer-events-none z-50 transition-opacity"
              style={{
                top: `${alignmentLines.horizontal * viewport.zoom + viewport.y}px`,
                transform: 'translateY(-50%)',
              }}
            />
          )}

          {showMap && (
            <MiniMap 
              nodeColor={(n) => {
                const colors: Record<string, string> = {
                  script: '#6366F1',
                  character: '#10B981',
                  video: '#A855F7',
                  audio: '#F59E0B',
                  storyboard: '#F59E0B',
                };
                return colors[n.type || ''] || '#F59E0B';
              }} 
              className="bg-card border border-border/50 rounded-lg shadow-lg !left-4 !bottom-16 !right-auto !top-auto"
              position="bottom-left"
            />
          )}
          
          <Panel position="bottom-left" className="m-4 z-50">
            <div className="flex items-center gap-2">
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
              <CanvasHelpButton />
            </div>
          </Panel>
          
          <Panel position="top-left" className="m-4 z-50">
            <CanvasToolbar
              theaterTitle={theaterTitle}
              setTheaterTitle={setTheaterTitle}
              undo={undo}
              redo={redo}
              isSaving={isSaving}
              isDirty={isDirty}
              lastSavedAt={lastSavedAt}
            />
          </Panel>

          <Panel position="top-right" className="flex gap-2 items-center pointer-events-none">
             <AIAssistantPanel />
          </Panel>
        </ReactFlow>

        {/* Canvas hints */}
        <CanvasHints />

        {/* Quick add menu (on connection end) */}
        <QuickAddMenu menuState={menuState} onAddNode={handleAddNodeFromMenu} />
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
