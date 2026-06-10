'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Globe, Upload, FolderOpen, Maximize2, Camera, Copy, Trash2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCanvasStore, type PanoramaNodeData, type CanvasNode, type CharacterNodeData } from '@/store/useCanvasStore';
import { useResourceStore } from '@/store/useResourceStore';
import NodeEffectOverlay from './NodeEffectOverlay';
import { NodeToolbar, type ToolbarAction } from './NodeToolbar';
import { Input } from '@/components/ui/input';

// ── Hooks ──
import { useInlineTitleEdit } from '@/hooks/useInlineTitleEdit';

// ── 子组件 ──
import { EdgeHandles } from './PanoramaNode/EdgeHandles';
import { FullscreenPortal } from './PanoramaNode/FullscreenPortal';
import { AssetPickerPortal } from './PanoramaNode/AssetPickerPortal';
import { PromptBuilder } from './PanoramaNode/PromptBuilder';
import {
  MIN_WIDTH,
  MIN_HEIGHT,
  PANORAMA_ACCEPT,
  PANORAMA_MAX_BYTES,
  PANORAMA_MIME_TYPES,
} from './PanoramaNode/constants';

const PanoramaNode = ({ id, data, selected }: NodeProps<Node<PanoramaNodeData>>) => {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const { getNode } = useReactFlow();

  // ── 标题编辑 ──
  const commitTitle = useCallback((name: string) => {
    updateNodeData(id, { name });
  }, [id, updateNodeData]);
  const title = useInlineTitleEdit(data.name || '', commitTitle);

  // ── 节点级 UI 状态 ──
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const nodeRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUploading = !!data.uploading;
  const hasPanorama = !!data.panoramaUrl;

  // ── 级联菜单外部点击关闭 ──
  useEffect(() => {
    if (!showAddMenu) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      addMenuRef.current && !addMenuRef.current.contains(target) && !target.closest('[data-node-toolbar]') && setShowAddMenu(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showAddMenu]);

  // ── 上传逻辑 ──
  const openFileDialog = useCallback(() => fileInputRef.current?.click(), []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isValidType = (PANORAMA_MIME_TYPES as readonly string[]).includes(file.type);
    if (!isValidType) {
      setUploadError(t('canvas.node.upload.imageFormatError', '不支持的图片格式'));
      fileInputRef.current && (fileInputRef.current.value = '');
      return;
    }
    if (file.size > PANORAMA_MAX_BYTES) {
      setUploadError(t('canvas.node.panorama.sizeError', '全景图过大（上限 30 MB）'));
      fileInputRef.current && (fileInputRef.current.value = '');
      return;
    }

    setUploadError(null);
    setUploadProgress(0);

    const objectUrl = URL.createObjectURL(file);
    updateNodeData(id, { panoramaUrl: objectUrl, uploading: true });

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/media/upload');
      const token = localStorage.getItem('access_token');
      token && xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (ev) => {
        ev.lengthComputable && setUploadProgress((ev.loaded / ev.total) * 100);
      };

      const formData = new FormData();
      formData.append('file', file);

      const response = await new Promise<{ url?: string; error?: string }>((resolve, reject) => {
        xhr.onload = () => {
          try {
            const res = xhr.responseText ? JSON.parse(xhr.responseText) : {};
            xhr.status >= 200 && xhr.status < 300
              ? resolve(res || {})
              : resolve({ error: res?.error || `上传失败 (HTTP ${xhr.status})` });
          } catch {
            resolve({ error: `解析响应失败: ${xhr.status} ${xhr.statusText}` });
          }
        };
        xhr.onerror = () => reject(new Error('网络请求失败或跨域错误'));
        xhr.send(formData);
      });

      if (response.error) throw new Error(response.error);
      updateNodeData(id, { panoramaUrl: response.url || objectUrl, uploading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('canvas.node.upload.uploadFailed', '上传失败');
      setUploadError(message);
      updateNodeData(id, { panoramaUrl: null, uploading: false });
    } finally {
      URL.revokeObjectURL(objectUrl);
      fileInputRef.current && (fileInputRef.current.value = '');
    }
  }, [id, t, updateNodeData]);

  // ── 工具栏 ──
  const handleAddClick = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu((p) => !p);
  }, []);

  const handleUploadClick = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(false);
    openFileDialog();
  }, [openFileDialog]);

  const handlePickFromLibrary = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(false);
    setShowAssetPicker(true);
    useResourceStore.getState().fetchAssets({ pageSize: 100, typeFilter: 'image' });
  }, []);

  const handleSelectFromAssets = useCallback((url: string) => {
    updateNodeData(id, { panoramaUrl: url });
  }, [id, updateNodeData]);

  const handleEnterFullscreen = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    hasPanorama && setShowFullscreen(true);
  }, [hasPanorama]);

  const handleNodeDoubleClick = useCallback(() => {
    // 标题区域已经 stopPropagation，这里只处理非编辑双击
    !title.isEditing && hasPanorama && setShowFullscreen(true);
  }, [hasPanorama, title.isEditing]);

  /** 通用的事件阻況 callback，需统一类型以避免内联 lambda 被 eslint 标为 any。 */
  const stopEvent = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  // 截图导出到画布：dataURL → 上传后端 → 创建 image 节点 → 连线
  const handleScreenshotToCanvas = useCallback(async (dataUrl: string) => {
    // 1. dataURL 转 blob
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], 'panorama-screenshot.png', { type: 'image/png' });

    // 2. 上传到后端
    const formData = new FormData();
    formData.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media/upload');
    const token = localStorage.getItem('access_token');
    token && xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    const uploadResult = await new Promise<{ url?: string; error?: string }>((resolve, reject) => {
      xhr.onload = () => {
        try {
          const r = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          xhr.status >= 200 && xhr.status < 300 ? resolve(r) : resolve({ error: r?.error || `上传失败 (${xhr.status})` });
        } catch { resolve({ error: '响应解析失败' }); }
      };
      xhr.onerror = () => reject(new Error('网络错误'));
      xhr.send(formData);
    });

    if (uploadResult.error || !uploadResult.url) return;

    // 3. 获取当前 panorama 节点位置，在右侧创建 image 节点
    const panoramaNode = getNode(id);
    const posX = (panoramaNode?.position.x ?? 0) + (panoramaNode?.width ?? 512) + 60;
    const posY = panoramaNode?.position.y ?? 0;
    const imageNodeId = uuidv4();
    const imageNode: CanvasNode = {
      id: imageNodeId,
      type: 'image',
      position: { x: posX, y: posY },
      width: 512,
      height: 384,
      data: {
        name: t('canvas.node.panorama.screenshotName', '全景截图'),
        description: data.name || '',
        images: [uploadResult.url],
        imageUrl: uploadResult.url,
        uploading: false,
      } as CharacterNodeData,
    };
    addNode(imageNode);

    // 4. 创建 panorama → image 连线（程序化操作，绕过 deferred 矩阵校验）
    const { edges } = useCanvasStore.getState();
    const newEdge = {
      id: uuidv4(),
      source: id,
      target: imageNodeId,
      sourceHandle: 'right-source',
      targetHandle: 'left-target',
      type: 'custom' as const,
      animated: true,
    };
    useCanvasStore.setState({ edges: [...edges, newEdge], isDirty: true });
  }, [id, data.name, addNode, getNode, t]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    confirm(t('canvas.node.deleteConfirm.panorama', '确定删除该全景节点吗？')) && deleteNode(id);
  }, [deleteNode, id, t]);

  const handleDuplicate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    if (!node) return;
    const currentData = node.data as PanoramaNodeData;
    const currentName = currentData.name || t('canvas.node.unnamedPanoramaCard', '未命名全景图');
    const newNode: CanvasNode = {
      ...(node as CanvasNode),
      id: uuidv4(),
      position: { x: node.position.x + 50, y: node.position.y + 50 },
      selected: false,
      data: {
        ...currentData,
        name: t('canvas.node.copySuffix', { name: currentName }),
        uploading: false,
      },
    };
    addNode(newNode);
  }, [addNode, getNode, id, t]);

  // ── 工具栏 actions ──
  const toolbarActions: ToolbarAction[] = [
    {
      icon: <Maximize2 className="h-3.5 w-3.5" />,
      onClick: handleEnterFullscreen,
      title: t('canvas.node.panorama.enterFullscreen', '进入全屏浏览'),
      disabled: !hasPanorama,
      variant: 'primary',
    },
    {
      icon: <Camera className="h-3.5 w-3.5" />,
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); hasPanorama && setShowFullscreen(true); },
      title: t('canvas.node.panorama.screenshot', '截图导出到图像节点'),
      disabled: !hasPanorama,
    },
    {
      icon: <Upload className="h-3.5 w-3.5" />,
      onClick: handleAddClick,
      title: t('canvas.node.panorama.changePanorama', '更换全景图'),
    },
    {
      icon: <Copy className="h-3.5 w-3.5" />,
      onClick: handleDuplicate,
      title: t('canvas.node.toolbar.duplicate', '复制'),
    },
    {
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onClick: handleDelete,
      title: t('canvas.node.toolbar.delete', '删除'),
      variant: 'danger',
    },
  ];

  return (
    <>
      <NodeResizer
        color="#6d6d6d"
        isVisible={selected}
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        lineStyle={{ display: 'none' }}
        handleStyle={{
          width: '8px',
          height: '8px',
          borderRadius: '4px',
          border: '1px solid #6d6d6d',
          background: '#fff',
          opacity: selected ? 1 : 0,
          transition: 'opacity 0.2s',
        }}
      />

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept={PANORAMA_ACCEPT}
        onChange={handleFileChange}
        aria-label={t('canvas.node.panorama.uploadPanorama', '上传全景图')}
        data-testid="panorama-upload-input"
      />

      <div
        ref={nodeRef}
        className={`panorama-node-wrapper w-full h-full flex flex-col group relative ${isUploading ? 'nodrag' : ''}`}
        onDoubleClick={handleNodeDoubleClick}
      >
        <NodeEffectOverlay nodeId={id} />

        {/* 标题条 */}
        <div className="absolute bottom-full left-0 right-0 mb-1 px-1 flex items-center justify-between gap-2 min-h-[28px] nodrag">
          <div className="flex-1 min-w-0 flex items-center">
            {title.isEditing ? (
              <Input
                ref={title.inputRef}
                value={title.value}
                onChange={(e) => title.onChange(e.target.value)}
                className="font-bold text-sm h-7 bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-0 focus:outline-none px-0 shadow-none cursor-text select-text rounded-none leading-none"
                placeholder={t('canvas.node.unnamedPanoramaCard', '未命名全景图')}
                onClick={stopEvent}
                onPointerDown={stopEvent}
                onKeyDown={title.onKeyDown}
                autoFocus
              />
            ) : (
              <h3
                className="font-bold text-sm h-7 flex items-center truncate text-foreground/90 cursor-text select-text hover:text-primary leading-none"
                title={data.name || ''}
                onPointerDown={stopEvent}
                onDoubleClick={title.enterEdit}
              >
                <Globe className="w-4 h-4 text-cyan-500 mr-2 shrink-0" />
                {data.name || t('canvas.node.unnamedPanoramaCard', '未命名全景图')}
              </h3>
            )}
          </div>
        </div>

        <Card className={`w-full h-full flex flex-col bg-muted ${selected ? 'ring-2 ring-primary' : ''} overflow-hidden relative z-[2]`}>
          <CardContent className="flex flex-col items-center justify-center relative custom-scrollbar flex-1 p-0 overflow-hidden">
            {/* 空态：提示词生成器（上传/资产库入口已由悬浮工具条提供，避免重复） */}
            {!hasPanorama && !isUploading && (
              <div className="flex flex-col items-center justify-center w-full h-full py-4">
                <PromptBuilder />
              </div>
            )}

            {/* 已上传：等距柱状缩略（静态 img，避免节点内实例化 WebGL）。
                使用 object-contain 保证节点拖拽缩放时全景图不会被裁剪/截断，与图像节点保持一致 */}
            {hasPanorama && (
              <div className="relative w-full h-full bg-black/60">
                <img
                  src={data.panoramaUrl as string}
                  alt={data.name || t('canvas.node.unnamedPanoramaCard', '未命名全景图')}
                  draggable={false}
                  className="w-full h-full object-contain"
                />
                {/* 浮层：双击进入全屏提示 */}
                <div className="absolute inset-0 flex items-end justify-center pb-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div className="px-3 py-1.5 bg-black/60 backdrop-blur-md text-white text-[11px] rounded-full border border-white/15 flex items-center gap-1.5">
                    <Maximize2 className="w-3 h-3" />
                    {t('canvas.node.panorama.doubleClickToFullscreen', '双击进入 720° 全景浏览')}
                  </div>
                </div>
              </div>
            )}

            {/* 上传中 */}
            {isUploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                <div className="w-2/3 h-1 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="text-[11px] text-muted-foreground">{Math.round(uploadProgress)}%</span>
              </div>
            )}

            {/* 上传错误 */}
            {uploadError && !isUploading && (
              <div className="absolute inset-x-2 bottom-2 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-md text-[11px] text-destructive flex items-center justify-between gap-2">
                <span className="truncate">{uploadError}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setUploadError(null); openFileDialog(); }}
                  className="shrink-0 text-[10px] underline hover:no-underline"
                >
                  {t('canvas.node.upload.retry', '重试')}
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 工具栏 */}
        <NodeToolbar
          className={`!bottom-auto !-top-[64px] !-translate-y-1 group-hover:!translate-y-0 ${showAddMenu ? '!opacity-100 !pointer-events-auto !translate-y-0' : ''}`}
          actions={toolbarActions}
        />

        {/* Plus 级联：上传 / 从资产库 */}
        {showAddMenu && (
          <div
            ref={addMenuRef}
            className="absolute left-1/2 -translate-x-1/2 -top-[108px] flex items-center bg-background/95 backdrop-blur-md border border-border/60 rounded-full px-1 py-1 shadow-lg pointer-events-auto nodrag animate-in fade-in zoom-in-95 duration-150 z-30"
          >
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              onClick={handleUploadClick}
              title={t('canvas.node.panorama.uploadPanorama', '上传全景图')}
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-border/50" />
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
              onClick={handlePickFromLibrary}
              title={t('canvas.node.upload.fromLibrary', '从资产库选择')}
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <EdgeHandles />
      </div>

      <AssetPickerPortal
        open={showAssetPicker}
        currentUrl={data.panoramaUrl}
        onSelect={handleSelectFromAssets}
        onClose={() => setShowAssetPicker(false)}
      />

      <FullscreenPortal
        open={showFullscreen}
        panoramaUrl={data.panoramaUrl}
        nodeName={data.name || ''}
        defaultYaw={data.defaultYaw}
        defaultPitch={data.defaultPitch}
        defaultFov={data.defaultFov}
        onClose={() => setShowFullscreen(false)}
        onScreenshot={handleScreenshotToCanvas}
      />
    </>
  );
};

export default memo(PanoramaNode);
