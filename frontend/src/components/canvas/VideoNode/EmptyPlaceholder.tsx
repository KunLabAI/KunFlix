'use client';

import React from 'react';
import { Film } from 'lucide-react';

/**
 * 空占位（无视频 + 未上传中 + 未生成中）
 */
export function EmptyPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-8">
      <Film className="w-12 h-12 text-muted-foreground/10" />
    </div>
  );
}
