'use client';

import React from 'react';
import { Settings2, Send, Square, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  taskActive: boolean;
  canSubmit: boolean;
  hasSelectedModel: boolean;
  showConfig: boolean;
  onToggleConfig: () => void;
  onStop: () => void;
  onSubmit: () => void;
}

/** 面板右侧：设置按钮 + 停止/发送 按钮 */
export function PanelActionButtons({
  taskActive,
  canSubmit,
  hasSelectedModel,
  showConfig,
  onToggleConfig,
  onStop,
  onSubmit,
}: Props) {
  const { t } = useTranslation();

  return (
    <>
      <button
        type="button"
        onClick={onToggleConfig}
        disabled={!hasSelectedModel || taskActive}
        className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center',
          'text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          showConfig && 'bg-accent text-foreground',
        )}
        title={t('canvas.node.video.advancedSettings')}
      >
        <Settings2 className="w-4 h-4" />
      </button>

      {taskActive ? (
        <button
          type="button"
          onClick={onStop}
          className="h-8 w-8 rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center"
          title={t('canvas.node.video.stopGenerate')}
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className={cn(
            'h-8 w-8 rounded-lg transition-all duration-200 flex items-center justify-center',
            canSubmit
              ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
          title={t('canvas.node.video.submit')}
        >
          <Send className="h-4 w-4" />
        </button>
      )}
    </>
  );
}

interface ApplyProps {
  hasExistingVideo: boolean;
  onApplyToNode: () => void;
  onApplyToNextNode: () => void;
}

/** 任务完成后的"应用到节点 / 新节点"按钮 */
export function ApplyButton({ hasExistingVideo, onApplyToNode, onApplyToNextNode }: ApplyProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={hasExistingVideo ? onApplyToNextNode : onApplyToNode}
      className="w-full h-8 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md transition-all duration-200"
    >
      <ArrowRight className="w-3.5 h-3.5" />
      {hasExistingVideo
        ? t('canvas.node.video.applyToNextNode')
        : t('canvas.node.video.applyToNode')}
    </button>
  );
}
