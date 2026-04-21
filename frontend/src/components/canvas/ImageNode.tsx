
import React, { memo, useState, useRef, useCallback, useMemo } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Trash2, Upload, AlertCircle, RefreshCw, X, ZoomIn, ZoomOut, Quote, Image as ImageIcon, Plus, FolderOpen, Loader2, ImageDown } from 'lucide-react';
import { useCanvasStore, CharacterNodeData, CanvasNode } from '@/store/useCanvasStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';
import { useResourceStore } from '@/store/useResourceStore';
import NodeEffectOverlay from './NodeEffectOverlay';
import { NodeToolbar, ToolbarAction } from './NodeToolbar';
import { v4 as uuidv4 } from 'uuid';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toPng } from 'html-to-image';

const MAX_IMAGES = 9;

// 根据图片数量计算网格布局
function getGridLayout(count: number): { cols: number; rows: number; spans?: number[][] } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 2, rows: 2, spans: [[0, 2], [1, 1], [1, 1]] };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

const CharacterNode = ({ id, data, selected }: NodeProps<Node<CharacterNodeData>>) => {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const updateNodeDimensions = useCanvasStore((state) => state.updateNodeDimensions);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const addNode = useCanvasStore((state) => state.addNode);
  const onConnect = useCanvasStore((state) => state.onConnect);
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
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const addMenuRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const exportCascadeRef = useRef<HTMLDivElement>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 导出级联按钮失焦关闭
  React.useEffect(() => {
    if (!showExportDialog) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        exportCascadeRef.current && !exportCascadeRef.current.contains(target) &&
        !target.closest('[data-node-toolbar]')
      ) {
        setShowExportDialog(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showExportDialog]);

  // 兼容处理：统一为 imageList 数组
  const imageList = useMemo(() => {
    if (data.images && data.images.length > 0) return data.images;
    if (data.imageUrl) return [data.imageUrl];
    return [];
  }, [data.images, data.imageUrl]);

  const isFull = imageList.length >= MAX_IMAGES;

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
    if (confirm(t('canvas.node.deleteConfirm.image'))) {
      deleteNode(id);
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    if (node) {
      const currentData = node.data as CharacterNodeData;
      const currentName = currentData.name || t('canvas.node.unnamedImageCard');
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
          name: t('canvas.node.copySuffix', { name: currentName }),
          uploading: false,
        },
      };
      addNode(newNode);
    }
  };

  const handleReference = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 取第一张图片作为缩略图
    let imageUrl = imageList[0] || '';
    const needsPrefix = imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('/api/media/') && !imageUrl.startsWith('data:');
    needsPrefix && (imageUrl = `/api/media/${imageUrl}`);
    
    const store = useAIAssistantStore.getState();
    const isReferenced = store.nodeAttachments.some(a => a.nodeId === id);
    
    if (isReferenced) {
      store.removeNodeAttachment(id);
    } else {
      store.addNodeAttachment({
        nodeId: id,
        nodeType: 'image',
        label: data.name || t('canvas.node.unnamedImageCard'),
        excerpt: data.description || '',
        thumbnailUrl: imageUrl,
        meta: {},
      });
      store.setIsOpen(true);
    }
  };

  // 检查节点是否已被引用
  const isReferenced = useAIAssistantStore((state) => state.nodeAttachments.some(a => a.nodeId === id));

  // 点击 + 按钮显示添加菜单
  const handleAddClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isFull) return;
    setShowAddMenu(prev => !prev);
  };

  const handleUploadClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isFull) return;
    setShowAddMenu(false);
    fileInputRef.current?.click();
  };

  const handlePickFromLibrary = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(false);
    setShowAssetPicker(true);
    // 加载资产库图片
    useResourceStore.getState().fetchAssets({ pageSize: 100, typeFilter: 'image' });
  };

  // 从资产库选择图片添加到多宫格
  const handleSelectAsset = (assetUrl: string) => {
    const currentData = useCanvasStore.getState().nodes.find(n => n.id === id)?.data as CharacterNodeData;
    const currentImages = currentData?.images || imageList;
    if (currentImages.length >= MAX_IMAGES) return;
    const newImages = [...currentImages, assetUrl];
    updateNodeData(id, { images: newImages, imageUrl: newImages[0] });
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

  // 多宫格导出：截图网格区域，上传，创建新节点并连线
  const handleExportGrid = async (pixelRatio: number = 2) => {
    if (!gridContainerRef.current || imageList.length < 2 || isExporting) return;

    setShowExportDialog(false);
    setIsExporting(true);
    try {
      // 1. 截图网格区域
      const dataUrl = await toPng(gridContainerRef.current, {
        cacheBust: true,
        pixelRatio,
      });

      // 2. 转换为 Blob 再转 File
      const resp = await fetch(dataUrl);
      const blob = await resp.blob();
      const file = new File([blob], `grid-export-${Date.now()}.png`, { type: 'image/png' });

      // 3. 上传到服务器
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/media/upload');
      const token = localStorage.getItem('access_token');
      token && xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      const uploadResult = await new Promise<{ url?: string; error?: string }>((resolve, reject) => {
        xhr.onload = () => {
          try {
            const res = JSON.parse(xhr.responseText);
            xhr.status >= 200 && xhr.status < 300 ? resolve(res) : resolve({ error: res?.error || `HTTP ${xhr.status}` });
          } catch {
            resolve({ error: `解析响应失败` });
          }
        };
        xhr.onerror = () => reject(new Error('网络错误'));
        xhr.send(formData);
      });

      if (uploadResult.error) throw new Error(uploadResult.error);

      // 4. 创建新的图像节点（放在当前节点右侧）
      const currentNode = getNode(id);
      const nodeWidth = currentNode?.width ?? 512;
      const newNodeId = `image-${uuidv4()}`;
      const exportName = t('canvas.node.upload.exportName', { name: data.name || t('canvas.node.unnamedImageCard') });

      const newNode: CanvasNode = {
        id: newNodeId,
        type: 'image',
        position: {
          x: (currentNode?.position.x ?? 0) + nodeWidth + 80,
          y: currentNode?.position.y ?? 0,
        },
        width: 512,
        height: 384,
        data: {
          name: exportName,
          description: '',
          imageUrl: uploadResult.url,
          images: [uploadResult.url!],
          uploading: false,
        } as CharacterNodeData,
      };

      addNode(newNode);

      // 5. 自动连线：当前节点 right-source -> 新节点 left-target
      onConnect({
        source: id,
        sourceHandle: 'right-source',
        target: newNodeId,
        targetHandle: 'left-target',
      });
    } catch (err: any) {
      console.error('Export grid error:', err);
      setUploadError(err.message || t('canvas.node.upload.uploadFailed'));
    } finally {
      setIsExporting(false);
    }
  };

  // 删除单张图片
  const handleRemoveImage = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newImages = [...imageList];
    newImages.splice(index, 1);
    updateNodeData(id, { images: newImages, imageUrl: newImages[0] || null });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    // 计算可添加的数量
    const slotsAvailable = MAX_IMAGES - imageList.length;
    const filesToUpload = files.slice(0, slotsAvailable);

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    
    for (const file of filesToUpload) {
      if (!validTypes.includes(file.type)) {
        setUploadError(t('canvas.node.upload.imageFormatError'));
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        setUploadError(t('canvas.node.upload.imageSizeError'));
        continue;
      }

      setUploadError(null);
      setUploadProgress(0);
      
      const objectUrl = URL.createObjectURL(file);
      // 先用本地预览追加
      const currentImages = [...(useCanvasStore.getState().nodes.find(n => n.id === id)?.data as CharacterNodeData)?.images || imageList];
      const previewImages = [...currentImages, objectUrl];
      updateNodeData(id, { images: previewImages, imageUrl: previewImages[0], uploading: true });

      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/media/upload');
        
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

        // 上传成功，替换 objectUrl 为服务器URL
        const latestData = (useCanvasStore.getState().nodes.find(n => n.id === id)?.data as CharacterNodeData);
        const latestImages = latestData?.images || [];
        const updatedImages = latestImages.map(url => url === objectUrl ? (response.url || url) : url);
        updateNodeData(id, { images: updatedImages, imageUrl: updatedImages[0], uploading: false });
      } catch (error: any) {
        console.error('Upload error:', error);
        setUploadError(error.message || t('canvas.node.upload.uploadFailed'));
        // 移除失败的预览图
        const latestData = (useCanvasStore.getState().nodes.find(n => n.id === id)?.data as CharacterNodeData);
        const latestImages = (latestData?.images || []).filter(url => url !== objectUrl);
        updateNodeData(id, { images: latestImages, imageUrl: latestImages[0] || null, uploading: false });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isUploading = data.uploading;

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    // 仅在单图模式下自动调整节点尺寸
    if (imageList.length > 1) return;
    
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      const MAX_SIZE = 512;
      const aspectRatio = img.naturalWidth / img.naturalHeight;
      
      let newWidth, newHeight;
      if (aspectRatio > 1) {
        newWidth = Math.min(img.naturalWidth, MAX_SIZE);
        newHeight = newWidth / aspectRatio;
      } else {
        newHeight = Math.min(img.naturalHeight, MAX_SIZE);
        newWidth = newHeight * aspectRatio;
      }
      
      newWidth = Math.max(newWidth, 256);
      newHeight = Math.max(newHeight, 192);

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
    if (e.button !== 0) return;
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
    setTimeout(() => {
      setPreviewScale(1);
      setPreviewPosition({ x: 0, y: 0 });
    }, 300);
  };

  const openPreview = (url: string) => {
    setPreviewImageUrl(url);
    setPreviewOpen(true);
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

  // 渲染多宫格内容
  const renderGridImages = () => {
    const count = imageList.length;
    const layout = getGridLayout(count);
    
    // 单图模式
    if (count === 1) {
      return (
        <div className="w-full h-full flex items-center justify-center relative group/img">
          <img 
            src={imageList[0]} 
            alt={data.name} 
            className="w-full h-full object-contain"
            onLoad={handleImageLoad}
            onPointerDown={(e) => e.stopPropagation()}
          />
          <div 
            className="absolute inset-0 cursor-grab active:cursor-grabbing z-10"
            title={t('canvas.node.preview.dragOrFullscreen')}
            onDoubleClick={(e) => {
              e.stopPropagation();
              openPreview(imageList[0]);
            }}
          />
          {/* hover 删除按钮 */}
          <button
            className="absolute top-1 right-1 z-20 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-destructive"
            onClick={(e) => handleRemoveImage(0, e)}
            title={t('canvas.node.toolbar.delete')}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    }

    // 多图网格模式
    // 3张图特殊布局: 第一张占满第一行，下面两张各占一半
    if (count === 3) {
      return (
        <div className="w-full h-full grid grid-rows-2 gap-0.5">
          <div className="relative group/img overflow-hidden">
            <img 
              src={imageList[0]} 
              alt={`${data.name}-1`} 
              className="w-full h-full object-cover"
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => { e.stopPropagation(); openPreview(imageList[0]); }}
            />
            <button
              className="absolute top-1 right-1 z-20 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-destructive"
              onClick={(e) => handleRemoveImage(0, e)}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-0.5">
            {imageList.slice(1).map((url, i) => (
              <div key={i + 1} className="relative group/img overflow-hidden">
                <img 
                  src={url} 
                  alt={`${data.name}-${i + 2}`} 
                  className="w-full h-full object-cover"
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => { e.stopPropagation(); openPreview(url); }}
                />
                <button
                  className="absolute top-1 right-1 z-20 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-destructive"
                  onClick={(e) => handleRemoveImage(i + 1, e)}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // 通用网格布局
    const gridClass = `grid gap-0.5 w-full h-full`;
    const style: React.CSSProperties = {
      gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
      gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
    };

    return (
      <div className={gridClass} style={style}>
        {imageList.map((url, i) => (
          <div key={i} className="relative group/img overflow-hidden">
            <img 
              src={url} 
              alt={`${data.name}-${i + 1}`} 
              className="w-full h-full object-cover"
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => { e.stopPropagation(); openPreview(url); }}
            />
            <button
              className="absolute top-1 right-1 z-20 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-destructive"
              onClick={(e) => handleRemoveImage(i, e)}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    );
  };

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
        multiple
        onChange={handleFileChange}
        aria-label={t('canvas.node.upload.uploadImage')}
        data-testid="file-upload-input"
      />

      <div 
        ref={nodeRef}
        className={`character-node-wrapper w-full h-full flex flex-col group relative ${isUploading ? 'nodrag' : ''}`}
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
                placeholder={t('canvas.node.unnamedImageCard')}
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
                <ImageIcon className="w-4 h-4 text-node-green mr-2 shrink-0" />
                {data.name || t('canvas.node.unnamedImageCard')}
              </h3>
            )}
          </div>
          {/* 分辨率信息（仅单图） */}
          {imageDimensions && imageList.length === 1 && (
            <div className="text-xs font-medium text-muted-foreground/60 flex-shrink-0 select-none">
              {imageDimensions.width}×{imageDimensions.height}
            </div>
          )}
          {/* 多图数量 */}
          {imageList.length > 1 && (
            <div className="text-xs font-medium text-muted-foreground/60 flex-shrink-0 select-none">
              {imageList.length}/{MAX_IMAGES}
            </div>
          )}
        </div>

        <Card className={`w-full h-full flex flex-col bg-card ${selected ? 'ring-2 ring-primary' : 'border border-border/50'} overflow-hidden relative z-[2]`}>
          <CardContent 
            className="flex flex-col items-center justify-center relative custom-scrollbar flex-1 p-0 overflow-hidden" 
          >
            {imageList.length === 0 && !isUploading && !uploadError && (
              <div className="flex flex-col items-center gap-2">
                <Button 
                  onClick={handleUploadClick} 
                  variant="default" 
                  role="button" 
                  aria-label={t('canvas.node.upload.uploadImage')}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {t('canvas.node.upload.uploadImage')}
                </Button>
                <Button
                  onClick={handlePickFromLibrary}
                  variant="outline"
                  size="sm"
                  role="button"
                  aria-label={t('canvas.node.upload.fromLibrary')}
                >
                  <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                  {t('canvas.node.upload.fromLibrary')}
                </Button>
              </div>
            )}

            {imageList.length > 0 && (
              <div ref={gridContainerRef} className="w-full h-full">
                {renderGridImages()}
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
          className={(showAddMenu || showExportDialog || isExporting) ? '!opacity-100 !pointer-events-auto !translate-y-0' : undefined}
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
              title: isFull ? t('canvas.node.upload.maxReached', { max: MAX_IMAGES }) : t('canvas.node.upload.addImage'),
              disabled: isFull,
            },
            ...(imageList.length >= 2 ? [{
              icon: <ImageDown className="h-3.5 w-3.5" />,
              onClick: (e: React.MouseEvent) => { e.stopPropagation(); setShowExportDialog(prev => !prev); },
              title: isExporting ? t('canvas.node.upload.exporting') : t('canvas.node.upload.exportGrid'),
              disabled: isExporting,
            }] : []),
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

        {/* 添加图片级联按钮 */}
        {showAddMenu && !isFull && (
          <div
            ref={addMenuRef}
            className="absolute left-1/2 -translate-x-1/2 flex items-center bg-background/95 backdrop-blur-md border border-border/60 rounded-full px-1 py-1 shadow-lg pointer-events-auto nodrag animate-in fade-in zoom-in-95 duration-150 z-30"
            style={{ bottom: '-100px' }}
          >
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              onClick={(e) => { e.stopPropagation(); handleUploadClick(e); }}
              title={t('canvas.node.upload.uploadImage')}
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

        {/* 导出清晰度级联按钮 */}
        {showExportDialog && !isExporting && imageList.length >= 2 && (
          <div
            ref={exportCascadeRef}
            className="absolute left-1/2 -translate-x-1/2 flex items-center bg-background/95 backdrop-blur-md border border-border/60 rounded-full px-1 py-1 shadow-lg pointer-events-auto nodrag animate-in fade-in zoom-in-95 duration-150 z-30"
            style={{ bottom: '-100px' }}
          >
            <button
              className="px-3 py-1 text-xs font-bold rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              onClick={(e) => { e.stopPropagation(); handleExportGrid(3); }}
              title={t('canvas.node.upload.exportRatioHigh')}
            >
              3X
            </button>
            <div className="w-px h-4 bg-border/50" />
            <button
              className="px-3 py-1 text-xs font-bold rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              onClick={(e) => { e.stopPropagation(); handleExportGrid(4); }}
              title={t('canvas.node.upload.exportRatioMax')}
            >
              4X
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
        <AssetPickerDialog
          imageList={imageList}
          maxImages={MAX_IMAGES}
          onSelect={handleSelectAsset}
          onClose={() => setShowAssetPicker(false)}
          t={t}
        />,
        document.body
      )}


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
              src={previewImageUrl || undefined} 
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



// ============================================================
// 子组件：资产库选择弹窗
// ============================================================
interface AssetPickerDialogProps {
  imageList: string[];
  maxImages: number;
  onSelect: (url: string) => void;
  onClose: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function AssetPickerDialog({ imageList, maxImages, onSelect, onClose, t }: AssetPickerDialogProps) {
  const assets = useResourceStore((s) => s.assets);
  const isLoading = useResourceStore((s) => s.isLoading);
  const imageAssets = useMemo(() => assets.filter(a => a.file_type === 'image'), [assets]);
  const slotsLeft = maxImages - imageList.length;

  // ESC 关闭
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
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-node-green" />
            <span className="text-sm font-semibold">{t('canvas.node.upload.fromLibrary')}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {t('canvas.node.upload.slotsLeft', { count: slotsLeft })}
            </span>
            <button
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && imageAssets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <ImageIcon className="w-10 h-10 mb-3 opacity-20" />
              <span className="text-sm">{t('sidebar.noImages')}</span>
            </div>
          )}

          {!isLoading && imageAssets.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {imageAssets.map((asset) => {
                const alreadyAdded = imageList.includes(asset.url);
                const isDisabled = alreadyAdded || slotsLeft <= 0;
                return (
                  <button
                    key={asset.id}
                    disabled={isDisabled}
                    onClick={() => {
                      onSelect(asset.url);
                    }}
                    className={`relative group rounded-lg border overflow-hidden aspect-square transition-all ${
                      isDisabled
                        ? 'opacity-40 cursor-not-allowed border-border/30'
                        : 'border-border/50 hover:border-node-green/60 hover:ring-1 hover:ring-node-green/30 cursor-pointer'
                    }`}
                  >
                    <img
                      src={asset.url}
                      alt={asset.original_name || asset.filename}
                      loading="lazy"
                      draggable={false}
                      className="w-full h-full object-cover"
                    />
                    {alreadyAdded && (
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


