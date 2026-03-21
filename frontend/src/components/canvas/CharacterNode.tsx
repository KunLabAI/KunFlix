
import React, { memo, useState, useRef, useCallback } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Trash2, Upload, AlertCircle, RefreshCw, Maximize, Minimize } from 'lucide-react';
import { useCanvasStore, CharacterNodeData, CanvasNode } from '@/store/useCanvasStore';
import { v4 as uuidv4 } from 'uuid';

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
    const currentFitMode = data.fitMode || 'cover';
    updateNodeData(id, { fitMode: currentFitMode === 'cover' ? 'contain' : 'cover' });
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
      // Use direct backend URL to bypass Next.js 10MB middleware proxy limit
      xhr.open('POST', 'http://127.0.0.1:8000/api/media/upload');
      
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

  return (
    <>
      <NodeResizer 
        color="#1890FF" 
        isVisible={selected} 
        minWidth={256} 
        minHeight={192}
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
        {/* 标题移到卡片外部 */}
        <div className="character-node__title mb-1 px-1 flex items-center justify-between gap-2 flex-shrink-0 min-h-[32px]">
          <div className="flex-1 min-w-0 nodrag flex items-center">
            {isEditingTitle ? (
              <Input
                ref={inputRef}
                value={editTitle}
                onChange={(e) => {
                  setEditTitle(e.target.value);
                  updateNodeData(id, { name: e.target.value });
                }}
                className="font-bold text-lg h-8 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-0 focus:outline-none px-0 shadow-none cursor-text select-text rounded-none leading-none"
                placeholder="未命名图片卡"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={handleTitleKeyDown}
                autoFocus
              />
            ) : (
              <h3 
                className="font-bold text-lg h-8 flex items-center truncate text-foreground/90 cursor-text select-text hover:text-primary leading-none" 
                title={data.name} 
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={handleTitleDoubleClick}
              >
                {data.name || '未命名图片卡'}
              </h3>
            )}
          </div>
        </div>

        <Card className={`flex-1 flex flex-col bg-card ${selected ? 'ring-2 ring-primary' : 'border border-border/50'} overflow-hidden relative z-[2] transition-shadow hover:shadow-lg`}>
          <CardContent 
            className="p-3 flex flex-col items-center justify-center relative custom-scrollbar flex-1 overflow-hidden" 
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
              <div className="w-full h-full flex flex-col items-center justify-center">
                <img 
                    src={data.imageUrl} 
                    alt={data.name} 
                    className={`w-full h-full rounded-sm nodrag ${data.fitMode === 'contain' ? 'object-contain' : 'object-cover'}`}
                    onLoad={handleImageLoad}
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

        {/* 悬浮操作按钮，底部外侧 */}
        <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 w-full flex justify-center pt-2 gap-2 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-30">
          <Button 
            variant="secondary" 
            size="icon" 
            className="h-8 w-8 rounded-full shadow-md hover:bg-secondary shrink-0 pointer-events-auto relative z-40" 
            onClick={handleToggleFitMode} 
            title={data.fitMode === 'contain' ? "填充卡片 (裁剪)" : "适应卡片 (留白)"} 
            aria-label="切换图片适配模式"
            role="button"
          >
            {data.fitMode === 'contain' ? <Maximize className="h-4 w-4" /> : <Minimize className="h-4 w-4" />}
          </Button>
          <Button 
            variant="secondary" 
            size="icon" 
            className="h-8 w-8 rounded-full shadow-md hover:bg-secondary shrink-0 pointer-events-auto relative z-40" 
            onClick={handleDuplicate} 
            title="创建副本" 
            aria-label="创建副本"
            role="button"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button 
            variant="secondary" 
            size="icon" 
            className="h-8 w-8 rounded-full shadow-md text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 pointer-events-auto relative z-40" 
            onClick={handleDelete} 
            title="删除" 
            aria-label="删除"
            role="button"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* 边缘拖拽热区样式 */}
        <style>{`
          .edge-handle-wrapper {
            position: absolute;
            z-index: 60;
            pointer-events: none;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
          }
          
          .edge-handle-wrapper.left {
            left: -10px; top: 10%; bottom: 10%; width: 20px;
          }
          .edge-handle-wrapper.right {
            right: -10px; top: 10%; bottom: 10%; width: 20px;
            z-index: 50;
          }

          .edge-handle-inner {
            position: absolute;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            z-index: 10;
            opacity: 0;
            transition: opacity 0.2s;
          }

          .edge-handle-wrapper.left .edge-handle-inner,
          .edge-handle-wrapper.right .edge-handle-inner {
            width: 6px; height: 24px;
          }

          .edge-handle-line {
            position: absolute;
            background: #1890FF;
            border-radius: 2px;
          }

          .edge-handle-wrapper.left .edge-handle-line,
          .edge-handle-wrapper.right .edge-handle-line {
            width: 2px; height: 100%;
            background: #1890FF;
          }

          .edge-handle-dot {
            width: 8px;
            height: 8px;
            background: #1890FF;
            border-radius: 50%;
            box-shadow: 0 0 4px #1890FF40;
            position: absolute;
            z-index: 25;
          }

          .character-node-wrapper:hover .edge-handle-inner,
          .edge-handle-wrapper:hover .edge-handle-inner {
            opacity: 1 !important;
          }

          .edge-handle-wrapper .react-flow__handle {
            width: 100% !important;
            height: 100% !important;
            background: transparent !important;
            border: none !important;
            min-width: unset !important;
            min-height: unset !important;
            border-radius: 0 !important;
            transform: none !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            pointer-events: auto !important;
            z-index: 30 !important;
          }

          .edge-handle-wrapper:hover .react-flow__handle,
          .edge-handle-wrapper .react-flow__handle:hover,
          .group:hover .react-flow__handle {
            background: transparent !important;
          }
          
          /* Highlight active connection handles */
          .react-flow__handle-connecting {
            background: #1890FF !important;
            border: 2px solid #fff !important;
            opacity: 1 !important;
          }
        `}</style>

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
    </>
  );
};

export default memo(CharacterNode);
