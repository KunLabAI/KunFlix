'use client';

import React from 'react';
import { Settings2, Send, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useCreditsGuard } from '@/hooks/useCreditsGuard';

interface Props {
  taskActive: boolean;
  canSubmit: boolean;
  hasSelectedModel: boolean;
  showConfig: boolean;
  onToggleConfig: () => void;
  onSubmit: () => void;
}

export function PanelActionButtons({
  taskActive,
  canSubmit,
  hasSelectedModel,
  showConfig,
  onToggleConfig,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const { creditsExhausted, tooltipText } = useCreditsGuard();
  // 任务进行中：发送按钮静默禁用（不再提供中断能力）
  const submitDisabled = !canSubmit || creditsExhausted || taskActive;
  const submitTitle = taskActive
    ? t('canvas.node.image.generating', '生成中')
    : creditsExhausted
      ? tooltipText
      : t('canvas.node.image.submit', '开始生成');

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

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitDisabled}
        className={cn(
          'h-8 w-8 rounded-lg transition-all duration-200 flex items-center justify-center',
          submitDisabled
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md',
        )}
        title={submitTitle}
      >
        <Send className="h-4 w-4" />
      </button>
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
