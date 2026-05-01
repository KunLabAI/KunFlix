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
  onStop?: () => void;
  onSubmit: () => void;
}

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
        title={t('canvas.node.image.advancedSettings', '高级设置')}
      >
        <Settings2 className="w-4 h-4" />
      </button>

      {taskActive ? (
        <button
          type="button"
          onClick={onStop}
          disabled={!onStop}
          className="h-8 w-8 rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center disabled:opacity-60"
          title={t('canvas.node.image.stopGenerate', '停止生成')}
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
          title={t('canvas.node.image.submit', '开始生成')}
        >
          <Send className="h-4 w-4" />
        </button>
      )}
    </>
  );
}

interface ApplyProps {
  hasExistingImage: boolean;
  onApplyToNode: () => void;
  onApplyToNextNode: () => void;
}

export function ApplyButton({ hasExistingImage, onApplyToNode, onApplyToNextNode }: ApplyProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={hasExistingImage ? onApplyToNextNode : onApplyToNode}
      className="w-full h-8 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md transition-all duration-200"
    >
      <ArrowRight className="w-3.5 h-3.5" />
      {hasExistingImage
        ? t('canvas.node.image.applyToNextNode', '应用到新节点')
        : t('canvas.node.image.applyToNode', '应用到当前节点')}
    </button>
  );
}
