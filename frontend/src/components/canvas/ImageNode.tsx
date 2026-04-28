
import React, { memo, useState, useRef, useCallback, useMemo, useEffect, type DragEvent } from 'react';
import { Handle, Position, NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Trash2, Upload, AlertCircle, RefreshCw, X, ZoomIn, ZoomOut, Quote, Image as ImageIcon, Plus, FolderOpen, Loader2, ImageDown, Pin, PinOff } from 'lucide-react';
import { useCanvasStore, CharacterNodeData, CanvasNode, ImageGenHistoryEntry } from '@/store/useCanvasStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';
import { useResourceStore } from '@/store/useResourceStore';
import NodeEffectOverlay from './NodeEffectOverlay';
import { NodeToolbar, ToolbarAction } from './NodeToolbar';
import { v4 as uuidv4 } from 'uuid';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toPng } from 'html-to-image';
import { cn } from '@/lib/utils';
import ImageGeneratePanel from './ImageGeneratePanel';
import { useImageGenerationTask, type ImageCreateParams } from '@/hooks/useImageGeneration';

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
  const canvasNodes = useCanvasStore((state) => state.nodes);
  const { getNode, getEdges, screenToFlowPosition } = useReactFlow();

  // ── AI 图像生成任务（同步，无轮询） ──
  const imageTask = useImageGenerationTask();
  const taskActive = imageTask.isSubmitting;
  const taskDone = imageTask.isCompleted;
  const taskFailed = imageTask.isFailed;

  // 生成中实时计时（每 100ms 刷新）
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const start = imageTask.startedAt;
    !start && setElapsedMs(0);
    const tick = () => start && setElapsedMs(Date.now() - start);
    tick();
    const id = start ? setInterval(tick, 100) : null;
    return () => { id && clearInterval(id); };
  }, [imageTask.startedAt]);

  const prevImagesRef = useRef<string[]>([]);
  const lastSubmitParamsRef = useRef<ImageCreateParams | null>(null);

  // ── 自动连线：将被选为参考图的源节点连到当前图像节点 ──
  const handleLinkNode = useCallback((sourceNodeId: string) => {
    const edges = getEdges();
    const alreadyLinked = edges.some((e) => e.source === sourceNodeId && e.target === id);
    alreadyLinked || useCanvasStore.getState().onConnect({
      source: sourceNodeId,
      sourceHandle: 'right-source',
      target: id,
      targetHandle: 'left-target',
    });
  }, [id, getEdges]);

  const handleUnlinkNode = useCallback((sourceNodeId: string) => {
    const edges = getEdges();
    const edge = edges.find((e) => e.source === sourceNodeId && e.target === id);
    edge && useCanvasStore.getState().deleteEdge(edge.id);
  }, [id, getEdges]);

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

  // ── 自动应用生成结果到当前节点，并累计到 generatedImages 历史 ──
  useEffect(() => {
    const res = imageTask.result;
    (res && imageTask.isCompleted) && (() => {
      const sp = lastSubmitParamsRef.current;
      const urls = res.images || [];
      urls.length === 0 || (() => {
        const createdAt = new Date().toISOString();
        const newEntries: ImageGenHistoryEntry[] = urls.map((url) => ({
          url,
          prompt: res.prompt || sp?.prompt,
          model: res.model || sp?.model,
          provider_id: res.provider_id || sp?.provider_id,
          aspect_ratio: sp?.config?.aspect_ratio,
          quality: sp?.config?.quality,
          batch_count: sp?.config?.batch_count,
          output_format: sp?.config?.output_format,
          createdAt,
        }));
        // 累计历史（去重）
        const prevHist = data.generatedImages || [];
        const existing = new Set(prevHist.map(e => e.url));
        const merged = [...newEntries.filter(e => !existing.has(e.url)), ...prevHist];

        // 自动替换当前节点的图像（受 MAX_IMAGES=9 约束；多次生成采用替换而非追加）
        const nextImages = urls.slice(0, MAX_IMAGES);

        updateNodeData(id, {
          generatedImages: merged,
          images: nextImages,
          imageUrl: nextImages[0] || null,
          uploading: false,
        } as Partial<CharacterNodeData>);
      })();
    })();
  }, [imageTask.isCompleted, imageTask.result]);

  const handleImageSubmit = useCallback((params: ImageCreateParams) => {
    // 保存生成前的完整图像数组，便于“应用到下一节点”时恢复本节点
    prevImagesRef.current = data.images || (data.imageUrl ? [data.imageUrl] : []);
    lastSubmitParamsRef.current = params;
    imageTask.submit(params).catch(() => { /* error handled via hook */ });
  }, [data.images, data.imageUrl, imageTask]);

  const handleApplyToNode = useCallback(() => {
    // 已在 effect 中自动合并，这里仅 reset
    imageTask.reset();
  }, [imageTask]);

  // 生成结果应用到下一个节点（已连接的下游 image 节点或新建）
  const handleApplyToNextNode = useCallback(() => {
    const urls = imageTask.result?.images || [];
    urls.length === 0 && imageTask.reset();
    urls.length > 0 && (() => {
      // 从当前节点回滚刚刚自动替换的生成图，恢复到生成前的完整图像数组
      const restored = prevImagesRef.current;
      updateNodeData(id, {
        images: restored,
        imageUrl: restored[0] || null,
      } as Partial<CharacterNodeData>);

      // 查找已连接的下游节点
      const edges = getEdges();
      const outEdge = edges.find((e) => e.source === id);
      const targetNode = outEdge ? getNode(outEdge.target) : null;
      const isCharTarget = targetNode?.type === 'image';

      const targetId = isCharTarget ? targetNode!.id : `image-${uuidv4()}`;
      const existingImgs = (isCharTarget ? (targetNode!.data as CharacterNodeData)?.images : []) || [];
      const slotsAvailable = MAX_IMAGES - existingImgs.length;
      const urlsToApply = urls.slice(0, Math.max(0, slotsAvailable));
      const nextImages = [...existingImgs, ...urlsToApply];

      isCharTarget && updateNodeData(targetId, {
        images: nextImages,
        imageUrl: nextImages[0] || null,
      } as Partial<CharacterNodeData>);

      isCharTarget || (() => {
        const currentNode = getNode(id);
        const posX = (currentNode?.position.x ?? 0) + (currentNode?.measured?.width ?? 300) + 80;
        const posY = currentNode?.position.y ?? 0;
        const newNode: CanvasNode = {
          id: targetId,
          type: 'image',
          position: { x: posX, y: posY },
          width: 512,
          height: 384,
          data: {
            name: t('canvas.node.image.aiGenerated', 'AI 生成图像'),
            description: '',
            images: urlsToApply,
            imageUrl: urlsToApply[0] || null,
            uploading: false,
          } as CharacterNodeData,
        };
        addNode(newNode);
        onConnect({
          source: id,
          sourceHandle: 'right-source',
          target: targetId,
          targetHandle: 'left-target',
        });
      })();

      imageTask.reset();
    })();
  }, [imageTask, data.images, data.imageUrl, id, getEdges, getNode, updateNodeData, addNode, onConnect, t]);

  const handleTogglePinPanel = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateNodeData(id, { pinPanel: !data.pinPanel } as Partial<CharacterNodeData>);
  }, [id, data.pinPanel, updateNodeData]);

  // ── 历史侧栏 ──
  const [showHistory, setShowHistory] = useState(false);
  const historyImages = data.generatedImages || [];

  const handleHistoryDragStart = useCallback((e: DragEvent<HTMLDivElement>, entry: ImageGenHistoryEntry) => {
    e.dataTransfer.setData('application/image-history', JSON.stringify(entry));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleHistoryDragEnd = useCallback((e: DragEvent<HTMLDivElement>, entry: ImageGenHistoryEntry) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const droppedOnSelf = nodeRef.current?.contains(el);
    droppedOnSelf || (() => {
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const newNode: CanvasNode = {
        id: `image-${uuidv4()}`,
        type: 'image',
        position: { x: pos.x - 128, y: pos.y - 96 },
        width: 512,
        height: 384,
        data: {
          name: t('canvas.node.image.aiGenerated', 'AI 生成图像'),
          description: entry.prompt || '',
          images: [entry.url],
          imageUrl: entry.url,
          uploading: false,
          initialGenConfig: {
            prompt: entry.prompt,
            model: entry.model,
            provider_id: entry.provider_id,
            aspect_ratio: entry.aspect_ratio,
            quality: entry.quality,
            batch_count: entry.batch_count,
            output_format: entry.output_format,
          },
        } as CharacterNodeData,
      };
      addNode(newNode);
    })();
  }, [screenToFlowPosition, addNode, t]);

  const handleHistoryClick = useCallback((url: string) => {
    const currentImages = data.images || (data.imageUrl ? [data.imageUrl] : []);
    currentImages.includes(url) || (() => {
      const slotsAvailable = MAX_IMAGES - currentImages.length;
      slotsAvailable > 0 && (() => {
        const next = [...currentImages, url];
        updateNodeData(id, { images: next, imageUrl: next[0] } as Partial<CharacterNodeData>);
      })();
    })();
  }, [data.images, data.imageUrl, id, updateNodeData]);

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
          {/* 最近一次 AI 生成耗时 */}
          {!taskActive && imageTask.lastDurationMs !== null && (
            <div
              className="text-xs font-mono text-blue-400/80 flex-shrink-0 select-none tabular-nums ml-1"
              title={t('canvas.node.image.lastDuration', '本次生成耗时')}
            >
              {(imageTask.lastDurationMs / 1000).toFixed(1)}s
            </div>
          )}
        </div>

        <Card className={`w-full h-full flex flex-col bg-card ${selected ? 'ring-2 ring-primary' : ''} overflow-hidden relative z-[2]`}>
          <CardContent 
            className="flex flex-col items-center justify-center relative custom-scrollbar flex-1 p-0 overflow-hidden" 
          >
            {imageList.length === 0 && !isUploading && !uploadError && (
              <div className="flex flex-col items-center justify-center gap-1 py-8">
                <ImageIcon className="w-10 h-10 text-muted-foreground/30" />
              </div>
            )}

            {imageList.length > 0 && (
              <div ref={gridContainerRef} className="w-full h-full">
                {renderGridImages()}
              </div>
            )}

            {/* AI 生成中脚动覆盖层 — 对齐 VideoNode 规范 */}
            {taskActive && (
              <>
                <div
                  className="absolute inset-[-3px] rounded-xl border-blue-400 border-[3px] pointer-events-none z-[20]"
                  style={{
                    animation: 'nodeEffectPulse 1.5s ease-in-out infinite',
                    boxShadow: '0 0 12px 2px rgba(59,130,246,0.5), inset 0 0 12px 2px rgba(59,130,246,0.5)',
                  }}
                />
                <div
                  className="absolute inset-0 rounded-xl pointer-events-none z-[19]"
                  style={{ backgroundColor: 'rgba(59,130,246,0.08)' }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 z-[21] pointer-events-none">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                  <span className="text-sm font-medium text-blue-400">{t('canvas.node.image.generatingHint', '图像生成中…')}</span>
                  <span className="text-xs font-mono text-blue-300/90 tabular-nums">{(elapsedMs / 1000).toFixed(1)}s</span>
                </div>
              </>
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

        {/* 工具条 — 顶部定位，对齐 VideoNode 规范 */}
        <NodeToolbar
          className={cn(
            '!bottom-auto !-top-[64px] !-translate-y-1 group-hover:!translate-y-0',
            (showAddMenu || showExportDialog || isExporting) && '!opacity-100 !pointer-events-auto !translate-y-0',
          )}
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

        {/* 添加图片级联按钮 — 置于工具条上方 */}
        {showAddMenu && !isFull && (
          <div
            ref={addMenuRef}
            className="absolute left-1/2 -translate-x-1/2 -top-[108px] flex items-center bg-background/95 backdrop-blur-md border border-border/60 rounded-full px-1 py-1 shadow-lg pointer-events-auto nodrag animate-in fade-in zoom-in-95 duration-150 z-30"
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

        {/* 导出清晰度级联按钮 — 置于工具条上方 */}
        {showExportDialog && !isExporting && imageList.length >= 2 && (
          <div
            ref={exportCascadeRef}
            className="absolute left-1/2 -translate-x-1/2 -top-[108px] flex items-center bg-background/95 backdrop-blur-md border border-border/60 rounded-full px-1 py-1 shadow-lg pointer-events-auto nodrag animate-in fade-in zoom-in-95 duration-150 z-30"
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

      {/* 生成历史侧边栏 — 节点左侧 */}
      {historyImages.length > 0 && (
        <div
          className={cn(
            'absolute right-full top-0 bottom-0 mr-3 flex flex-col nodrag nopan z-10 transition-all duration-200',
            showHistory ? 'w-[72px] opacity-100' : 'w-0 opacity-0 pointer-events-none',
          )}
        >
          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col gap-1.5 py-1">
            {historyImages.map((entry, i) => (
              <div
                key={`${entry.url}-${i}`}
                draggable
                onDragStart={(e) => handleHistoryDragStart(e, entry)}
                onDragEnd={(e) => handleHistoryDragEnd(e, entry)}
                onClick={() => handleHistoryClick(entry.url)}
                className={cn(
                  'w-[68px] h-[68px] rounded-md border overflow-hidden cursor-grab active:cursor-grabbing shrink-0 relative group/hist transition-all',
                  imageList.includes(entry.url)
                    ? 'border-primary ring-1 ring-primary/30'
                    : 'border-border/50 hover:border-primary/50',
                )}
                title={entry.prompt || entry.quality || t('canvas.node.image.aiGenerated', 'AI 生成图像')}
              >
                <img
                  src={entry.url}
                  alt=""
                  className="w-full h-full object-cover pointer-events-none"
                  draggable={false}
                />
                {entry.quality && (
                  <span className="absolute bottom-0 right-0 px-1 py-px text-[8px] font-medium bg-black/70 text-white rounded-tl">
                    {entry.quality}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 历史侧栏切换按钮 */}
      {historyImages.length > 0 && (
        <button
          type="button"
          onClick={() => setShowHistory(p => !p)}
          className={cn(
            'absolute right-full top-1/2 -translate-y-1/2 w-5 h-10 flex items-center justify-center rounded-l-md border border-r-0 bg-background/90 backdrop-blur-sm text-muted-foreground hover:text-foreground transition-all nodrag z-10',
            showHistory ? 'mr-[76px]' : 'mr-1',
          )}
          title={t('canvas.node.image.historyToggle', '生成历史')}
        >
          <span className="text-[10px] font-bold">{historyImages.length}</span>
        </button>
      )}

      {/* AI 图像生成内联面板 — 卡片下方，选中/固定/任务进行中时显示 */}
      <div className={cn(
        'absolute top-full left-0 right-0 mt-1.5 nodrag z-20 transition-opacity duration-150',
        (selected || data.pinPanel || taskActive || taskDone || taskFailed) ? 'opacity-100' : 'opacity-0 pointer-events-none invisible',
      )}>
        {/* Pin toggle */}
        <button
          type="button"
          onClick={handleTogglePinPanel}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            'absolute -top-1 right-1 z-30 h-6 w-6 rounded-md flex items-center justify-center transition-all duration-200',
            data.pinPanel
              ? 'text-primary hover:text-primary/80'
              : 'text-muted-foreground/40 hover:text-muted-foreground/70',
          )}
          title={data.pinPanel ? t('canvas.node.image.unpinPanel', '取消固定面板') : t('canvas.node.image.pinPanel', '固定面板')}
        >
          {data.pinPanel ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
        </button>
        <ImageGeneratePanel
          onSubmit={handleImageSubmit}
          onStop={() => imageTask.reset()}
          isSubmitting={imageTask.isSubmitting}
          taskActive={taskActive}
          taskDone={taskDone}
          taskFailed={taskFailed}
          taskError={imageTask.error || t('canvas.node.image.failedDefault', '图像生成失败')}
          submitError={imageTask.error}
          hasExistingImage={prevImagesRef.current.length > 0}
          onApplyToNode={handleApplyToNode}
          onApplyToNextNode={handleApplyToNextNode}
          initialConfig={data.initialGenConfig || null}
          nodeId={id}
          canvasNodes={canvasNodes}
          onLinkNode={handleLinkNode}
          onUnlinkNode={handleUnlinkNode}
        />
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


