
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
  FinalConnectionState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';

import { useCanvasStore, CanvasNode, ScriptNodeData, CharacterNodeData, VideoNodeData, AudioNodeData } from '@/store/useCanvasStore';
import { useResourceStore } from '@/store/useResourceStore';
import { Sidebar } from '@/components/canvas/Sidebar';
import { ZoomControls } from '@/components/canvas/ZoomControls';
import ScriptNode from '@/components/canvas/ScriptNode';
import CharacterNode from '@/components/canvas/CharacterNode';
import StoryboardNode from '@/components/canvas/StoryboardNode';
import VideoNode from '@/components/canvas/VideoNode';
import AudioNode from '@/components/canvas/AudioNode';
import { CustomEdge } from '@/components/canvas/CustomEdge';
import { AIAssistantPanel } from '@/components/canvas/AIAssistantPanel';
import { CanvasHints } from '@/components/canvas/CanvasCursor';
import { CanvasHelpButton } from '@/components/canvas/CanvasHelp';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Save, Undo, Redo, ArrowLeft, ScrollText, User, Clapperboard, Loader2, Check, LayoutGrid, FileText, Image, Film, Music, Headphones } from 'lucide-react';
import { useAutoLayout } from './hooks/useAutoLayout';
import { useCanvasSnapping } from './hooks/useCanvasSnapping';
import { useNodeDragToAI } from './hooks/useNodeDragToAI';

