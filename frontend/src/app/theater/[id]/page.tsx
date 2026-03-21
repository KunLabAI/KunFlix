
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
import VideoNode from '@/components/canvas/VideoNode';
import { CustomEdge } from '@/components/canvas/CustomEdge';
import { AIAssistantPanel } from '@/components/canvas/AIAssistantPanel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Save, Undo, Redo, ArrowLeft, ScrollText, User, Clapperboard, Loader2, Check } from 'lucide-react';

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
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated } = useAuth();
  const theaterId = params.id as string;
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [showMap, setShowMap] = useState(false);
  
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

  const { 
    nodes, edges, isLoading, isSaving, isDirty, lastSavedAt,
    onNodesChange, onEdgesChange, onConnect,
    addNode,
    undo, redo, takeSnapshot,
    loadTheater, saveToBackend, setTheaterId,
    theaterTitle, setTheaterTitle,
  } = useCanvasStore();

  // Load theater on mount (wait for auth)
  const loaded = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || loaded.current) return;
    loaded.current = true;
    loadTheater(theaterId).catch(() => {
      router.push('/');
    });
  }, [isAuthenticated, theaterId, loadTheater, router]);

  // Ensure theaterId is set
  useEffect(() => {
    setTheaterId(theaterId);
  }, [theaterId, setTheaterId]);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (connectionState.isValid) return;
      if (!connectionState.fromNode) return;

      const target = event.target as Element;
      const isPane = target.classList.contains('react-flow__pane') || 
                     target.classList.contains('react-flow__background') || 
                     !!target.closest('.react-flow__pane') ||
                     !!target.closest('.react-flow__background');
                     
      if (!isPane) return;

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

  // Node type default data registry (avoids switch/case)
  const nodeDefaultData: Record<string, Record<string, unknown>> = {
    script: { title: '新文本卡', description: '', tags: [] },
    character: { name: '新图片卡', description: '' },
    storyboard: { shotNumber: '001', description: '', duration: 5 },
    video: { name: '新视频卡', description: '' },
  };

  const handleAddNodeFromMenu = (type: string) => {
    if (!menuState.sourceNodeId) return;

    const position = screenToFlowPosition({
      x: menuState.x,
      y: menuState.y,
    });

    const newNodeId = uuidv4();
    const data = nodeDefaultData[type] || { label: `${type} node` };

    const newNode = {
      id: newNodeId,
      type,
      position,
      data,
    } as CanvasNode;

    addNode(newNode);

    // Connect based on handle direction
    let targetHandle = null;
    let sourceHandle = menuState.sourceHandleId;
    let connectionSource = menuState.sourceNodeId;
    let connectionTarget = newNodeId;

    const handleConnections: Record<string, () => void> = {
      'left-source': () => { targetHandle = 'right-target'; },
      'right-source': () => { targetHandle = 'left-target'; },
      'left-target': () => {
        connectionSource = newNodeId;
        connectionTarget = menuState.sourceNodeId!;
        sourceHandle = 'right-source';
        targetHandle = 'left-target';
      },
      'right-target': () => {
        connectionSource = newNodeId;
        connectionTarget = menuState.sourceNodeId!;
        sourceHandle = 'left-source';
        targetHandle = 'right-target';
      },
    };

    const applyConnection = handleConnections[menuState.sourceHandleId || ''];
    if (applyConnection) applyConnection();

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
      const target = e.target as Element;
      if (target.closest('.quick-add-menu')) return;
      
      if (menuState.show) {
        setMenuState((prev) => ({ ...prev, show: false }));
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [menuState.show]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Save: Ctrl + S
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        saveToBackend().catch(console.error);
      }
      
      // Undo: Ctrl + Z
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key === 'z') {
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
  }, [undo, redo, saveToBackend]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const dataStr = event.dataTransfer.getData('application/reactflow-data');
      const dimensionsStr = event.dataTransfer.getData('application/reactflow-dimensions');
      
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Dimension defaults by type (avoids if-else chain)
      const defaultDimensions: Record<string, { width: number; height: number }> = {
        character: { width: 512, height: 384 },
        video: { width: 512, height: 384 },
        storyboard: { width: 398, height: 256 },
      };

      let width: number | undefined;
      let height: number | undefined;

      if (dimensionsStr) {
        const dims = JSON.parse(dimensionsStr);
        width = dims.width;
        height = dims.height;
      } else {
        const defaults = defaultDimensions[type];
        width = defaults?.width;
        height = defaults?.height;
      }

      const newNode: CanvasNode = {
        id: uuidv4(),
        type,
        position,
        data: dataStr ? JSON.parse(dataStr) : { label: `${type} node` },
        width,
        height,
      };

      addNode(newNode);
    },
    [screenToFlowPosition, addNode]
  );

  // Save status indicator
  const saveStatusText = isSaving ? '保存中...' : isDirty ? '未保存' : lastSavedAt ? '已保存' : '';
  const SaveIcon = isSaving ? Loader2 : isDirty ? Save : Check;

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
          deleteKeyCode={['Backspace', 'Delete']}
          fitView={nodes.length < 2}
          fitViewOptions={{ maxZoom: 1 }}
          minZoom={0.25}
          maxZoom={3}
          proOptions={{ hideAttribution: true }}
          snapToGrid={false}
        >
          <Background gap={80} size={1} className="text-muted-foreground dark:text-muted-foreground" variant={BackgroundVariant.Dots} />
          
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
            <ZoomControls showMap={showMap} onToggleMap={() => setShowMap(!showMap)} />
          </Panel>
          
          <Panel position="top-left" className="m-4 z-50">
            <div className="flex items-center bg-card border border-border/50 shadow-sm rounded-lg p-1 gap-1 pointer-events-auto">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => router.push('/')} title="返回">
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-px h-4 bg-border/50 mx-1" />
              <input
                type="text"
                value={theaterTitle}
                onChange={(e) => setTheaterTitle(e.target.value)}
                className="bg-transparent text-sm font-medium text-foreground outline-none border-none px-2 py-1 w-40 truncate"
                placeholder="剧场名称"
              />
              <div className="w-px h-4 bg-border/50 mx-1" />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={undo} title="撤销 (Ctrl+Z)">
                <Undo className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={redo} title="重做 (Ctrl+Y)">
                <Redo className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${isDirty ? 'text-amber-500 hover:text-amber-600' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => saveToBackend().catch(console.error)}
                disabled={isSaving}
                title={`保存 (Ctrl+S) ${saveStatusText}`}
              >
                <SaveIcon className={`w-4 h-4 ${isSaving ? 'animate-spin' : ''}`} />
              </Button>
              {saveStatusText && (
                <span className="text-xs text-muted-foreground px-1 whitespace-nowrap">{saveStatusText}</span>
              )}
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
              transform: 'translate(-50%, 10px)'
            }}
          >
            <div className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">
              创建连接的节点
            </div>
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('script')}>
              <ScrollText className="w-4 h-4 mr-2 text-indigo-500" />
              文本卡
            </Button>
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('character')}>
              <User className="w-4 h-4 mr-2 text-emerald-500" />
              图片卡
            </Button>
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('storyboard')}>
              <Clapperboard className="w-4 h-4 mr-2 text-amber-500" />
              多维表格卡
            </Button>
          </Card>
        )}
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
