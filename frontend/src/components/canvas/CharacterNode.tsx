
import React, { memo, useState, useRef, useCallback } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Trash2, Upload, AlertCircle, RefreshCw, Maximize, Minimize, X, ZoomIn, ZoomOut, Sparkles } from 'lucide-react';
import { useCanvasStore, CharacterNodeData, CanvasNode } from '@/store/useCanvasStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';
import { NodeToolbar, ToolbarAction } from './NodeToolbar';
import { v4 as uuidv4 } from 'uuid';
import { createPortal } from 'react-dom';

const CharacterNode = ({ id, data, selected }: NodeProps<Node<CharacterNodeData>>) => {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const updateNodeDimensions = useCanvasStore((state) => state.updateNodeDimensions);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const addNode = useCanvasStore((state) => state.addNode);
  const { getNode } = useReactFlow();

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(data.name || '');
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external title changes
  React.useEffect(() => {
    if (!isEditingTitle) {
      setEditTitle(data.name || '');
    }
  }, [data.name, isEditingTitle]);

  // Click outside to save title
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isEditingTitle && inputRef.current && !inputRef.current.contains(e.target as globalThis.Node)) {
        updateNodeData(id, { name: editTitle });
        setIsEditingTitle(false);
      }
    };
    
    if (isEditingTitle) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditingTitle, editTitle, id, updateNodeData]);

  const handleTitleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingTitle(true);
    setEditTitle(data.name || '');
  };

  const handleTitleFinishEdit = () => {
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' || e.key === 'Escape') {
      handleTitleFinishEdit();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要删除这张图片卡吗？")) {
      deleteNode(id);
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    if (node) {
      const currentData = node.data as CharacterNodeData;
      const newNode: CanvasNode = {
        ...(node as CanvasNode),
        id: `character-${uuidv4()}`,
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
        selected: false,
        data: {
          ...currentData,
          name: currentData.name ? `${currentData.name} (副本)` : '未命名图片卡 (副本)',
          uploading: false,
        },
      };
      addNode(newNode);
    }
  };

  const handleToggleFitMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentFitMode = data.fitMode || 'contain';
    updateNodeData(id, { fitMode: currentFitMode === 'contain' ? 'cover' : 'contain' });
  };

  const handleAIEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 确保 imageUrl 是完整的 /api/media/ 路径
    let imageUrl = data.imageUrl || '';
    const needsPrefix = imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('/api/media/') && !imageUrl.startsWith('data:');
    needsPrefix && (imageUrl = `/api/media/${imageUrl}`);
    
    // 使用 nodeAttachments 代替 imageEditContext，统一预览样式（与拖拽一致）
    const store = useAIAssistantStore.getState();
    store.addNodeAttachment({
      nodeId: id,
      nodeType: 'image',
      label: data.name || '未命名图片卡',
      excerpt: data.description || '',
      thumbnailUrl: imageUrl,
      meta: { fromAIEdit: true },
    });
    store.setIsOpen(true);
  };

  const handleUploadClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type and size
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setUploadError('仅支持 jpg、jpeg、png、webp 格式');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('图片大小不能超过 5MB');
      return;
    }

    setUploadError(null);
    setUploadProgress(0);
    
    // Set local preview & uploading state
    const objectUrl = URL.createObjectURL(file);
    updateNodeData(id, { imageUrl: objectUrl, uploading: true });

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/media/upload');
      
      // Attach Auth token if available
      const token = localStorage.getItem('access_token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress(percentComplete);
        }
      };

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
          } catch (err) {
            resolve({ error: `解析响应失败: ${xhr.status} ${xhr.statusText}` });
          }
        };
        xhr.onerror = () => reject(new Error('网络请求失败或跨域错误'));
        xhr.send(formData);
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Success
      updateNodeData(id, { imageUrl: response.url, uploading: false });
    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadError(error.message || '上传失败，请重试');
      updateNodeData(id, { uploading: false });
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const isUploading = data.uploading;

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      // Calculate new dimensions while keeping a reasonable max size (e.g. 512px max width/height)
      const MAX_SIZE = 512;
      const aspectRatio = img.naturalWidth / img.naturalHeight;
      
      let newWidth, newHeight;
      if (aspectRatio > 1) {
        // Landscape
        newWidth = Math.min(img.naturalWidth, MAX_SIZE);
        newHeight = newWidth / aspectRatio;
      } else {
        // Portrait or Square
        newHeight = Math.min(img.naturalHeight, MAX_SIZE);
        newWidth = newHeight * aspectRatio;
      }
      
      // Ensure minimum dimensions (e.g., min width 200px to fit UI controls)
      newWidth = Math.max(newWidth, 256);
      newHeight = Math.max(newHeight, 192);

      // Only update if dimensions differ significantly to avoid loops
      const currentNode = getNode(id);
      if (currentNode) {
        const currentWidth = currentNode.width ?? 0;
        const currentHeight = currentNode.height ?? 0;
        if (Math.abs(currentWidth - newWidth) > 5 || Math.abs(currentHeight - newHeight) > 5) {
          updateNodeDimensions(id, Math.round(newWidth), Math.round(newHeight));
        }
      }
    }
  };

  // Preview handlers
  const handlePreviewWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setPreviewScale(prev => {
      const delta = e.deltaY * -0.001;
      const newScale = Math.min(Math.max(0.1, prev + delta), 5);
      return newScale;
    });
  }, []);

  const handlePreviewPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsPreviewDragging(true);
    dragStartPosRef.current = {
      x: e.clientX - previewPosition.x,
      y: e.clientY - previewPosition.y
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePreviewPointerMove = (e: React.PointerEvent) => {
    if (!isPreviewDragging) return;
    setPreviewPosition({
      x: e.clientX - dragStartPosRef.current.x,
      y: e.clientY - dragStartPosRef.current.y
    });
  };

  const handlePreviewPointerUp = (e: React.PointerEvent) => {
    setIsPreviewDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    // Reset preview state after animation
    setTimeout(() => {
      setPreviewScale(1);
      setPreviewPosition({ x: 0, y: 0 });
    }, 300);
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewOpen) {
        closePreview();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewOpen]);

  React.useEffect(() => {
    if (previewOpen) {
      document.body.style.overflow = 'hidden';
      // Add non-passive wheel listener for zoom
      const container = document.getElementById('preview-container');
      if (container) {
        container.addEventListener('wheel', handlePreviewWheel, { passive: false });
      }
      return () => {
        document.body.style.overflow = '';
        if (container) {
          container.removeEventListener('wheel', handlePreviewWheel);
        }
      };
    }
  }, [previewOpen, handlePreviewWheel]);


  return (
    <>
      <NodeResizer 
        color="#6d6d6d" 
        isVisible={selected} 
        minWidth={256} 
        minHeight={192}
        lineStyle={{ display: 'none' }}
        handleStyle={{ 
          width: '8px', 
          height: '8px', 
          borderRadius: '4px',
          border: '1px solid #6d6d6d',
          background: '#fff',
          opacity: selected ? 1 : 0,
          transition: 'opacity 0.2s'
        }}
      />
      
      {/* 隐藏的文件输入 */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".jpg,.jpeg,.png,.webp" 
        onChange={handleFileChange}
        aria-label="选择图片"
        data-testid="file-upload-input"
      />

      <div 
        ref={nodeRef}
        className={`character-node-wrapper w-full h-full flex flex-col group relative ${isUploading ? 'nodrag' : ''}`}
      >
        {/* 标题悬浮在卡片上方，不占节点布局空间 */}
        <div className="absolute bottom-full left-0 right-0 mb-1 px-1 flex items-center justify-between gap-2 min-h-[28px] nodrag">
          <div className="flex-1 min-w-0 flex items-center">
            {isEditingTitle ? (
              <Input
                ref={inputRef}
                value={editTitle}
                onChange={(e) => {
                  setEditTitle(e.target.value);
                  updateNodeData(id, { name: e.target.value });
                }}
                className="font-bold text-sm h-7 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-0 focus:outline-none px-0 shadow-none cursor-text select-text rounded-none leading-none"
                placeholder="未命名图片卡"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={handleTitleKeyDown}
                autoFocus
              />
            ) : (
              <h3 
                className="font-bold text-sm h-7 flex items-center truncate text-foreground/90 cursor-text select-text hover:text-primary leading-none" 
                title={data.name} 
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={handleTitleDoubleClick}
              >
                {data.name || '未命名图片卡'}
              </h3>
            )}
          </div>
          {/* 分辨率信息 */}
          {imageDimensions && (
            <div className="text-xs font-medium text-muted-foreground/60 flex-shrink-0 select-none">
              {imageDimensions.width}×{imageDimensions.height}
            </div>
          )}
        </div>

        <Card className={`w-full h-full flex flex-col bg-card ${selected ? 'ring-2 ring-primary' : 'border border-border/50'} overflow-hidden relative z-[2]`}>
          <CardContent 
            className="flex flex-col items-center justify-center relative custom-scrollbar flex-1 p-0 overflow-hidden" 
          >
            {!data.imageUrl && !isUploading && !uploadError && (
              <Button 
                onClick={handleUploadClick} 
                variant="default" 
                role="button" 
                aria-label="上传图片"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleUploadClick();
                  }
                }}
              >
                <Upload className="w-4 h-4 mr-2" />
                上传图片
              </Button>
            )}

            {data.imageUrl && (
              <div className="w-full h-full flex flex-col items-center justify-center relative group/img">
                <img 
                  src={data.imageUrl} 
                  alt={data.name} 
                  className={`w-full h-full rounded-sm ${data.fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
                  onLoad={handleImageLoad}
                  onPointerDown={(e) => e.stopPropagation()}
                />
                
                {/* 拖拽遮罩：不含 nodrag，透明，允许 React Flow 接管拖拽，同时支持双击全屏等操作 */}
                <div 
                  className="absolute inset-0 cursor-grab active:cursor-grabbing z-10"
                  title="拖拽移动节点 / 双击全屏预览"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setPreviewOpen(true);
                  }}
                />
              </div>
            )}

            {isUploading && (
              <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 p-4">
                <div className="w-full max-w-[200px] h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300 ease-linear" 
                    style={{ width: `${uploadProgress}%` }}
                    data-testid="upload-progress-bar"
                  />
                </div>
                <span className="text-xs font-medium text-muted-foreground mt-3">
                  {Math.round(uploadProgress)}%
                </span>
              </div>
            )}

            {uploadError && !isUploading && (
              <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center z-10 p-4 text-center gap-3">
                <div className="text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">{uploadError}</span>
                </div>
                <Button 
                  onClick={handleUploadClick} 
                  variant="outline" 
                  size="sm" 
                  role="button" 
                  aria-label="重试上传"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleUploadClick();
                    }
                  }}
                >
                  <RefreshCw className="w-3 h-3 mr-2" /> 重试
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 工具条 */}
        <NodeToolbar
          actions={[
            {
              icon: <Sparkles className="h-3.5 w-3.5" />,
              onClick: handleAIEdit,
              title: 'AI 编辑',
              variant: 'primary',
            },
            {
              icon: data.fitMode === 'cover' ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />,
              onClick: handleToggleFitMode,
              title: data.fitMode === 'cover' ? '适应卡片 (留白)' : '填充卡片 (裁剪)',
              ariaLabel: '切换图片适配模式',
            },
            {
              icon: <Copy className="h-3.5 w-3.5" />,
              onClick: handleDuplicate,
              title: '创建副本',
            },
            {
              icon: <Trash2 className="h-3.5 w-3.5" />,
              onClick: handleDelete,
              title: '删除',
              variant: 'danger',
            },
          ] as ToolbarAction[]}
        />

        {/* Right Edge */}
        <div className="edge-handle-wrapper right group/handle pointer-events-auto">
          <Handle type="target" position={Position.Right} id="right-target" />
          <Handle type="source" position={Position.Right} id="right-source" />
          <div className="edge-handle-inner">
            <div className="edge-handle-line" />
            <div className="edge-handle-dot" />
          </div>
        </div>

        {/* Left Edge */}
        <div className="edge-handle-wrapper left group/handle pointer-events-auto">
          <Handle type="target" position={Position.Left} id="left-target" />
          <Handle type="source" position={Position.Left} id="left-source" />
          <div className="edge-handle-inner">
            <div className="edge-handle-line" />
            <div className="edge-handle-dot" />
          </div>
        </div>
      </div>

      {/* Fullscreen Preview Portal */}
      {previewOpen && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={closePreview}
        >
          {/* Controls */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
            <div className="bg-black/50 text-white px-3 py-1.5 rounded-md text-sm font-medium backdrop-blur-md" onClick={e => e.stopPropagation()}>
              {Math.round(previewScale * 100)}%
            </div>
            <Button 
              variant="secondary" 
              size="icon" 
              className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
              onClick={(e) => { e.stopPropagation(); setPreviewScale(p => Math.min(5, p + 0.25)); }}
            >
              <ZoomIn className="h-5 w-5" />
            </Button>
            <Button 
              variant="secondary" 
              size="icon" 
              className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
              onClick={(e) => { e.stopPropagation(); setPreviewScale(p => Math.max(0.1, p - 0.25)); }}
            >
              <ZoomOut className="h-5 w-5" />
            </Button>
            <Button 
              variant="secondary" 
              size="icon" 
              className="bg-black/50 hover:bg-black/70 text-white border-none backdrop-blur-md"
              onClick={(e) => { e.stopPropagation(); closePreview(); }}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Image Container */}
          <div 
            id="preview-container"
            className="w-full h-full flex items-center justify-center overflow-hidden p-8"
          >
            <img 
              src={data.imageUrl || undefined} 
              alt={data.name} 
              className="max-w-full max-h-full object-contain transition-transform duration-75 ease-out select-none"
              style={{
                transform: `translate(${previewPosition.x}px, ${previewPosition.y}px) scale(${previewScale})`,
                cursor: isPreviewDragging ? 'grabbing' : 'grab'
              }}
              draggable={false}
              onPointerDown={handlePreviewPointerDown}
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={handlePreviewPointerUp}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default memo(CharacterNode);
