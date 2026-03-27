
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

import { useCanvasStore, CanvasNode, ScriptNodeData, CharacterNodeData, VideoNodeData } from '@/store/useCanvasStore';
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
import { Save, Undo, Redo, ArrowLeft, ScrollText, User, Clapperboard, Loader2, Check, LayoutGrid, FileText, Image, Film } from 'lucide-react';
import { useAutoLayout } from './hooks/useAutoLayout';
import { useCanvasSnapping } from './hooks/useCanvasSnapping';

const nodeTypes = {
  text: ScriptNode,
  image: CharacterNode,
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
  const { screenToFlowPosition, getViewport } = useReactFlow();
  const [showMap, setShowMap] = useState(false);
  const [viewport, setViewportState] = useState({ x: 0, y: 0, zoom: 1 });
  
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

  // File drag and drop state
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dragFileType, setDragFileType] = useState<'text' | 'image' | 'video' | null>(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });

  const { 
    nodes, edges, isLoading, isSaving, isDirty, lastSavedAt,
    onNodesChange, onEdgesChange, onConnect,
    addNode,
    undo, redo, takeSnapshot,
    loadTheater, saveToBackend, setTheaterId,
    theaterTitle, setTheaterTitle,
    snapToGrid, snapToGuides,
    setSnapToGrid, setSnapToGuides
  } = useCanvasStore();

  const { isLayouting, handleAutoLayout } = useAutoLayout();
  const { alignmentLines, onNodeDrag, onNodeDragStop } = useCanvasSnapping(snapToGuides);

  // Auto-save logic
  useEffect(() => {
    if (!isDirty || isSaving) return;

    const timer = setTimeout(() => {
      saveToBackend().catch(console.error);
    }, 2000); // 2 seconds debounce

    return () => clearTimeout(timer);
  }, [isDirty, isSaving, saveToBackend]);

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
    text: { title: '新文本卡', content: null, tags: [] },
    image: { name: '新图片卡', description: '', imageUrl: '', fitMode: 'cover' },
    storyboard: { shotNumber: '001', description: '', duration: 5 },
    video: { name: '新视频卡', description: '', videoUrl: '', fitMode: 'cover' },
  };

  // Default dimensions by node type (consistent with sidebar drag)
  const nodeDefaultDimensions: Record<string, { width: number; height: number }> = {
    text: { width: 400, height: 300 },
    image: { width: 512, height: 384 },
    video: { width: 512, height: 384 },
    storyboard: { width: 398, height: 256 },
  };

  const handleAddNodeFromMenu = (type: string) => {
    if (!menuState.sourceNodeId) return;

    const position = screenToFlowPosition({
      x: menuState.x,
      y: menuState.y,
    });

    const newNodeId = uuidv4();
    const data = nodeDefaultData[type] || { label: `${type} node` };
    const dimensions = nodeDefaultDimensions[type];

    const newNode = {
      id: newNodeId,
      type,
      position,
      width: dimensions?.width,
      height: dimensions?.height,
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

  // File type detection helpers
  const getFileType = (file: File): 'text' | 'image' | 'video' | null => {
    const type = file.type;
    const name = file.name.toLowerCase();
    
    // Text files
    const textTypes = ['text/plain', 'text/markdown', 'application/pdf'];
    const textExts = ['.txt', '.md', '.markdown', '.pdf'];
    
    // Image files
    const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    
    // Video files
    const videoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/quicktime', 'video/x-ms-wmv', 'video/x-flv'];
    const videoExts = ['.mp4', '.webm', '.ogg', '.avi', '.mov', '.wmv', '.flv', '.mkv'];
    
    if (textTypes.some(t => type.includes(t)) || textExts.some(ext => name.endsWith(ext))) return 'text';
    if (imageTypes.some(t => type.includes(t)) || imageExts.some(ext => name.endsWith(ext))) return 'image';
    if (videoTypes.some(t => type.includes(t)) || videoExts.some(ext => name.endsWith(ext))) return 'video';
    
    return null;
  };

  // Read text file content
  const readTextFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string || '');
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  // Create node from file
  const createNodeFromFile = async (file: File, position: { x: number; y: number }) => {
    const fileType = getFileType(file);
    const fileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
    
    switch (fileType) {
      case 'text': {
        let content: string;
        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        
        // File size limit for text files: 10MB
        const MAX_TEXT_FILE_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_TEXT_FILE_SIZE) {
          alert('文本文件大小不能超过 10MB');
          return;
        }
        
        if (isPdf) {
          // PDF files cannot be parsed in browser, show placeholder
          content = `[PDF 文件: ${file.name}]\n\nPDF 文件内容需要在服务器端解析。文件已作为附件上传。`;
        } else {
          try {
            content = await readTextFile(file);
          } catch {
            content = `无法读取文件: ${file.name}`;
          }
        }
        
        // Character limit: 100,000 characters (approximately 50,000 Chinese characters or 100,000 English characters)
        const MAX_CHARACTERS = 100000;
        const originalLength = content.length;
        if (content.length > MAX_CHARACTERS) {
          content = content.substring(0, MAX_CHARACTERS) + 
            `\n\n[文件内容已截断，原文件共 ${originalLength.toLocaleString()} 字符，超出最大限制 ${MAX_CHARACTERS.toLocaleString()} 字符]`;
        }
        
        const newNode: CanvasNode = {
          id: `text-${uuidv4()}`,
          type: 'text',
          position,
          width: 400,
          height: 300,
          data: {
            title: fileName,
            content: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: content }]
                }
              ]
            },
            tags: isPdf ? ['pdf'] : ['imported'],
          } as ScriptNodeData,
        };
        addNode(newNode);
        break;
      }
      
      case 'image': {
        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
          alert('图片大小不能超过 5MB');
          return;
        }
        
        const objectUrl = URL.createObjectURL(file);
        const newNode: CanvasNode = {
          id: `image-${uuidv4()}`,
          type: 'image',
          position,
          width: 512,
          height: 384,
          data: {
            name: fileName,
            description: '',
            imageUrl: objectUrl,
            uploading: true,
            fitMode: 'cover',
          } as CharacterNodeData,
        };
        addNode(newNode);
        
        // Upload the file
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', 'http://127.0.0.1:8000/api/media/upload');
          
          const token = localStorage.getItem('access_token');
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
          
          const formData = new FormData();
          formData.append('file', file);
          
          const response = await new Promise<{ url?: string; error?: string }>((resolve, reject) => {
            xhr.onload = () => {
              try {
                let res;
                if (xhr.responseText) {
                  res = JSON.parse(xhr.responseText);
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve(res || {});
                } else {
                  resolve({ error: res?.error || `上传失败 (HTTP ${xhr.status})` });
                }
              } catch {
                resolve({ error: `解析响应失败: ${xhr.status} ${xhr.statusText}` });
              }
            };
            xhr.onerror = () => reject(new Error('网络请求失败或跨域错误'));
            xhr.send(formData);
          });
          
          if (response.error) {
            throw new Error(response.error);
          }
          
          // Update node with uploaded URL
          const { updateNodeData } = useCanvasStore.getState();
          URL.revokeObjectURL(objectUrl);
          updateNodeData(newNode.id, { imageUrl: response.url, uploading: false } as Partial<CharacterNodeData>);
        } catch (error: any) {
          console.error('Upload error:', error);
          const { updateNodeData } = useCanvasStore.getState();
          updateNodeData(newNode.id, { uploading: false } as Partial<CharacterNodeData>);
          alert(`上传失败: ${error.message || '请重试'}`);
        }
        break;
      }
      
      case 'video': {
        // Validate file size (500MB max)
        if (file.size > 500 * 1024 * 1024) {
          alert('视频大小不能超过 500MB');
          return;
        }
        
        const objectUrl = URL.createObjectURL(file);
        const newNode: CanvasNode = {
          id: `video-${uuidv4()}`,
          type: 'video',
          position,
          width: 512,
          height: 384,
          data: {
            name: fileName,
            description: '',
            videoUrl: objectUrl,
            uploading: true,
            fitMode: 'cover',
          } as VideoNodeData,
        };
        addNode(newNode);
        
        // Upload the file
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', 'http://127.0.0.1:8000/api/media/upload');
          
          const token = localStorage.getItem('access_token');
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
          
          const formData = new FormData();
          formData.append('file', file);
          
          const response = await new Promise<{ url?: string; error?: string }>((resolve, reject) => {
            xhr.onload = () => {
              try {
                let res;
                if (xhr.responseText) {
                  res = JSON.parse(xhr.responseText);
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve(res || {});
                } else {
                  resolve({ error: res?.error || `上传失败 (HTTP ${xhr.status})` });
                }
              } catch {
                resolve({ error: `解析响应失败: ${xhr.status} ${xhr.statusText}` });
              }
            };
            xhr.onerror = () => reject(new Error('网络请求失败或跨域错误'));
            xhr.send(formData);
          });
          
          if (response.error) {
            throw new Error(response.error);
          }
          
          // Update node with uploaded URL
          const { updateNodeData } = useCanvasStore.getState();
          URL.revokeObjectURL(objectUrl);
          updateNodeData(newNode.id, { videoUrl: response.url, uploading: false } as Partial<VideoNodeData>);
        } catch (error: any) {
          console.error('Upload error:', error);
          const { updateNodeData } = useCanvasStore.getState();
          updateNodeData(newNode.id, { uploading: false } as Partial<VideoNodeData>);
          alert(`上传失败: ${error.message || '请重试'}`);
        }
        break;
      }
      
      default:
        alert(`不支持的文件类型: ${file.name}`);
    }
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    
    // Check if this is internal node drag (from sidebar/asset library) - takes priority
    const hasReactFlowData = event.dataTransfer.types.includes('application/reactflow');
    
    // Check if dragging files from outside (external file drag)
    const hasFiles = event.dataTransfer.types.includes('Files');
    
    // Priority: internal node drag > external file drag
    if (hasReactFlowData) {
      // Internal node drag from sidebar/asset library
      event.dataTransfer.dropEffect = 'move';
      setIsDraggingFile(false);
      setDragFileType(null);
    } else if (hasFiles) {
      // External file drag from OS file manager
      event.dataTransfer.dropEffect = 'copy';
      setIsDraggingFile(true);
      setDragPosition({ x: event.clientX, y: event.clientY });
      
      // Detect file type from the first file
      const files = event.dataTransfer.items;
      if (files.length > 0) {
        const file = files[0].getAsFile();
        if (file) {
          setDragFileType(getFileType(file));
        }
      }
    } else {
      event.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    // Only hide if leaving the wrapper, not entering a child
    const rect = reactFlowWrapper.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = event;
      if (
        clientX <= rect.left ||
        clientX >= rect.right ||
        clientY <= rect.top ||
        clientY >= rect.bottom
      ) {
        setIsDraggingFile(false);
        setDragFileType(null);
      }
    }
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDraggingFile(false);
      setDragFileType(null);

      // Handle external file drop
      const files = event.dataTransfer.files;
      if (files.length > 0) {
        const position = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        
        // Process each file
        Array.from(files).forEach((file, index) => {
          // Offset position for multiple files
          const filePosition = {
            x: position.x + index * 50,
            y: position.y + index * 50,
          };
          createNodeFromFile(file, filePosition);
        });
        return;
      }

      // Handle internal node drag (existing logic)
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
        text: { width: 400, height: 300 },
        image: { width: 512, height: 384 },
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

  // Get icon for file type
  const getFileTypeIcon = () => {
    switch (dragFileType) {
      case 'text': return <FileText className="w-8 h-8 text-blue-500" />;
      case 'image': return <Image className="w-8 h-8 text-emerald-500" />;
      case 'video': return <Film className="w-8 h-8 text-purple-500" />;
      default: return <FileText className="w-8 h-8 text-muted-foreground" />;
    }
  };

  // Get label for file type
  const getFileTypeLabel = () => {
    switch (dragFileType) {
      case 'text': return '文本文件';
      case 'image': return '图像文件';
      case 'video': return '视频文件';
      default: return '文件';
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div 
        className="flex-1 h-full relative" 
        ref={reactFlowWrapper}
        onDragLeave={onDragLeave}
      >
        {/* File drag overlay */}
        {isDraggingFile && (
          <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div 
              className="bg-card border-2 border-primary border-dashed rounded-xl p-8 shadow-2xl flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200"
              style={{
                position: 'absolute',
                left: dragPosition.x - 100,
                top: dragPosition.y - 80,
                pointerEvents: 'none',
              }}
            >
              {getFileTypeIcon()}
              <div className="text-center">
                <p className="text-lg font-semibold text-foreground">释放以创建 {getFileTypeLabel()}节点</p>
                <p className="text-sm text-muted-foreground mt-1">支持拖拽多个文件</p>
              </div>
            </div>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
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
        >
          <Background gap={60} size={2} className="text-muted-foreground dark:text-muted-foreground" variant={BackgroundVariant.Dots} />
          
          {/* Snap alignment lines - convert flow coordinates to screen coordinates */}
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
              <div className="w-px h-4 bg-border/50 mx-1" />
              {saveStatusText && (
                <div className="flex items-center gap-1.5 px-2">
                  <SaveIcon className={`w-3.5 h-3.5 text-muted-foreground ${isSaving ? 'animate-spin' : ''}`} />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{saveStatusText}</span>
                </div>
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
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('text')}>
              <ScrollText className="w-4 h-4 mr-2 text-indigo-500" />
              文本卡
            </Button>
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('image')}>
              <User className="w-4 h-4 mr-2 text-emerald-500" />
              图片卡
            </Button>
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('video')}>
              <Film className="w-4 h-4 mr-2 text-purple-500" />
              视频卡
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
