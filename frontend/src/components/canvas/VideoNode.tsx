'use client';

import React, { memo, useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import {
  useCanvasStore,
  type VideoNodeData,
  type VideoGenHistoryEntry,
  type CanvasNode,
} from '@/store/useCanvasStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';
import { useResourceStore } from '@/store/useResourceStore';
import NodeEffectOverlay from './NodeEffectOverlay';

// ── Hooks ──
import { useInlineTitleEdit } from '@/hooks/useInlineTitleEdit';
import { useVideoNodeUpload } from '@/hooks/useVideoNodeUpload';
import { useVideoGenerationApply } from '@/hooks/useVideoGenerationApply';
import { useVideoNodeConnections } from '@/hooks/useVideoNodeConnections';

// ── 子组件 ──
import {
  MAX_DIMENSION,
  MIN_WIDTH,
  MIN_HEIGHT,
  VIDEO_ACCEPT,
} from './VideoNode/constants';
import { normalizeVideoUrl } from './VideoNode/utils';
import { NodeHeader } from './VideoNode/NodeHeader';
import { VideoDisplay } from './VideoNode/VideoDisplay';
import { GenerationOverlay } from './VideoNode/GenerationOverlay';
import { EmptyPlaceholder } from './VideoNode/EmptyPlaceholder';
import { UploadingOverlay, UploadErrorOverlay } from './VideoNode/UploadOverlay';
import { AddVideoMenu } from './VideoNode/AddVideoMenu';
import { EdgeHandles } from './VideoNode/EdgeHandles';
import { HistorySidebar } from './VideoNode/HistorySidebar';
import {
  VideoNodeToolbar,
  GeneratePanelWrapper,
  AssetPickerPortal,
} from './VideoNode/GeneratePanelWrapper';

const VideoNode = ({ id, data, selected }: NodeProps<Node<VideoNodeData>>) => {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const updateNodeDimensions = useCanvasStore((s) => s.updateNodeDimensions);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const canvasNodes = useCanvasStore((s) => s.nodes);
  const { getNode, screenToFlowPosition } = useReactFlow();

  // ── AI 生成 ──
  const gen = useVideoGenerationApply(id, data);
  const { videoTask, taskActive, taskDone, taskFailed, prevVideoUrlRef } = gen;

  // ── 连线维护 ──
  const { linkNode, unlinkNode } = useVideoNodeConnections(id);

  // ── 上传 ──
  const upload = useVideoNodeUpload(id);

  // ── 标题编辑 ──
  const commitTitle = useCallback((name: string) => {
    updateNodeData(id, { name });
  }, [id, updateNodeData]);
  const title = useInlineTitleEdit(data.name || '', commitTitle);

  // ── 节点级 UI 状态 ──
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const nodeRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);

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

  // ── 基础交互 ──
  const handleTogglePinPanel = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateNodeData(id, { pinPanel: !data.pinPanel } as Partial<VideoNodeData>);
  }, [id, data.pinPanel, updateNodeData]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    confirm(t('canvas.node.deleteConfirm.video')) && deleteNode(id);
  }, [deleteNode, id, t]);

  const handleDuplicate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    node && (() => {
      const currentData = node.data as VideoNodeData;
      const currentName = currentData.name || t('canvas.node.unnamedVideoCard');
      const newNode: CanvasNode = {
        ...(node as CanvasNode),
        id: `video-${uuidv4()}`,
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

  const handleToggleFitMode = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const currentFitMode = data.fitMode || 'contain';
    updateNodeData(id, { fitMode: currentFitMode === 'contain' ? 'cover' : 'contain' });
  }, [data.fitMode, id, updateNodeData]);

  const isReferenced = useAIAssistantStore((s) => s.nodeAttachments.some((a) => a.nodeId === id));
  const handleReference = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const url = normalizeVideoUrl(data.videoUrl || '');
    const store = useAIAssistantStore.getState();
    const referenced = store.nodeAttachments.some((a) => a.nodeId === id);
    referenced
      ? store.removeNodeAttachment(id)
      : (() => {
          store.addNodeAttachment({
            nodeId: id,
            nodeType: 'video',
            label: data.name || t('canvas.node.unnamedVideoCard'),
            excerpt: data.description || '',
            thumbnailUrl: url,
            meta: {},
          });
          store.setIsOpen(true);
        })();
  }, [data.description, data.name, data.videoUrl, id, t]);

  // ── 添加视频（上传 / 资产库） ──
  const handleAddClick = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu((p) => !p);
  }, []);

  const handleUploadClick = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(false);
    upload.openFileDialog();
  }, [upload]);

  const handlePickFromLibrary = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(false);
    setShowAssetPicker(true);
    useResourceStore.getState().fetchAssets({ pageSize: 100, typeFilter: 'video' });
  }, []);

  const handleSelectAsset = useCallback((assetUrl: string) => {
    upload.selectAsset(assetUrl);
    setShowAssetPicker(false);
  }, [upload]);

  // ── 视频尺寸自适应 ──
  const handleLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (!video.videoWidth || !video.videoHeight) return;
    const aspectRatio = video.videoWidth / video.videoHeight;
    let newWidth: number;
    let newHeight: number;
    if (aspectRatio > 1) {
      newWidth = Math.min(video.videoWidth, MAX_DIMENSION);
      newHeight = newWidth / aspectRatio;
    } else {
      newHeight = Math.min(video.videoHeight, MAX_DIMENSION);
      newWidth = newHeight * aspectRatio;
    }
    newWidth = Math.max(newWidth, MIN_WIDTH);
    newHeight = Math.max(newHeight, MIN_HEIGHT);
    const currentNode = getNode(id);
    if (!currentNode) return;
    const currentWidth = currentNode.width ?? 0;
    const currentHeight = currentNode.height ?? 0;
    const shouldResize = Math.abs(currentWidth - newWidth) > 5 || Math.abs(currentHeight - newHeight) > 5;
    shouldResize && updateNodeDimensions(id, Math.round(newWidth), Math.round(newHeight));
  }, [getNode, id, updateNodeDimensions]);

  // ── 历史拖放 ──
  const historyVideos = data.generatedVideos || [];
  const handleHistoryDragStart = useCallback((e: DragEvent<HTMLDivElement>, entry: VideoGenHistoryEntry) => {
    e.dataTransfer.setData('application/video-history', JSON.stringify(entry));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);
  const handleHistoryDragEnd = useCallback((e: DragEvent<HTMLDivElement>, entry: VideoGenHistoryEntry) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const droppedOnSelf = nodeRef.current?.contains(el);
    droppedOnSelf || (() => {
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const newNode: CanvasNode = {
        id: `video-${uuidv4()}`,
        type: 'video',
        position: { x: pos.x - 128, y: pos.y - 96 },
        data: {
          name: t('canvas.node.video.aiGenerated'),
          videoUrl: entry.url,
          fitMode: 'contain',
          description: entry.prompt || '',
          initialGenConfig: {
            prompt: entry.prompt,
            model: entry.model,
            provider_id: entry.provider_id,
            video_mode: entry.video_mode,
            duration: entry.duration,
            quality: entry.quality,
            aspect_ratio: entry.aspect_ratio,
          },
        } as VideoNodeData,
      };
      addNode(newNode);
    })();
  }, [addNode, screenToFlowPosition, t]);
  const handleHistoryClick = useCallback((videoUrl: string) => {
    updateNodeData(id, { videoUrl } as Partial<VideoNodeData>);
  }, [id, updateNodeData]);

  const isUploading = data.uploading;
  const fitMode: 'cover' | 'contain' = data.fitMode || 'contain';

  return (
    <>
      <NodeResizer
        color="#6d6d6d"
        isVisible={selected}
        minWidth={MIN_WIDTH}
        minHeight={200}
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
        accept={VIDEO_ACCEPT}
        onChange={upload.handleFileChange}
        aria-label={t('canvas.node.upload.uploadVideo')}
        data-testid="file-upload-input"
      />

      <div
        ref={nodeRef}
        className={`video-node-wrapper w-full h-full flex flex-col group relative ${isUploading ? 'nodrag' : ''}`}
      >
        <NodeEffectOverlay nodeId={id} />

        <NodeHeader
          name={data.name || ''}
          isEditing={title.isEditing}
          editValue={title.value}
          inputRef={title.inputRef}
          onEdit={title.onChange}
          onEnterEdit={title.enterEdit}
          onKeyDown={title.onKeyDown}
        />

        <Card className={`w-full h-full flex flex-col bg-card ${selected ? 'ring-2 ring-primary' : ''} overflow-hidden relative z-[2]`}>
          <CardContent className="flex flex-col items-center justify-center relative custom-scrollbar flex-1 p-0 overflow-hidden">
            {!data.videoUrl && !isUploading && !upload.uploadError && !taskActive && <EmptyPlaceholder />}

            {taskActive && <GenerationOverlay />}

            {data.videoUrl && (
              <VideoDisplay
                videoUrl={data.videoUrl}
                fitMode={fitMode}
                quality={videoTask.status?.quality}
                onLoadedMetadata={handleLoadedMetadata}
              />
            )}

            {isUploading && <UploadingOverlay progress={upload.uploadProgress} />}

            {upload.uploadError && !isUploading && (
              <UploadErrorOverlay message={upload.uploadError} onRetry={handleUploadClick} />
            )}
          </CardContent>
        </Card>

        <VideoNodeToolbar
          isReferenced={isReferenced}
          fitMode={fitMode}
          showAddMenu={showAddMenu}
          onReference={handleReference}
          onAddClick={handleAddClick}
          onToggleFitMode={handleToggleFitMode}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />

        {showAddMenu && (
          <AddVideoMenu
            menuRef={addMenuRef}
            onUploadClick={handleUploadClick}
            onPickFromLibrary={handlePickFromLibrary}
          />
        )}

        <EdgeHandles />
      </div>

      <HistorySidebar
        historyVideos={historyVideos}
        showHistory={showHistory}
        currentVideoUrl={data.videoUrl || null}
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
        taskError={videoTask.status?.error_message || null}
        submitError={videoTask.error}
        isSubmitting={videoTask.isSubmitting}
        hasExistingVideo={!!prevVideoUrlRef.current}
        initialConfig={data.initialGenConfig || null}
        nodeId={id}
        canvasNodes={canvasNodes}
        onTogglePinPanel={handleTogglePinPanel}
        onSubmit={gen.submit}
        onStop={() => videoTask.reset()}
        onApplyToNode={gen.applyToNode}
        onApplyToNextNode={gen.applyToNextNode}
        onLinkNode={linkNode}
        onUnlinkNode={unlinkNode}
      />

      <AssetPickerPortal
        open={showAssetPicker}
        currentUrl={data.videoUrl || ''}
        onSelect={handleSelectAsset}
        onClose={() => setShowAssetPicker(false)}
      />
    </>
  );
};

export default memo(VideoNode);
