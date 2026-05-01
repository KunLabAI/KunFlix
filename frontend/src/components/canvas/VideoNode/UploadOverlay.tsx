'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface UploadingProps {
  progress: number;
}

/**
 * 上传进度覆盖层（进度条 + 百分比）
 */
export function UploadingOverlay({ progress }: UploadingProps) {
  return (
    <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-10 p-4">
      <div className="w-full max-w-[200px] h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300 ease-linear"
          style={{ width: `${progress}%` }}
          data-testid="upload-progress-bar"
        />
      </div>
      <span className="text-xs font-medium text-muted-foreground mt-3">
        {Math.round(progress)}%
      </span>
    </div>
  );
}

interface ErrorProps {
  message: string;
  onRetry: (e?: React.MouseEvent) => void;
}

/**
 * 上传错误覆盖层 + 重试按钮
 */
export function UploadErrorOverlay({ message, onRetry }: ErrorProps) {
  const { t } = useTranslation();
  return (
    <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center z-10 p-4 text-center gap-3">
      <div className="text-destructive flex items-center gap-1.5">
        <AlertCircle className="w-4 h-4" />
        <span className="text-sm font-medium">{message}</span>
      </div>
      <Button
        onClick={onRetry}
        variant="outline"
        size="sm"
        role="button"
        aria-label={t('canvas.node.upload.retry')}
        onKeyDown={(e) => {
          (e.key === 'Enter' || e.key === ' ') && (() => {
            e.preventDefault();
            onRetry();
          })();
        }}
      >
        <RefreshCw className="w-3 h-3 mr-2" /> {t('canvas.node.upload.retry')}
      </Button>
    </div>
  );
}
