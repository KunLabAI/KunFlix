'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { Image as ImageIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useCanvasStore,
  CharacterNodeData,
  CanvasNode,
  ImageGenHistoryEntry,
} from '@/store/useCanvasStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';
import { useResourceStore } from '@/store/useResourceStore';
import NodeEffectOverlay from './NodeEffectOverlay';

// ── Hooks ──
import { useInlineTitleEdit } from '@/hooks/useInlineTitleEdit';
import { useImageNodeUpload } from '@/hooks/useImageNodeUpload';
import { useImageGridExport } from '@/hooks/useImageGridExport';
import { useImagePreview } from '@/hooks/useImagePreview';
import { useImageNodeConnections } from '@/hooks/useImageNodeConnections';
import { useImageGenerationApply } from '@/hooks/useImageGenerationApply';
import { useQuickImageMode } from '@/hooks/useQuickImageMode';

// ── 子组件 ──
import { MAX_IMAGES } from './ImageNode/constants';
import { normalizeImageUrl } from './ImageNode/utils';
import { NodeHeader } from './ImageNode/NodeHeader';
import { ImageGrid } from './ImageNode/ImageGrid';
import { GenerationOverlay } from './ImageNode/GenerationOverlay';
import { UploadingOverlay, UploadErrorOverlay } from './ImageNode/UploadOverlay';
import { QuickModeSwitcher } from './ImageNode/QuickModeSwitcher';
import { AddImageMenu } from './ImageNode/AddImageMenu';
import { ExportGridMenu } from './ImageNode/ExportGridMenu';
import { HistorySidebar } from './ImageNode/HistorySidebar';
import { ImagePreviewPortal } from './ImageNode/ImagePreviewPortal';
import { EdgeHandles } from './ImageNode/EdgeHandles';
import {
  ImageNodeToolbar,
  GeneratePanelWrapper,
  AssetPickerPortal,
} from './ImageNode/GeneratePanelWrapper';

// 对外 re-export 面板类型（保持向后兼容）
export type { ImageRef, ImagePanelModeRequest } from './ImageGeneratePanel';

