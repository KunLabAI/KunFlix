'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Quote, Plus, Copy, Trash2, Pin, PinOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { NodeToolbar, type ToolbarAction } from '../NodeToolbar';
import AudioGeneratePanel from '../AudioGeneratePanel';
import type { CanvasNode, AudioNodeData } from '@/store/useCanvasStore';
import type { MusicCreateParams } from '@/hooks/useMusicGeneration';
import { AssetPickerDialog } from './AssetPickerDialog';

interface ToolbarProps {
  isReferenced: boolean;
  showAddMenu: boolean;
  onReference: (e: React.MouseEvent) => void;
  onAddClick: (e?: React.MouseEvent) => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

/**
 * 顶部工具栏（引用 / 添加 / 复制 / 删除）
 */
export function AudioNodeToolbar({
  isReferenced,
  showAddMenu,
  onReference,
  onAddClick,
  onDuplicate,
  onDelete,
}: ToolbarProps) {
  const { t } = useTranslation();
  const actions: ToolbarAction[] = [
    {
      icon: <Quote className="h-3.5 w-3.5" />,
      onClick: onReference,
      title: isReferenced ? t('canvas.node.toolbar.unreference') : t('canvas.node.toolbar.reference'),
      variant: isReferenced ? 'primary' : undefined,
    },
    {
      icon: <Plus className="h-3.5 w-3.5" />,
      onClick: onAddClick,
      title: t('canvas.node.upload.addAudio', '添加音频'),
    },
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
        showAddMenu && '!opacity-100 !pointer-events-auto !translate-y-0',
      )}
      actions={actions}
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
  hasExistingAudio: boolean;
  initialConfig: AudioNodeData['initialGenConfig'] | null;
  nodeId: string;
  canvasNodes: CanvasNode[];
  onTogglePinPanel: (e?: React.MouseEvent) => void;
  onSubmit: (p: MusicCreateParams) => void;
  onApplyToNode: () => void;
  onApplyToNextNode: () => void;
  onLinkNode: (sourceNodeId: string) => void;
  onUnlinkNode: (sourceNodeId: string) => void;
}

/**
 * 内联 AI 音乐生成面板（卡片下方）+ Pin toggle
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
  hasExistingAudio,
  initialConfig,
  nodeId,
  canvasNodes,
  onTogglePinPanel,
  onSubmit,
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
        title={pinPanel ? t('canvas.node.audio.unpinPanel', '取消固定') : t('canvas.node.audio.pinPanel', '固定面板')}
      >
        {pinPanel ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
      </button>
      <AudioGeneratePanel
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        taskActive={taskActive}
        taskDone={taskDone}
        taskFailed={taskFailed}
        taskError={taskError || t('canvas.node.audio.failedDefault', '音乐生成失败')}
        submitError={submitError}
        hasExistingAudio={hasExistingAudio}
        onApplyToNode={onApplyToNode}
        onApplyToNextNode={onApplyToNextNode}
        canvasNodes={canvasNodes}
        initialConfig={initialConfig || null}
        nodeId={nodeId}
        onLinkNode={onLinkNode}
        onUnlinkNode={onUnlinkNode}
      />
    </div>
  );
}

interface AssetPickerPortalProps {
  open: boolean;
  currentUrl: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}

/**
 * 资产库选择弹窗 Portal 包装
 */
export function AssetPickerPortal({ open, currentUrl, onSelect, onClose }: AssetPickerPortalProps) {
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <AssetPickerDialog currentUrl={currentUrl} onSelect={onSelect} onClose={onClose} />,
    document.body,
  );
}
