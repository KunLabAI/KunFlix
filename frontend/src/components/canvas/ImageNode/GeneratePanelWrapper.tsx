'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Quote, Plus, Copy, Trash2, ImageDown, Pin, PinOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { NodeToolbar, type ToolbarAction } from '../NodeToolbar';
import ImageGeneratePanel, { type ImagePanelModeRequest } from '../ImageGeneratePanel';
import type { CharacterNodeData, CanvasNode } from '@/store/useCanvasStore';
import type { ImageCreateParams } from '@/hooks/useImageGeneration';
import { AddImageMenu } from './AddImageMenu';
import { ExportGridMenu } from './ExportGridMenu';
import { AssetPickerDialog } from './AssetPickerDialog';
import { MAX_IMAGES } from './constants';

interface ToolbarProps {
  isReferenced: boolean;
  isFull: boolean;
  isExporting: boolean;
  imageCount: number;
  showAddMenu: boolean;
  showExportDialog: boolean;
  onReference: (e: React.MouseEvent) => void;
  onAddClick: (e?: React.MouseEvent) => void;
  onExportToggle: (e: React.MouseEvent) => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

/**
 * 顶部工具栏（引用 / 添加 / 导出 / 复制 / 删除）
 */
export function ImageNodeToolbar({
  isReferenced,
  isFull,
  isExporting,
  imageCount,
  showAddMenu,
  showExportDialog,
  onReference,
  onAddClick,
  onExportToggle,
  onDuplicate,
  onDelete,
}: ToolbarProps) {
  const { t } = useTranslation();
  const baseActions: ToolbarAction[] = [
    {
      icon: <Quote className="h-3.5 w-3.5" />,
      onClick: onReference,
      title: isReferenced ? t('canvas.node.toolbar.unreference') : t('canvas.node.toolbar.reference'),
      variant: isReferenced ? 'primary' : undefined,
    },
    {
      icon: <Plus className="h-3.5 w-3.5" />,
      onClick: onAddClick,
      title: isFull ? t('canvas.node.upload.maxReached', { max: MAX_IMAGES }) : t('canvas.node.upload.addImage'),
      disabled: isFull,
    },
    ...(imageCount >= 2 ? [{
      icon: <ImageDown className="h-3.5 w-3.5" />,
      onClick: onExportToggle,
      title: isExporting ? t('canvas.node.upload.exporting') : t('canvas.node.upload.exportGrid'),
      disabled: isExporting,
    }] : []),
    {
      icon: <Copy className="h-3.5 w-3.5" />,
      onClick: onDuplicate,
      title: t('canvas.node.toolbar.duplicate'),
    },
    {
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onClick: onDelete,
      title: t('canvas.node.toolbar.delete'),
      variant: 'danger',
    },
  ];

  return (
    <NodeToolbar
      className={cn(
        '!bottom-auto !-top-[64px] !-translate-y-1 group-hover:!translate-y-0',
        (showAddMenu || showExportDialog || isExporting) && '!opacity-100 !pointer-events-auto !translate-y-0',
      )}
      actions={baseActions}
    />
  );
}

interface PanelProps {
  selected: boolean;
  pinPanel: boolean;
  taskActive: boolean;
  taskDone: boolean;
  taskFailed: boolean;
  taskError: string | null;
  submitError: string | null;
  isSubmitting: boolean;
  hasExistingImage: boolean;
  initialConfig: CharacterNodeData['initialGenConfig'] | null;
  nodeId: string;
  canvasNodes: CanvasNode[];
  modeRequest: ImagePanelModeRequest | null;
  onTogglePinPanel: (e?: React.MouseEvent) => void;
  onSubmit: (p: ImageCreateParams) => void;
  onStop: () => void;
  onApplyToNode: () => void;
  onApplyToNextNode: () => void;
  onLinkNode: (sourceNodeId: string) => void;
  onUnlinkNode: (sourceNodeId: string) => void;
}

/**
 * 内联 AI 生成面板（卡片下方）+ Pin toggle
 */
export function GeneratePanelWrapper({
  selected,
  pinPanel,
  taskActive,
  taskDone,
  taskFailed,
  taskError,
  submitError,
  isSubmitting,
  hasExistingImage,
  initialConfig,
  nodeId,
  canvasNodes,
  modeRequest,
  onTogglePinPanel,
  onSubmit,
  onStop,
  onApplyToNode,
  onApplyToNextNode,
  onLinkNode,
  onUnlinkNode,
}: PanelProps) {
  const { t } = useTranslation();
  const visible = selected || pinPanel || taskActive || taskDone || taskFailed;

  return (
    <div
      className={cn(
        'absolute top-full left-0 right-0 mt-1.5 nodrag z-20 transition-opacity duration-150',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none invisible',
      )}
    >
      <button
        type="button"
        onClick={onTogglePinPanel}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          'absolute -top-1 right-1 z-30 h-6 w-6 rounded-md flex items-center justify-center transition-all duration-200',
          pinPanel ? 'text-primary hover:text-primary/80' : 'text-muted-foreground/40 hover:text-muted-foreground/70',
        )}
        title={pinPanel ? t('canvas.node.image.unpinPanel', '取消固定面板') : t('canvas.node.image.pinPanel', '固定面板')}
      >
        {pinPanel ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
      </button>
      <ImageGeneratePanel
        onSubmit={onSubmit}
        onStop={onStop}
        isSubmitting={isSubmitting}
        taskActive={taskActive}
        taskDone={taskDone}
        taskFailed={taskFailed}
        taskError={taskError || t('canvas.node.image.failedDefault', '图像生成失败')}
        submitError={submitError}
        hasExistingImage={hasExistingImage}
        onApplyToNode={onApplyToNode}
        onApplyToNextNode={onApplyToNextNode}
        initialConfig={initialConfig || null}
        nodeId={nodeId}
        canvasNodes={canvasNodes}
        onLinkNode={onLinkNode}
        onUnlinkNode={onUnlinkNode}
        modeRequest={modeRequest}
      />
    </div>
  );
}

interface AssetPickerPortalProps {
  open: boolean;
  imageList: string[];
  onSelect: (url: string) => void;
  onClose: () => void;
}

/**
 * 资产库选择弹窗 Portal 包装
 */
export function AssetPickerPortal({ open, imageList, onSelect, onClose }: AssetPickerPortalProps) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <AssetPickerDialog
      imageList={imageList}
      maxImages={MAX_IMAGES}
      onSelect={onSelect}
      onClose={onClose}
    />,
    document.body,
  );
}

// 转出子组件以统一出口
export { AddImageMenu, ExportGridMenu };