const CharacterNode = ({ id, data, selected }: NodeProps<Node<CharacterNodeData>>) => {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const updateNodeDimensions = useCanvasStore((s) => s.updateNodeDimensions);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const canvasNodes = useCanvasStore((s) => s.nodes);
  const { getNode, screenToFlowPosition } = useReactFlow();

  // 兼容处理：统一为 imageList 数组
  const imageList = useMemo(() => {
    if (data.images && data.images.length > 0) return data.images;
    if (data.imageUrl) return [data.imageUrl];
    return [];
  }, [data.images, data.imageUrl]);

  // ── AI 生成 ──
  const gen = useImageGenerationApply(id, data);
  const { imageTask, taskActive, taskDone, taskFailed, elapsedMs, prevImagesRef } = gen;

  // ── 连线维护 ──
  const { linkNode, unlinkNode } = useImageNodeConnections(id);

  // ── 上传 ──
  const upload = useImageNodeUpload(id, imageList);

  // ── 标题编辑 ──
  const commitTitle = useCallback((name: string) => {
    updateNodeData(id, { name });
  }, [id, updateNodeData]);
  const title = useInlineTitleEdit(data.name || '', commitTitle);

  // ── 图像预览 ──
  const preview = useImagePreview();

  // ── 快捷模式切换 ──
  const quick = useQuickImageMode(id, data, imageList, normalizeImageUrl);

  // ── 节点级 UI 状态 ──
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const nodeRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const exportCascadeRef = useRef<HTMLDivElement>(null);

  // ── 多宫格导出 ──
  const { isExporting, exportGrid } = useImageGridExport({
    id,
    gridContainerRef,
    imageList,
    data,
    setUploadError: (err) => err && upload.clearError(),
  });
  const handleExport = useCallback((pixelRatio: number) => {
    setShowExportDialog(false);
    exportGrid(pixelRatio);
  }, [exportGrid]);

  // ── 级联菜单外部点击关闭 ──
  useEffect(() => {
    const bind = (active: boolean, ref: React.RefObject<HTMLDivElement | null>, setter: (v: boolean) => void) => {
      if (!active) return () => { };
      const handle = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        ref.current && !ref.current.contains(target) && !target.closest('[data-node-toolbar]') && setter(false);
      };
      document.addEventListener('mousedown', handle);
      return () => document.removeEventListener('mousedown', handle);
    };
    const offA = bind(showAddMenu, addMenuRef, setShowAddMenu);
    const offE = bind(showExportDialog, exportCascadeRef, setShowExportDialog);
    return () => { offA(); offE(); };
  }, [showAddMenu, showExportDialog]);

  // ── 基础交互 ──
  const handleTogglePinPanel = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateNodeData(id, { pinPanel: !data.pinPanel } as Partial<CharacterNodeData>);
  }, [id, data.pinPanel, updateNodeData]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    confirm(t('canvas.node.deleteConfirm.image')) && deleteNode(id);
  }, [deleteNode, id, t]);

  const handleDuplicate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    node && (() => {
      const currentData = node.data as CharacterNodeData;
      const currentName = currentData.name || t('canvas.node.unnamedImageCard');
      const newNode: CanvasNode = {
        ...(node as CanvasNode),
        id: `character-${uuidv4()}`,
        position: { x: node.position.x + 50, y: node.position.y + 50 },
        selected: false,
        data: {
          ...currentData,
          name: t('canvas.node.copySuffix', { name: currentName }),
          uploading: false,
        },
      };
      addNode(newNode);
    })();
  }, [addNode, getNode, id, t]);

  const isReferenced = useAIAssistantStore((s) => s.nodeAttachments.some((a) => a.nodeId === id));
  const handleReference = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const url = normalizeImageUrl(imageList[0] || '');
    const store = useAIAssistantStore.getState();
    const referenced = store.nodeAttachments.some((a) => a.nodeId === id);
    referenced
      ? store.removeNodeAttachment(id)
      : (() => {
          store.addNodeAttachment({
            nodeId: id,
            nodeType: 'image',
            label: data.name || t('canvas.node.unnamedImageCard'),
            excerpt: data.description || '',
            thumbnailUrl: url,
            meta: {},
          });
          store.setIsOpen(true);
        })();
  }, [data.description, data.name, id, imageList, t]);

  // ── 添加图片（上传 / 资产库） ──
  const handleAddClick = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    !upload.isFull && setShowAddMenu((p) => !p);
  }, [upload.isFull]);

  const handleUploadClick = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(false);
    upload.openFileDialog();
  }, [upload]);

  const handlePickFromLibrary = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(false);
    setShowAssetPicker(true);
    useResourceStore.getState().fetchAssets({ pageSize: 100, typeFilter: 'image' });
  }, []);

  // ── 图像尺寸自适应 ──
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (imageList.length > 1) return;
    const img = e.currentTarget;
    if (!img.naturalWidth || !img.naturalHeight) return;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    const MAX_SIZE = 512;
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    let newWidth: number;
    let newHeight: number;
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
    if (!currentNode) return;
    const currentWidth = currentNode.width ?? 0;
    const currentHeight = currentNode.height ?? 0;
    const shouldResize = Math.abs(currentWidth - newWidth) > 5 || Math.abs(currentHeight - newHeight) > 5;
    shouldResize && updateNodeDimensions(id, Math.round(newWidth), Math.round(newHeight));
  }, [imageList.length, getNode, id, updateNodeDimensions]);

  // ── 历史拖放 ──
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
  }, [addNode, screenToFlowPosition, t]);
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

  const isUploading = data.uploading;

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
          transition: 'opacity 0.2s',
        }}
      />

      <input
        type="file"
        ref={upload.fileInputRef}
        className="hidden"
        accept=".jpg,.jpeg,.png,.webp"
        multiple
        onChange={upload.handleFileChange}
        aria-label={t('canvas.node.upload.uploadImage')}
        data-testid="file-upload-input"
      />

      <div
        ref={nodeRef}
        className={`character-node-wrapper w-full h-full flex flex-col group relative ${isUploading ? 'nodrag' : ''}`}
      >
        <NodeEffectOverlay nodeId={id} />

        <NodeHeader
          name={data.name || ''}
          isEditing={title.isEditing}
          editValue={title.value}
          imageCount={imageList.length}
          imageDimensions={imageDimensions}
          lastDurationMs={imageTask.lastDurationMs}
          taskActive={taskActive}
          inputRef={title.inputRef}
          onEdit={title.onChange}
          onEnterEdit={title.enterEdit}
          onKeyDown={title.onKeyDown}
        />

        <Card className={`w-full h-full flex flex-col bg-card ${selected ? 'ring-2 ring-primary' : ''} overflow-hidden relative z-[2]`}>
          <CardContent className="flex flex-col items-center justify-center relative custom-scrollbar flex-1 p-0 overflow-hidden">
            {imageList.length === 0 && !isUploading && !upload.uploadError && (
              <div className="flex flex-col items-center justify-center gap-1 py-8">
                <ImageIcon className="w-10 h-10 text-muted-foreground/30" />
              </div>
            )}

            {imageList.length > 0 && (
              <div ref={gridContainerRef} className="w-full h-full">
                <ImageGrid
                  imageList={imageList}
                  name={data.name || ''}
                  onRemove={(index, e) => { e.stopPropagation(); upload.removeImage(index); }}
                  onImageLoad={handleImageLoad}
                  onOpenPreview={preview.openPreview}
                />
              </div>
            )}

            {imageList.length > 0 && !taskActive && !isUploading && (
              <QuickModeSwitcher
                imageList={imageList}
                showEditPicker={quick.showEditPicker}
                pickerRef={quick.editPickerRef}
                onQuickMode={quick.handleQuickMode}
                onPickEditImage={quick.handlePickEditImage}
              />
            )}

            {taskActive && <GenerationOverlay elapsedMs={elapsedMs} />}

            {isUploading && <UploadingOverlay progress={upload.uploadProgress} />}

            {upload.uploadError && !isUploading && (
              <UploadErrorOverlay message={upload.uploadError} onRetry={handleUploadClick} />
            )}
          </CardContent>
        </Card>

        <ImageNodeToolbar
          isReferenced={isReferenced}
          isFull={upload.isFull}
          isExporting={isExporting}
          imageCount={imageList.length}
          showAddMenu={showAddMenu}
          showExportDialog={showExportDialog}
          onReference={handleReference}
          onAddClick={handleAddClick}
          onExportToggle={(e) => { e.stopPropagation(); setShowExportDialog((p) => !p); }}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />

        {showAddMenu && !upload.isFull && (
          <AddImageMenu
            menuRef={addMenuRef}
            onUploadClick={handleUploadClick}
            onPickFromLibrary={handlePickFromLibrary}
          />
        )}

        {showExportDialog && !isExporting && imageList.length >= 2 && (
          <ExportGridMenu menuRef={exportCascadeRef} onExport={handleExport} />
        )}

        <EdgeHandles />
      </div>

      <HistorySidebar
        historyImages={historyImages}
        showHistory={showHistory}
        imageList={imageList}
        onToggle={() => setShowHistory((p) => !p)}
        onClick={handleHistoryClick}
        onDragStart={handleHistoryDragStart}
        onDragEnd={handleHistoryDragEnd}
      />

      <GeneratePanelWrapper
        selected={!!selected}
        pinPanel={!!data.pinPanel}
        taskActive={taskActive}
        taskDone={taskDone}
        taskFailed={taskFailed}
        taskError={imageTask.error}
        submitError={imageTask.error}
        isSubmitting={imageTask.isSubmitting}
        hasExistingImage={prevImagesRef.current.length > 0}
        initialConfig={data.initialGenConfig || null}
        nodeId={id}
        canvasNodes={canvasNodes}
        modeRequest={quick.panelModeRequest}
        onTogglePinPanel={handleTogglePinPanel}
        onSubmit={gen.submit}
        onStop={() => imageTask.reset()}
        onApplyToNode={gen.applyToNode}
        onApplyToNextNode={gen.applyToNextNode}
        onLinkNode={linkNode}
        onUnlinkNode={unlinkNode}
      />

      <AssetPickerPortal
        open={showAssetPicker}
        imageList={imageList}
        onSelect={upload.selectAsset}
        onClose={() => setShowAssetPicker(false)}
      />

      <ImagePreviewPortal
        open={preview.open}
        url={preview.url}
        name={data.name || ''}
        scale={preview.scale}
        position={preview.position}
        isDragging={preview.isDragging}
        onClose={preview.closePreview}
        onZoomIn={preview.zoomIn}
        onZoomOut={preview.zoomOut}
        onPointerDown={preview.handlePointerDown}
        onPointerMove={preview.handlePointerMove}
        onPointerUp={preview.handlePointerUp}
      />
    </>
  );
};

export default memo(CharacterNode);
