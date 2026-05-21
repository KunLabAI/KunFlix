'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { NodeProps, Node, NodeResizer, useReactFlow } from '@xyflow/react';
import { Card, CardContent } from '@/components/ui/card';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';

import {
  useCanvasStore,
  type AudioNodeData,
  type CanvasNode,
  type AudioGenHistoryEntry,
} from '@/store/useCanvasStore';
import { useResourceStore } from '@/store/useResourceStore';
import { useAIAssistantStore } from '@/store/useAIAssistantStore';

import NodeEffectOverlay from './NodeEffectOverlay';
import { NodeHeader } from './AudioNode/NodeHeader';
import { EdgeHandles } from './AudioNode/EdgeHandles';
import { EmptyPlaceholder } from './AudioNode/EmptyPlaceholder';
import { AudioDisplay } from './AudioNode/AudioDisplay';
import { UploadingOverlay, UploadErrorOverlay } from './AudioNode/UploadOverlay';
import { GenerationOverlay } from './AudioNode/GenerationOverlay';
import { AddAudioMenu } from './AudioNode/AddAudioMenu';
import { HistorySidebar } from './AudioNode/HistorySidebar';
import {
  AudioNodeToolbar,
  GeneratePanelWrapper,
  AssetPickerPortal,
} from './AudioNode/GeneratePanelWrapper';
import {
  MIN_WIDTH,
  MIN_HEIGHT,
  AUDIO_ACCEPT,
} from './AudioNode/constants';
import { normalizeAudioUrl } from './AudioNode/utils';

import { useAudioNodeUpload } from '@/hooks/useAudioNodeUpload';
import { useAudioNodeConnections } from '@/hooks/useAudioNodeConnections';
import { useAudioGenerationApply } from '@/hooks/useAudioGenerationApply';