const nodeTypes = {
  text: ScriptNode,
  image: CharacterNode,
  storyboard: StoryboardNode,
  video: VideoNode,
  audio: AudioNode,
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
  const router = useRouter();
  const params = useParams();
  const { t } = useTranslation();
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
  const [dragFileType, setDragFileType] = useState<'text' | 'image' | 'video' | 'audio' | null>(null);
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });

  const { 
    nodes, edges, isLoading, isSaving, isDirty, isSyncing, lastSavedAt,
    onNodesChange, onEdgesChange, onConnect,
    addNode,
    undo, redo, takeSnapshot,
    loadTheater, saveToBackend, setTheaterId,
    theaterTitle, setTheaterTitle,
    snapToGrid, snapToGuides,
    setSnapToGrid, setSnapToGuides
  } = useCanvasStore();

  const { isLayouting, handleAutoLayout } = useAutoLayout();
  const { alignmentLines, onNodeDrag: onSnappingDrag, onNodeDragStop: onSnappingDragStop } = useCanvasSnapping(snapToGuides);
  const { onNodeDragStart: onAIDragStart, onNodeDrag: onAIDrag, onNodeDragStop: onAIDragStop } = useNodeDragToAI();

  // 组合拖拽回调：对齐吸附 + AI面板检测
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

  // Auto-save logic
  useEffect(() => {
    if (!isDirty || isSaving || isSyncing) return;

    const timer = setTimeout(() => {
      saveToBackend().catch(console.error);
    }, 2000); // 2 seconds debounce

    return () => clearTimeout(timer);
  }, [isDirty, isSaving, isSyncing, saveToBackend]);

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
    audio: { name: '新音频卡', description: '', audioUrl: '' },
  };

  // Default dimensions by node type (consistent with sidebar drag)
  const nodeDefaultDimensions: Record<string, { width: number; height: number }> = {
    text: { width: 400, height: 300 },
    image: { width: 512, height: 384 },
    video: { width: 512, height: 384 },
    audio: { width: 360, height: 200 },
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

  // File type detection (映射表模式)
  const FILE_TYPE_MATCHERS: Array<{ type: 'text' | 'image' | 'video' | 'audio'; mimes: string[]; exts: string[] }> = [
    { type: 'text', mimes: ['text/plain', 'text/markdown', 'application/pdf'], exts: ['.txt', '.md', '.markdown', '.pdf'] },
    { type: 'image', mimes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'], exts: ['.png', '.jpg', '.jpeg', '.webp', '.gif'] },
    { type: 'video', mimes: ['video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/quicktime', 'video/x-ms-wmv', 'video/x-flv'], exts: ['.mp4', '.webm', '.avi', '.mov', '.wmv', '.flv', '.mkv'] },
    { type: 'audio', mimes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/flac', 'audio/aac', 'audio/x-m4a'], exts: ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'] },
  ];

  const getFileType = (file: File): 'text' | 'image' | 'video' | 'audio' | null => {
    const mime = file.type;
    const name = file.name.toLowerCase();
    return (
      FILE_TYPE_MATCHERS.find(
        (m) => m.mimes.some((t) => mime.includes(t)) || m.exts.some((ext) => name.endsWith(ext))
      )?.type ?? null
    );
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

  // 通用文件上传（XHR，避免重复代码）
  const uploadFile = (file: File): Promise<{ url?: string; error?: string; asset?: Record<string, unknown> }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/media/upload');
      const token = localStorage.getItem('access_token');
      token && xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      const formData = new FormData();
      formData.append('file', file);
      xhr.onload = () => {
        try {
          const res = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          xhr.status >= 200 && xhr.status < 300
            ? resolve(res)
            : resolve({ error: res?.detail || res?.error || t('canvas.uploadFailedHttp', { status: xhr.status }) });
        } catch {
          resolve({ error: t('canvas.parseResponseFailed', { status: xhr.status, statusText: xhr.statusText }) });
        }
      };
      xhr.onerror = () => reject(new Error(t('canvas.networkError')));
      xhr.send(formData);
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
          alert(t('canvas.fileSizeError.text'));
          return;
        }
        
        if (isPdf) {
          // PDF files cannot be parsed in browser, show placeholder
          content = t('canvas.pdfPlaceholder', { name: file.name });
        } else {
          try {
            content = await readTextFile(file);
          } catch {
            content = t('canvas.readFileFailed', { name: file.name });
          }
        }
        
        // Character limit: 100,000 characters (approximately 50,000 Chinese characters or 100,000 English characters)
        const MAX_CHARACTERS = 100000;
        const originalLength = content.length;
        if (content.length > MAX_CHARACTERS) {
          content = content.substring(0, MAX_CHARACTERS) + 
            t('canvas.contentTruncated', { original: originalLength.toLocaleString(), max: MAX_CHARACTERS.toLocaleString() });
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
        // Validate file size (50MB max)
        if (file.size > 50 * 1024 * 1024) {
          alert(t('canvas.fileSizeError.image'));
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
        
        try {
          const response = await uploadFile(file);
          response.error && (() => { throw new Error(response.error); })();
          const { updateNodeData } = useCanvasStore.getState();
          URL.revokeObjectURL(objectUrl);
          updateNodeData(newNode.id, { imageUrl: response.url, uploading: false } as Partial<CharacterNodeData>);
          // 同步新资源到 resourceStore
          response.asset && useResourceStore.getState().syncAssetFromUpload(response.asset);
        } catch (error: any) {
          console.error('Upload error:', error);
          const { updateNodeData } = useCanvasStore.getState();
          updateNodeData(newNode.id, { uploading: false } as Partial<CharacterNodeData>);
          alert(t('canvas.uploadFailed', { message: error.message || t('canvas.retryHint') }));
        }
        break;
      }
      
      case 'video': {
        // Validate file size (500MB max)
        if (file.size > 500 * 1024 * 1024) {
          alert(t('canvas.fileSizeError.video'));
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
        
        try {
          const response = await uploadFile(file);
          response.error && (() => { throw new Error(response.error); })();
          const { updateNodeData } = useCanvasStore.getState();
          URL.revokeObjectURL(objectUrl);
          updateNodeData(newNode.id, { videoUrl: response.url, uploading: false } as Partial<VideoNodeData>);
          // 同步新资源到 resourceStore
          response.asset && useResourceStore.getState().syncAssetFromUpload(response.asset);
        } catch (error: any) {
          console.error('Upload error:', error);
          const { updateNodeData } = useCanvasStore.getState();
          updateNodeData(newNode.id, { uploading: false } as Partial<VideoNodeData>);
          alert(t('canvas.uploadFailed', { message: error.message || t('canvas.retryHint') }));
        }
        break;
      }

      case 'audio': {
        // Validate file size (100MB max)
        if (file.size > 100 * 1024 * 1024) {
          alert(t('canvas.fileSizeError.audio'));
          return;
        }

        // 先创建占位音频节点（显示上传中状态）
        const audioObjectUrl = URL.createObjectURL(file);
        const audioNode: CanvasNode = {
          id: `audio-${uuidv4()}`,
          type: 'audio',
          position,
          width: 360,
          height: 200,
          data: {
            name: fileName,
            description: '',
            audioUrl: audioObjectUrl,
            uploading: true,
          } as AudioNodeData,
        };
        addNode(audioNode);

        try {
          const response = await uploadFile(file);
          response.error && (() => { throw new Error(response.error); })();
          const { updateNodeData } = useCanvasStore.getState();
          URL.revokeObjectURL(audioObjectUrl);
          updateNodeData(audioNode.id, { audioUrl: response.url, uploading: false } as Partial<AudioNodeData>);
          // 同步新资源到 resourceStore
          response.asset && useResourceStore.getState().syncAssetFromUpload(response.asset);
        } catch (error: any) {
          console.error('Audio upload error:', error);
          const { updateNodeData } = useCanvasStore.getState();
          updateNodeData(audioNode.id, { uploading: false } as Partial<AudioNodeData>);
          alert(t('canvas.uploadFailed', { message: error.message || t('canvas.retryHint') }));
        }
        break;
      }
      
      default:
        alert(t('canvas.unsupportedFile', { name: file.name }));
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

      // 优先检查内部拖拽（从侧边栏/资产库），避免浏览器原生 img 拖拽导致 files 干扰
      const type = event.dataTransfer.getData('application/reactflow');
      if (type) {
        // 内部拖拽路径，直接创建节点，不走文件上传
      } else {
        // Handle external file drop
        const files = event.dataTransfer.files;
        if (files.length > 0) {
          const position = screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          
          // 按类型分组并限制批量数量（映射表模式）
          const BATCH_LIMITS: Record<string, number> = { video: 5, image: 20, audio: 20, text: 20 };
          const TYPE_NAMES: Record<string, string> = {
            video: t('canvas.fileNames.video'),
            image: t('canvas.fileNames.image'),
            audio: t('canvas.fileNames.audio'),
            text: t('canvas.fileNames.text'),
          };
          const grouped: Record<string, File[]> = {};
          Array.from(files).forEach((file) => {
            const fType = getFileType(file) ?? 'unknown';
            (grouped[fType] = grouped[fType] || []).push(file);
          });

          const allowed: File[] = [];
          const rejected: string[] = [];
          Object.entries(grouped).forEach(([fType, list]) => {
            const limit = BATCH_LIMITS[fType] ?? 20;
            allowed.push(...list.slice(0, limit));
            list.length > limit && rejected.push(
              t('canvas.batchLimit', { type: TYPE_NAMES[fType] ?? t('canvas.fileNames.default'), limit, skipped: list.length - limit })
            );
          });
          rejected.length > 0 && alert(rejected.join('\n'));

          // 串行上传避免并发写入 SQLite 冲突
          (async () => {
            for (let i = 0; i < allowed.length; i++) {
              const filePosition = {
                x: position.x + i * 50,
                y: position.y + i * 50,
              };
              await createNodeFromFile(allowed[i], filePosition);
            }
          })();
          return;
        }
        return;
      }

      // Handle internal node drag (from sidebar/asset library)
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
    [screenToFlowPosition, addNode, t]
  );

  // Save status indicator
  const saveStatusText = isSaving ? t('canvas.saving') : isDirty ? t('canvas.unsaved') : lastSavedAt ? t('canvas.saved') : '';
  const SaveIcon = isSaving ? Loader2 : isDirty ? Save : Check;

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

  // 拖拽提示映射表（避免 switch-case）
  const FILE_TYPE_ICONS: Record<string, React.ReactNode> = {
    text: <FileText className="w-8 h-8 text-blue-500" />,
    image: <Image className="w-8 h-8 text-emerald-500" />,
    video: <Film className="w-8 h-8 text-purple-500" />,
    audio: <Music className="w-8 h-8 text-amber-500" />,
  };
  const FILE_TYPE_LABELS: Record<string, string> = {
    text: t('canvas.fileType.text'),
    image: t('canvas.fileType.image'),
    video: t('canvas.fileType.video'),
    audio: t('canvas.fileType.audio'),
  };

  const getFileTypeIcon = () => FILE_TYPE_ICONS[dragFileType ?? ''] ?? <FileText className="w-8 h-8 text-muted-foreground" />;
  const getFileTypeLabel = () => FILE_TYPE_LABELS[dragFileType ?? ''] ?? t('canvas.fileType.default');

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
                <p className="text-lg font-semibold text-foreground">{t('canvas.dropToCreateNode', { type: getFileTypeLabel() })}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('canvas.multiFileDrop')}</p>
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
              {/* Help 按钮 - 与工具条分离 */}
              <CanvasHelpButton />
            </div>
          </Panel>
          
          <Panel position="top-left" className="m-4 z-50">
            <div className="flex items-center bg-card border border-border/50 shadow-sm rounded-lg p-1 gap-1 pointer-events-auto">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => router.push('/')} title={t('canvas.back')}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="w-px h-4 bg-border/50 mx-1" />
              <input
                type="text"
                value={theaterTitle}
                onChange={(e) => setTheaterTitle(e.target.value)}
                className="bg-transparent text-sm font-medium text-foreground outline-none border-none px-2 py-1 w-40 truncate"
                placeholder={t('canvas.theaterName')}
              />
              <div className="w-px h-4 bg-border/50 mx-1" />
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={undo} title={t('canvas.undo')}>
                <Undo className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={redo} title={t('canvas.redo')}>
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

        {/* 画布操作提示 */}
        <CanvasHints />

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
              {t('canvas.createConnectedNode')}
            </div>
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('text')}>
              <ScrollText className="w-4 h-4 mr-2 text-indigo-500" />
              {t('canvas.textCard')}
            </Button>
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('image')}>
              <User className="w-4 h-4 mr-2 text-emerald-500" />
              {t('canvas.imageCard')}
            </Button>
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('video')}>
              <Film className="w-4 h-4 mr-2 text-purple-500" />
              {t('canvas.videoCard')}
            </Button>
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('audio')}>
              <Headphones className="w-4 h-4 mr-2 text-amber-500" />
              {t('canvas.audioCard')}
            </Button>
            <Button variant="ghost" className="justify-start px-2 py-1.5 h-auto text-sm" onClick={() => handleAddNodeFromMenu('storyboard')}>
              <Clapperboard className="w-4 h-4 mr-2 text-amber-500" />
              {t('canvas.storyboardCard')}
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
