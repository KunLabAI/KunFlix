import React, { memo, useState, useRef, useMemo } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Trash2, Upload, AlertCircle, RefreshCw, Maximize, Minimize, Film, Quote, Plus, FolderOpen, Loader2, X } from 'lucide-react';
import { useCanvasStore, VideoNodeData, CanvasNode } from '@/store/useCanvasStore';
import { useResourceStore } from '@/store/useResourceStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';
import NodeEffectOverlay from './NodeEffectOverlay';
import { NodeToolbar, ToolbarAction } from './NodeToolbar';
import { v4 as uuidv4 } from 'uuid';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const VideoNode = ({ id, data, selected }: NodeProps<Node<VideoNodeData>>) => {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const updateNodeDimensions = useCanvasStore((state) => state.updateNodeDimensions);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const addNode = useCanvasStore((state) => state.addNode);
  const { getNode } = useReactFlow();

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(data.name || '');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

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
    if (confirm(t('canvas.node.deleteConfirm.video'))) {
      deleteNode(id);
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    if (node) {
      const currentData = node.data as VideoNodeData;
      const currentName = currentData.name || t('canvas.node.unnamedVideoCard');
      const newNode: CanvasNode = {
        ...(node as CanvasNode),
        id: `video-${uuidv4()}`,
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
        selected: false,
        data: {
          ...currentData,
          name: t('canvas.node.copySuffix', { name: currentName }),
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

  const handleReference = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 确保 videoUrl 是完整的 /api/media/ 路径
    let videoUrl = data.videoUrl || '';
    const needsPrefix = videoUrl && !videoUrl.startsWith('http') && !videoUrl.startsWith('/api/media/') && !videoUrl.startsWith('data:');
    needsPrefix && (videoUrl = `/api/media/${videoUrl}`);
    
    // 检查节点是否已在附件中
    const store = useAIAssistantStore.getState();
    const isReferenced = store.nodeAttachments.some(a => a.nodeId === id);
    
    if (isReferenced) {
      // 已引用则撤销引用
      store.removeNodeAttachment(id);
    } else {
      // 未引用则添加引用
      store.addNodeAttachment({
        nodeId: id,
        nodeType: 'video',
        label: data.name || t('canvas.node.unnamedVideoCard'),
        excerpt: data.description || '',
        thumbnailUrl: videoUrl,
        meta: {},
      });
      store.setIsOpen(true);
    }
  };

  // 检查节点是否已被引用
  const isReferenced = useAIAssistantStore((state) => state.nodeAttachments.some(a => a.nodeId === id));

  const handleUploadClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(false);
    fileInputRef.current?.click();
  };

  const handleAddClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(prev => !prev);
  };

  const handlePickFromLibrary = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(false);
    setShowAssetPicker(true);
    useResourceStore.getState().fetchAssets({ pageSize: 100, typeFilter: 'video' });
  };

  const handleSelectAsset = (assetUrl: string) => {
    updateNodeData(id, { videoUrl: assetUrl, uploading: false } as Partial<VideoNodeData>);
    setShowAssetPicker(false);
  };

  // 添加菜单级联按钮失焦关闭
  React.useEffect(() => {
    if (!showAddMenu) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        addMenuRef.current && !addMenuRef.current.contains(target) &&
        !target.closest('[data-node-toolbar]')
      ) {
        setShowAddMenu(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showAddMenu]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type and size (500MB max for video)
    const validTypes = ['video/mp4', 'video/webm', 'video/ogg'];
    if (!validTypes.includes(file.type)) {
      setUploadError(t('canvas.node.upload.videoFormatError'));
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setUploadError(t('canvas.node.upload.videoSizeError'));
      return;
    }

    setUploadError(null);
    setUploadProgress(0);
    
    // Set local preview & uploading state
    const objectUrl = URL.createObjectURL(file);
    updateNodeData(id, { videoUrl: objectUrl, uploading: true } as Partial<VideoNodeData>);

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

      const response = await new Promise<{ url?: string; error?: string; asset?: Record<string, unknown> }>((resolve, reject) => {
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

      // Success: 更新节点数据并同步到资源库
      updateNodeData(id, { videoUrl: response.url, uploading: false } as Partial<VideoNodeData>);
      
      // 同步新资源到 resourceStore（让侧边栏实时显示）
      response.asset && useResourceStore.getState().syncAssetFromUpload(response.asset);
    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadError(error.message || t('canvas.node.upload.uploadFailed'));
      updateNodeData(id, { uploading: false });
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const isUploading = data.uploading;

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.videoWidth && video.videoHeight) {
      // Calculate new dimensions while keeping a reasonable max size (e.g. 512px max width/height)
      const MAX_SIZE = 512;
      const aspectRatio = video.videoWidth / video.videoHeight;
      
      let newWidth, newHeight;
      if (aspectRatio > 1) {
        // Landscape
        newWidth = Math.min(video.videoWidth, MAX_SIZE);
        newHeight = newWidth / aspectRatio;
      } else {
        // Portrait or Square
        newHeight = Math.min(video.videoHeight, MAX_SIZE);
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
        color="#6d6d6d" 
        isVisible={selected} 
        minWidth={256}
        minHeight={200}
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
        accept=".mp4,.webm,.ogg" 
        onChange={handleFileChange}
        aria-label={t('canvas.node.upload.uploadVideo')}
        data-testid="file-upload-input"
      />

      <div 
        ref={nodeRef}
        className={`video-node-wrapper w-full h-full flex flex-col group relative ${isUploading ? 'nodrag' : ''}`}
      >
        <NodeEffectOverlay nodeId={id} />
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
                placeholder={t('canvas.node.unnamedVideoCard')}
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
                <Film className="w-4 h-4 text-node-yellow mr-2 shrink-0" />
                {data.name || t('canvas.node.unnamedVideoCard')}
              </h3>
            )}
          </div>
        </div>

        <Card className={`w-full h-full flex flex-col bg-card ${selected ? 'ring-2 ring-primary' : 'border border-border/50'} overflow-hidden relative z-[2]`}>
          <CardContent 
            className="flex flex-col items-center justify-center relative custom-scrollbar flex-1 p-0 overflow-hidden" 
          >
            {!data.videoUrl && !isUploading && !uploadError && (
              <div className="flex flex-col items-center justify-center gap-1 py-8">
                <Film className="w-12 h-12 text-muted-foreground/10" />
              </div>
            )}

            {data.videoUrl && (
              <div className="w-full h-full flex flex-col items-center justify-center relative group/video">
                {/* 
                  视频区域交互策略：
                  - <video> 标签保持 nodrag，确保点击控件正常工作
                  - 上方覆盖一层绝对定位的透明拖拽遮罩，占据视频除底部控件外的绝大部分区域
                  - 底部保留约 50px 供控件使用
                */}
                <video 
                  src={data.videoUrl} 
                  controls
                  className={`w-full h-full rounded-sm nodrag ${data.fitMode === 'cover' ? 'object-cover' : 'object-contain'}`} 
                  onPointerDown={(e) => e.stopPropagation()} 
                  onLoadedMetadata={handleLoadedMetadata}
                />
                
                {/* 顶部/中部拖拽遮罩：不含 nodrag，透明，鼠标移入时不影响视觉但能被拖拽 */}
                <div 
                  className="absolute top-0 left-0 w-full h-[calc(100%-50px)] cursor-grab active:cursor-grabbing z-10"
                  title={t('canvas.node.video.dragToMove')}
                  // 不加 e.stopPropagation() 从而允许 React Flow 接管拖拽
                  // 双击穿透到下方的卡片，这里也可以处理一下双击播放暂停（如果需要）
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
                  aria-label={t('canvas.node.upload.retry')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleUploadClick();
                    }
                  }}
                >
                  <RefreshCw className="w-3 h-3 mr-2" /> {t('canvas.node.upload.retry')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 工具条 */}
        <NodeToolbar
          className={showAddMenu ? '!opacity-100 !pointer-events-auto !translate-y-0' : undefined}
          actions={[
            {
              icon: <Quote className="h-3.5 w-3.5" />,
              onClick: handleReference,
              title: isReferenced ? t('canvas.node.toolbar.unreference') : t('canvas.node.toolbar.reference'),
              variant: isReferenced ? 'primary' : undefined,
            },
            {
              icon: <Plus className="h-3.5 w-3.5" />,
              onClick: handleAddClick,
              title: t('canvas.node.upload.addVideo'),
            },
            {
              icon: data.fitMode === 'cover' ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />,
              onClick: handleToggleFitMode,
              title: data.fitMode === 'cover' ? t('canvas.node.toolbar.fitContain') : t('canvas.node.toolbar.fitCover'),
            },
            {
              icon: <Copy className="h-3.5 w-3.5" />,
              onClick: handleDuplicate,
              title: t('canvas.node.toolbar.duplicate'),
            },
            {
              icon: <Trash2 className="h-3.5 w-3.5" />,
              onClick: handleDelete,
              title: t('canvas.node.toolbar.delete'),
              variant: 'danger',
            },
          ] as ToolbarAction[]}
        />

        {/* 添加视频级联按钮 */}
        {showAddMenu && (
          <div
            ref={addMenuRef}
            className="absolute left-1/2 -translate-x-1/2 flex items-center bg-background/95 backdrop-blur-md border border-border/60 rounded-full px-1 py-1 shadow-lg pointer-events-auto nodrag animate-in fade-in zoom-in-95 duration-150 z-30"
            style={{ bottom: '-100px' }}
          >
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              onClick={(e) => { e.stopPropagation(); handleUploadClick(e); }}
              title={t('canvas.node.upload.uploadVideo')}
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-border/50" />
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              onClick={(e) => { e.stopPropagation(); handlePickFromLibrary(e); }}
              title={t('canvas.node.upload.fromLibrary')}
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

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

      {/* 资产库选择弹窗 */}
      {showAssetPicker && typeof document !== 'undefined' && createPortal(
        <VideoAssetPickerDialog
          currentUrl={data.videoUrl || ''}
          onSelect={handleSelectAsset}
          onClose={() => setShowAssetPicker(false)}
          t={t}
        />,
        document.body
      )}
    </>
  );
};

export default memo(VideoNode);

// ============================================================
// 子组件：视频资产库选择弹窗
// ============================================================
interface VideoAssetPickerDialogProps {
  currentUrl: string;
  onSelect: (url: string) => void;
  onClose: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function VideoAssetPickerDialog({ currentUrl, onSelect, onClose, t }: VideoAssetPickerDialogProps) {
  const assets = useResourceStore((s) => s.assets);
  const isLoading = useResourceStore((s) => s.isLoading);
  const videoAssets = useMemo(() => assets.filter(a => a.file_type === 'video'), [assets]);

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { e.key === 'Escape' && onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border/50 rounded-xl w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden shadow-xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-node-yellow" />
            <span className="text-sm font-semibold">{t('canvas.node.upload.fromLibrary')}</span>
          </div>
          <button
            className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && videoAssets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Film className="w-10 h-10 mb-3 opacity-20" />
              <span className="text-sm">{t('sidebar.noVideos')}</span>
            </div>
          )}

          {!isLoading && videoAssets.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {videoAssets.map((asset) => {
                const isSelected = currentUrl === asset.url;
                return (
                  <button
                    key={asset.id}
                    disabled={isSelected}
                    onClick={() => onSelect(asset.url)}
                    className={`relative group rounded-lg border overflow-hidden aspect-video transition-all ${
                      isSelected
                        ? 'opacity-40 cursor-not-allowed border-border/30'
                        : 'border-border/50 hover:border-node-yellow/60 hover:ring-1 hover:ring-node-yellow/30 cursor-pointer'
                    }`}
                  >
                    <video
                      src={asset.url}
                      className="w-full h-full object-cover"
                      preload="metadata"
                      muted
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-muted-foreground">{t('canvas.node.upload.alreadyAdded')}</span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-black/50 backdrop-blur-sm p-1 translate-y-full group-hover:translate-y-0 transition-transform">
                      <span className="text-[10px] text-white font-medium truncate block">
                        {asset.original_name || asset.filename}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}