const AudioNode = ({ id, data, selected }: NodeProps<Node<AudioNodeData>>) => {
  const { t } = useTranslation();
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const nodes = useCanvasStore((s) => s.nodes);
  const { getNode } = useReactFlow();

  // 标题编辑
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(data.name || '');
  const titleInputRef = useRef<HTMLInputElement>(null);

  // 添加菜单 / 资产库
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // 历史侧栏
  const [showHistory, setShowHistory] = useState(false);

  // 上传
  const upload = useAudioNodeUpload(id);
  // 连线
  const { linkNode, unlinkNode } = useAudioNodeConnections(id);
  // 音乐生成
  const gen = useAudioGenerationApply(id, data);

  // ── 标题 ──
  useEffect(() => {
    !isEditingTitle && setEditTitle(data.name || '');
  }, [data.name, isEditingTitle]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const outside = isEditingTitle
        && titleInputRef.current
        && !titleInputRef.current.contains(e.target as globalThis.Node);
      outside && (() => {
        updateNodeData(id, { name: editTitle });
        setIsEditingTitle(false);
      })();
    };
    isEditingTitle && document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditingTitle, editTitle, id, updateNodeData]);

  const handleEnterTitleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditingTitle(true);
    setEditTitle(data.name || '');
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    const shouldCommit = e.key === 'Enter' || e.key === 'Escape';
    shouldCommit && setIsEditingTitle(false);
  };

  // ── 工具栏操作 ──
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    confirm(t('canvas.node.deleteConfirm.audio')) && deleteNode(id);
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const node = getNode(id);
    if (!node) return;
    const currentData = node.data as AudioNodeData;
    const currentName = currentData.name || t('canvas.node.unnamedAudioCard', '未命名音频');
    addNode({
      ...(node as CanvasNode),
      id: uuidv4(),
      position: { x: node.position.x + 50, y: node.position.y + 50 },
      selected: false,
      data: {
        ...currentData,
        name: t('canvas.node.copySuffix', { name: currentName }),
        uploading: false,
      },
    });
  };

  const handleAddClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu((v) => !v);
  };

  const handleUploadClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(false);
    upload.openFileDialog();
  };

  const handlePickFromLibrary = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowAddMenu(false);
    setShowAssetPicker(true);
    useResourceStore.getState().fetchAssets({ pageSize: 100, typeFilter: 'audio' });
  };

  const handleSelectAsset = (assetUrl: string) => {
    upload.selectAsset(assetUrl);
    setShowAssetPicker(false);
  };

  // 菜单外部点击关闭
  useEffect(() => {
    if (!showAddMenu) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const inside = addMenuRef.current?.contains(target)
        || !!target.closest('[data-node-toolbar]');
      !inside && setShowAddMenu(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showAddMenu]);

  // ── 引用到 AI Assistant ──
  const isReferenced = useAIAssistantStore((s) => s.nodeAttachments.some((a) => a.nodeId === id));
  const handleReference = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audioUrl = normalizeAudioUrl(data.audioUrl || '');
    const store = useAIAssistantStore.getState();
    const alreadyRef = store.nodeAttachments.some((a) => a.nodeId === id);
    alreadyRef
      ? store.removeNodeAttachment(id)
      : (() => {
          store.addNodeAttachment({
            nodeId: id,
            nodeType: 'audio',
            label: data.name || t('canvas.node.unnamedAudioCard', '未命名音频'),
            excerpt: data.description || '',
            thumbnailUrl: audioUrl,
            meta: {},
          });
          store.setIsOpen(true);
        })();
  };

  // ── 面板 Pin ──
  const handleTogglePinPanel = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateNodeData(id, { pinPanel: !data.pinPanel } as Partial<AudioNodeData>);
  };

  // ── 历史拖拽 ──
  const handleHistoryDragStart = (e: DragEvent<HTMLDivElement>, entry: AudioGenHistoryEntry) => {
    e.dataTransfer.setData('application/x-audio-history', JSON.stringify(entry));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleHistoryDragEnd = useCallback(
    (e: DragEvent<HTMLDivElement>, entry: AudioGenHistoryEntry) => {
      void e;
      // 拖入空白区域时当成 "从历史克隆一条记录到新节点"
      const newId = uuidv4();
      const currentNode = getNode(id);
      const posX = (currentNode?.position.x ?? 0) + (currentNode?.measured?.width ?? 300) + 80;
      const posY = currentNode?.position.y ?? 0;
      addNode({
        id: newId,
        type: 'audio',
        position: { x: posX, y: posY },
        data: {
          name: t('canvas.node.audio.aiGenerated', 'AI 生成'),
          description: '',
          audioUrl: entry.url,
          lyrics: entry.lyrics,
          initialGenConfig: entry,
        } as AudioNodeData,
      });
    },
    [addNode, getNode, id, t],
  );

  const handleHistoryClick = (url: string) => {
    updateNodeData(id, { audioUrl: url } as Partial<AudioNodeData>);
  };

  // ── 计算状态 ──
  const isUploading = !!data.uploading;
  const audioUrl = data.audioUrl || null;
  const hasExistingAudio = !!audioUrl;
  const historyAudios = data.generatedAudios || [];

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

      {/* 隐藏文件输入 */}
      <input
        type="file"
        ref={upload.fileInputRef}
        className="hidden"
        accept={AUDIO_ACCEPT}
        onChange={upload.handleFileChange}
        aria-label={t('canvas.node.upload.uploadAudio', '上传音频')}
        data-testid="audio-file-upload-input"
      />

      <div className="audio-node-wrapper w-full h-full flex flex-col group relative">
        <NodeEffectOverlay nodeId={id} />

        <NodeHeader
          name={data.name || ''}
          isEditing={isEditingTitle}
          editValue={editTitle}
          inputRef={titleInputRef}
          onEdit={(v) => {
            setEditTitle(v);
            updateNodeData(id, { name: v });
          }}
          onEnterEdit={handleEnterTitleEdit}
          onKeyDown={handleTitleKeyDown}
        />

        <AudioNodeToolbar
          isReferenced={isReferenced}
          showAddMenu={showAddMenu}
          onReference={handleReference}
          onAddClick={handleAddClick}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />

        {showAddMenu && (
          <AddAudioMenu
            menuRef={addMenuRef}
            onUploadClick={handleUploadClick}
            onPickFromLibrary={handlePickFromLibrary}
          />
        )}

        <Card
          className={`w-full h-full flex flex-col bg-card ${selected ? 'ring-2 ring-primary' : ''} overflow-hidden relative z-[2]`}
        >
          <CardContent className="flex flex-col items-center justify-center relative custom-scrollbar flex-1 p-4 overflow-hidden">
            {!audioUrl && !isUploading && !upload.uploadError && <EmptyPlaceholder />}

            {audioUrl && !isUploading && (
              <AudioDisplay audioUrl={audioUrl} lyrics={data.lyrics} />
            )}

            {isUploading && <UploadingOverlay progress={upload.uploadProgress} />}

            {upload.uploadError && !isUploading && (
              <UploadErrorOverlay
                message={upload.uploadError}
                onRetry={(e) => { upload.clearError(); handleUploadClick(e); }}
              />
            )}

            <GenerationOverlay active={gen.taskActive} elapsedMs={gen.elapsedMs} />
          </CardContent>
        </Card>

        <EdgeHandles />

        <HistorySidebar
          historyAudios={historyAudios}
          showHistory={showHistory}
          currentAudioUrl={audioUrl}
          onToggle={() => setShowHistory((v) => !v)}
          onClick={handleHistoryClick}
          onDragStart={handleHistoryDragStart}
          onDragEnd={handleHistoryDragEnd}
        />

        <GeneratePanelWrapper
          selected={!!selected}
          pinPanel={!!data.pinPanel}
          taskActive={gen.taskActive}
          taskDone={gen.taskDone}
          taskFailed={gen.taskFailed}
          taskError={gen.musicTask.status?.error_message || null}
          submitError={gen.musicTask.error}
          isSubmitting={gen.musicTask.isSubmitting}
          hasExistingAudio={hasExistingAudio}
          initialConfig={data.initialGenConfig || null}
          nodeId={id}
          canvasNodes={nodes}
          onTogglePinPanel={handleTogglePinPanel}
          onSubmit={gen.submit}
          onStop={gen.musicTask.reset}
          onApplyToNode={gen.applyToNode}
          onApplyToNextNode={gen.applyToNextNode}
          onLinkNode={linkNode}
          onUnlinkNode={unlinkNode}
        />
      </div>

      <AssetPickerPortal
        open={showAssetPicker}
        currentUrl={audioUrl || ''}
        onSelect={handleSelectAsset}
        onClose={() => setShowAssetPicker(false)}
      />
    </>
  );
};

export default memo(AudioNode);
